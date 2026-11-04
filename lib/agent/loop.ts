import type { AnalysisContract } from "../analysis-schema";
import { computeCost, type TokenUsage } from "../ai-cost";
import type { AnalyzeFrame } from "../frame-extraction";
import type { AnalysisDepth, AnalysisLocale } from "../types";
import {
  buildContext,
  renderContext,
  factsFromToolResults,
  type ContextBudget,
  type ContextBundle,
  type SessionFact,
  type SessionState,
} from "./context";
import type { CheckpointStore } from "./context/checkpoint";
import type { MemoryHit, MemoryProfile, MemoryWriteDecision } from "./memory";
import type {
  AgentModel,
  AgentModelAction,
  AgentTranscriptEntry,
} from "./model/types";
import type { Sandbox } from "./sandbox/runner";
import type { ToolResult } from "./sandbox/types";
import {
  buildFeedback,
  formatFeedback,
  DEFAULT_REPAIR_POLICY,
  type RepairFeedback,
  type RepairPolicy,
} from "./validate/repair";
import type { ValidationIssue } from "./validate/types";
import { validateReport } from "./validate";
import type {
  AgentRunEvent,
  AgentRunRecord,
  AgentUsageRecord,
} from "./run-types";

export type AgentBudget = {
  /** 包含修复在内，最多调用几次模型 */
  maxModelTurns: number;
  /** 最多执行几次工具 */
  maxSteps: number;
  /** 单次运行墙钟上限 */
  maxWallMs: number;
  /** 估算/真实的 token 上限 */
  maxTotalTokens: number;
  /** 估算成本上限（USD） */
  maxCostUsd: number;
};

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxModelTurns: 4,
  maxSteps: 6,
  maxWallMs: 45_000,
  maxTotalTokens: 48_000,
  maxCostUsd: 0.2,
};

/** Agent 的任务提示词比普通问答长，默认 400 token 的 task 分区会被截断。 */
export const AGENT_CONTEXT_BUDGET: ContextBudget = {
  total: 12_000,
  policy: 1_000,
  profile: 400,
  session: 1_800,
  memory: 1_000,
  tools: 3_000,
  task: 4_000,
};

export type AgentAttempt = {
  attempt: number;
  ok: boolean;
  issues: ValidationIssue[];
  raw: string;
  durationMs: number;
};

export type RunAgentInput = {
  runId: string;
  model: AgentModel;
  modelId: string;
  sandbox: Sandbox;
  session: SessionState;
  profile?: MemoryProfile | null;
  memories?: MemoryHit[];
  policy: string;
  task: string;
  frames: AnalyzeFrame[];
  durationSec: number;
  locale: AnalysisLocale;
  depth: AnalysisDepth;
  /** 本次请求是否带姿态证据；带证据时模型必须先调用工具再写结论 */
  hasPoseEvidence?: boolean;
  budget?: Partial<AgentBudget>;
  repairPolicy?: Partial<RepairPolicy>;
  contextBudget?: ContextBudget;
  checkpoint?: CheckpointStore;
  writeMemory?: (input: {
    runId: string;
    contract: AnalysisContract;
    facts: SessionFact[];
  }) => Promise<MemoryWriteDecision | null>;
  now?: () => Date;
  onEvent?: (event: AgentRunEvent) => void;
  signal?: AbortSignal;
};

export type AgentOutcome = {
  ok: boolean;
  raw: string;
  contract: AnalysisContract | null;
  attempts: AgentAttempt[];
  record: AgentRunRecord;
  contextDigest: string;
  memory?: MemoryWriteDecision | null;
  failure?: string;
};

function cloneFacts(facts: SessionFact[]): SessionFact[] {
  return facts.map((fact) => ({ ...fact }));
}

function mergeFacts(
  existing: SessionFact[],
  incoming: SessionFact[]
): SessionFact[] {
  const byId = new Map(existing.map((fact) => [fact.id, fact]));
  for (const fact of incoming) byId.set(fact.id, fact);
  return [...byId.values()].sort(
    (a, b) => a.atSec - b.atSec || a.id.localeCompare(b.id)
  );
}

function toolResultText(result: ToolResult): string {
  const status = result.ok
    ? "ok"
    : `失败 ${result.error?.code ?? "E_INTERNAL"}`;
  const payload =
    result.data === undefined
      ? result.stdout || result.stderr
      : JSON.stringify(result.data);
  return `工具 ${result.tool} ${status}（${result.durationMs}ms）：${payload.slice(
    0,
    1_200
  )}`;
}

function uniqueClasses(issues: ValidationIssue[]): Array<
  ValidationIssue["class"]
> {
  return [...new Set(issues.map((issue) => issue.class))];
}

function estimateTurnUsage(
  usage: AgentUsageRecord,
  turnTokens: AgentUsageRecord | null,
  outputText: string,
  frameCount: number
): AgentUsageRecord {
  if (turnTokens && turnTokens.totalTokens > 0) {
    return {
      promptTokens: usage.promptTokens + turnTokens.promptTokens,
      outputTokens: usage.outputTokens + turnTokens.outputTokens,
      totalTokens: usage.totalTokens + turnTokens.totalTokens,
      cachedTokens: usage.cachedTokens + turnTokens.cachedTokens,
    };
  }

  // provider 没给 usage 时的保守估算：图片按 258 token/张，文本按字符/2。
  const estimatedPrompt = 1_200 + frameCount * 258;
  const estimatedOutput = Math.ceil(outputText.length / 2);
  return {
    promptTokens: usage.promptTokens + estimatedPrompt,
    outputTokens: usage.outputTokens + estimatedOutput,
    totalTokens: usage.totalTokens + estimatedPrompt + estimatedOutput,
    cachedTokens: usage.cachedTokens,
  };
}

function usageToTokenUsage(usage: AgentUsageRecord): TokenUsage {
  return {
    inputTextTokens: Math.max(
      0,
      usage.promptTokens - Math.round(usage.cachedTokens)
    ),
    cachedInputTokens: usage.cachedTokens,
    outputTokens: usage.outputTokens,
  };
}

/**
 * 顶层 Agent 循环：
 * 模型 -> 工具 -> 事实 -> 上下文 -> 模型 -> 校验 -> 修复/交付。
 *
 * 它不直接调模型 SDK，也不直接执行工具：所有生成来自注入的 AgentModel，
 * 所有工具调用走注入的 Sandbox，所有事实来自 ToolResult。
 */
export async function runAgent(input: RunAgentInput): Promise<AgentOutcome> {
  const budget: AgentBudget = { ...DEFAULT_AGENT_BUDGET, ...input.budget };
  const policy: RepairPolicy = {
    ...DEFAULT_REPAIR_POLICY,
    ...input.repairPolicy,
    budgets: {
      ...DEFAULT_REPAIR_POLICY.budgets,
      ...input.repairPolicy?.budgets,
    },
  };
  const contextBudget = input.contextBudget ?? AGENT_CONTEXT_BUDGET;
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const startedMs = startedAt.getTime();

  let session: SessionState = {
    ...input.session,
    facts: cloneFacts(input.session.facts),
  };
  let toolResults: ToolResult[] = [];
  const transcript: AgentTranscriptEntry[] = [];
  const attempts: AgentAttempt[] = [];
  const remaining = { ...policy.budgets };
  let feedback: RepairFeedback | null = null;
  let feedbackText: string | null = null;
  let lastRaw = "";
  let lastContract: AnalysisContract | null = null;
  let lastIssues: ValidationIssue[] = [];
  let usage: AgentUsageRecord = {
    promptTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
  };
  let failure: string | undefined;
  let context: ContextBundle = buildContext(
    {
      policy: input.policy,
      profile: input.profile,
      session,
      memories: input.memories,
      tools: toolResults,
      task: input.task,
    },
    { budget: contextBudget }
  );
  let modelTurns = 0;
  let steps = 0;
  let ok = false;
  let memory: MemoryWriteDecision | null | undefined;

  const emit = (event: AgentRunEvent) => {
    try {
      input.onEvent?.(event);
    } catch {
      /* 进度回调不能影响分析 */
    }
  };

  const checkpoint = async (step: number) => {
    if (!input.checkpoint) return;
    try {
      await input.checkpoint.save({
        runId: input.runId,
        step,
        at: now().toISOString(),
        stateDigest: `${session.facts.length}:${session.facts.at(-1)?.id ?? ""}`,
        contextDigest: context.digest,
        state: session,
        context,
      });
    } catch {
      /* 检查点失败不阻断分析 */
    }
  };

  while (modelTurns < budget.maxModelTurns) {
    if (input.signal?.aborted) {
      failure = "aborted";
      break;
    }
    if (Date.now() - startedMs > budget.maxWallMs) {
      failure = "wall-clock-budget";
      break;
    }
    if (
      usage.totalTokens > budget.maxTotalTokens ||
      computeCost("deepseek-flash", usageToTokenUsage(usage)).totalCostUsd >
        budget.maxCostUsd
    ) {
      failure = "token-or-cost-budget";
      break;
    }

    modelTurns += 1;
    emit({
      type: "model",
      step: modelTurns,
      message:
        input.locale === "zh"
          ? `第 ${modelTurns} 轮：模型正在决定下一步`
          : `Turn ${modelTurns}: model is deciding the next step`,
    });

    let turn;
    try {
      turn = await input.model.next({
        system: input.policy,
        contextText: renderContext(context),
        task: input.task,
        frames: input.frames,
        tools: input.sandbox.catalog(),
        transcript,
        attempt: modelTurns,
        feedbackText,
        signal: input.signal,
      });
    } catch (err) {
      failure = `model-error: ${(err as Error).message}`;
      break;
    }

    usage = estimateTurnUsage(
      usage,
      turn.usage
        ? {
            promptTokens: turn.usage.promptTokens,
            outputTokens: turn.usage.outputTokens,
            totalTokens: turn.usage.totalTokens,
            cachedTokens: turn.usage.cachedTokens,
          }
        : null,
      turn.raw,
      input.frames.length
    );

    if (turn.raw.trim()) {
      transcript.push({ role: "assistant", text: turn.raw });
    }

    let finalAction: Extract<AgentModelAction, { type: "final" }> | null = null;
    let turnHadTool = false;

    for (const action of turn.actions) {
      if (action.type === "tool") {
        if (steps >= budget.maxSteps) {
          failure = "step-budget";
          break;
        }
        steps += 1;
        emit({
          type: "tool",
          step: steps,
          tool: action.tool,
          message:
            input.locale === "zh"
              ? `调用工具 ${action.tool}`
              : `Calling tool ${action.tool}`,
        });

        const result = await input.sandbox.run(action.tool, action.args);
        toolResults = [...toolResults, result];
        session = {
          ...session,
          facts: mergeFacts(
            session.facts,
            factsFromToolResults([result])
          ),
        };
        transcript.push({
          role: "user",
          text: toolResultText(result),
          attachments: result.attachments,
        });
        context = buildContext(
          {
            policy: input.policy,
            profile: input.profile,
            session,
            memories: input.memories,
            tools: toolResults,
            task: input.task,
          },
          { budget: contextBudget }
        );
        await checkpoint(modelTurns * 100 + steps);
        turnHadTool = true;
        emit({
          type: "tool",
          step: steps,
          tool: action.tool,
          ok: result.ok,
          message: result.ok
            ? input.locale === "zh"
              ? `${action.tool} 完成`
              : `${action.tool} finished`
            : input.locale === "zh"
              ? `${action.tool} 失败：${result.error?.code ?? "E_INTERNAL"}`
              : `${action.tool} failed: ${result.error?.code ?? "E_INTERNAL"}`,
        });
        continue;
      }

      finalAction = action;
      break;
    }

    if (failure) break;

    if (!finalAction) {
      if (!turnHadTool) {
        failure = "model-returned-no-action";
        break;
      }
      emit({
        type: "model",
        step: modelTurns,
        message:
          input.locale === "zh"
            ? "工具结果已回填，继续下一轮"
            : "Tool results added; continuing",
      });
      continue;
    }

    const raw =
      finalAction.raw ??
      (typeof finalAction.report === "string"
        ? finalAction.report
        : JSON.stringify(finalAction.report));
    lastRaw = raw;

    const poseToolUsed = toolResults.some(
      (item) => item.tool === "pose.analyze" && item.ok
    );
    const result = validateReport(raw, {
      durationSec: input.durationSec,
      facts: session.facts,
      requireEvidence:
        session.facts.length > 0 ||
        (input.hasPoseEvidence === true && !poseToolUsed),
      minSegments: input.depth === "light" ? 2 : 3,
      evidenceToleranceSec: 2.5,
    });
    lastContract = result.contract;
    lastIssues = result.issues;
    attempts.push({
      attempt: modelTurns,
      ok: result.ok,
      issues: result.issues,
      raw,
      durationMs: turn.latencyMs,
    });
    await checkpoint(modelTurns * 100 + 99);

    emit({
      type: "validation",
      step: modelTurns,
      ok: result.ok,
      message: result.ok
        ? input.locale === "zh"
          ? "报告校验通过"
          : "Report passed validation"
        : input.locale === "zh"
          ? `报告校验未通过：${result.issues.map((issue) => issue.code).join("、")}`
          : `Report failed: ${result.issues.map((issue) => issue.code).join(", ")}`,
    });

    if (result.ok) {
      ok = true;
      break;
    }

    const classes = uniqueClasses(result.issues);
    if (classes.some((item) => remaining[item] <= 0)) {
      failure = "repair-budget";
      break;
    }
    for (const item of classes) remaining[item] -= 1;

    feedback = buildFeedback(modelTurns + 1, result.issues);
    feedbackText = formatFeedback(feedback);
    transcript.push({ role: "user", text: feedbackText });
    context = buildContext(
      {
        policy: input.policy,
        profile: input.profile,
        session,
        memories: input.memories,
        tools: toolResults,
        task: `${input.task}\n\n${feedbackText}`,
      },
      { budget: contextBudget }
    );
    emit({
      type: "validation",
      step: modelTurns,
      message:
        input.locale === "zh"
          ? `已生成修复反馈（第 ${modelTurns + 1} 次尝试）`
          : `Repair feedback generated (attempt ${modelTurns + 1})`,
    });
  }

  if (!ok && !failure) {
    failure =
      modelTurns >= budget.maxModelTurns
        ? "model-turn-budget"
        : "validation-failed";
  }

  if (ok && lastContract && input.writeMemory) {
    try {
      memory = await input.writeMemory({
        runId: input.runId,
        contract: lastContract,
        facts: session.facts,
      });
      emit({
        type: "memory",
        message: memory
          ? input.locale === "zh"
            ? `记忆写入：${memory.code}`
            : `Memory write: ${memory.code}`
          : input.locale === "zh"
            ? "本次没有写入记忆"
            : "No memory written",
        ok: memory?.written,
      });
    } catch (err) {
      memory = {
        written: false,
        code: "INVALID",
        message: `记忆写入失败：${(err as Error).message}`,
      };
    }
  }

  const finishedAt = now();
  const cost = computeCost(
    "deepseek-flash",
    usageToTokenUsage(usage)
  );
  const trace = input.sandbox.trace();
  const record: AgentRunRecord = {
    version: 1,
    runId: input.runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ok,
    model: input.modelId,
    attempts: modelTurns,
    steps,
    toolCalls: trace.map((event) => ({
      tool: event.tool,
      ok: event.ok,
      durationMs: event.durationMs,
      errorCode: event.errorCode,
      replay: event.replay,
    })),
    validation: {
      ok: lastIssues.length === 0 && lastContract !== null,
      codes: [...new Set(lastIssues.map((issue) => issue.code))],
      issues: lastIssues.length,
    },
    usage,
    costUsd: cost.totalCostUsd,
    contextDigest: context.digest,
    ...(memory
      ? {
          memory: {
            written: memory.written,
            code: memory.code,
            message: memory.message,
          },
        }
      : {}),
    ...(failure ? { failure } : {}),
  };

  emit({
    type: "done",
    ok,
    message: ok
      ? input.locale === "zh"
        ? "Agent 分析完成"
        : "Agent analysis completed"
      : input.locale === "zh"
        ? `Agent 分析失败：${failure ?? "unknown"}`
        : `Agent failed: ${failure ?? "unknown"}`,
  });

  return {
    ok,
    raw: lastRaw,
    contract: lastContract,
    attempts,
    record,
    contextDigest: context.digest,
    memory,
    failure,
  };
}
