import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AnalysisContract } from "../analysis-schema";
import type { AnalyzeFrame } from "../frame-extraction";
import type { PoseEvidence } from "../pose-types";
import type { AnalysisDepth, AnalysisLocale, BoulderGrade } from "../types";
import { isSupabaseAdminConfigured } from "../supabase/config";
import {
  MemoryStore,
  type MemoryHit,
  type MemoryWriteDecision,
} from "./memory";
import { createSupabaseMemoryPersistence } from "./memory/supabase-persistence";
import {
  DeepSeekAgentModel,
  type AgentModel,
  type AgentModelAction,
} from "./model";
import { CheckpointStore } from "./context/checkpoint";
import { buildAgentPolicy, buildAgentTask } from "./policy";
import { runAgent, type AgentBudget, type AgentOutcome } from "./loop";
import { Sandbox } from "./sandbox/runner";
import { createWebAgentTools } from "./tools";
import type { AgentRunEvent } from "./run-types";
import type { SessionFact } from "./context/types";

export type WebAgentInput = {
  runId: string;
  userId?: string;
  grade?: BoulderGrade;
  frames: AnalyzeFrame[];
  pose: PoseEvidence | null;
  durationSec: number;
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onEvent?: (event: AgentRunEvent) => void;
  now?: () => Date;
  budget?: Partial<AgentBudget>;
  /** 测试注入；生产不传 */
  modelImpl?: AgentModel;
  memory?: MemoryStore | null;
};

export type WebAgentResult = {
  analysis: string;
  contract: AnalysisContract;
  outcome: AgentOutcome;
};

export class AgentAnalysisError extends Error {
  constructor(
    message: string,
    readonly outcome: AgentOutcome
  ) {
    super(message);
    this.name = "AgentAnalysisError";
  }
}

function toSeconds(value: string): number {
  const [minutes, seconds] = value.split(":");
  return Number.parseInt(minutes, 10) * 60 + Number.parseInt(seconds, 10);
}

function buildMemoryInput(args: {
  runId: string;
  userId: string;
  grade?: BoulderGrade;
  contract: AnalysisContract;
  facts: SessionFact[];
  now: () => Date;
}): {
  userId: string;
  at: string;
  grade: BoulderGrade;
  angle: "unknown";
  lighting: "unknown";
  issues: Array<{
    bodyPart: string;
    detail: string;
    atSec: number;
    confidence: number;
  }>;
  plan?: string[];
  sourceSessionId: string;
} | null {
  const grade = args.contract.grade ?? args.grade;
  if (!grade) return null;

  const segments = args.contract.segments;
  const issues = args.facts
    .filter(
      (fact) =>
        fact.kind !== "constraint" &&
        fact.confidence >= 0.6 &&
        segments.some(
          (segment) => Math.abs(toSeconds(segment.t) - fact.atSec) <= 2.5
        )
    )
    .slice(0, 6)
    .map((fact) => ({
      bodyPart: fact.bodyPart ?? "动作",
      detail: fact.detail,
      atSec: fact.atSec,
      confidence: fact.confidence,
    }));

  if (issues.length === 0) return null;

  return {
    userId: args.userId,
    at: args.now().toISOString(),
    grade,
    angle: "unknown",
    lighting: "unknown",
    issues,
    plan: (args.contract.improvements ?? [])
      .map((item) => item.title)
      .slice(0, 4),
    sourceSessionId: args.runId,
  };
}

async function createMemory(
  input: WebAgentInput
): Promise<MemoryStore | null> {
  if (input.memory !== undefined) return input.memory;
  if (!input.userId) return null;

  if (isSupabaseAdminConfigured()) {
    return new MemoryStore("", {
      persistence: createSupabaseMemoryPersistence(input.userId),
    });
  }

  // 本地开发没有 Supabase 时，用临时文件模拟持久化；进程重启会清空。
  const file = path.join(
    tmpdir(),
    "crux-agent-memory",
    `${input.userId}.json`
  );
  return new MemoryStore(file);
}

/**
 * 网页端 Agent 入口。
 * 只依赖关键帧、可选的姿态证据和服务端环境变量；不依赖原视频或本机 ffmpeg。
 */
export async function runWebAgentAnalysis(
  input: WebAgentInput
): Promise<WebAgentResult> {
  const now = input.now ?? (() => new Date());
  const workspace = path.join(tmpdir(), "crux-agent", input.runId);
  mkdirSync(workspace, { recursive: true });

  const memory = await createMemory(input);
  if (memory) {
    try {
      await memory.load();
    } catch {
      /* 记忆不可用时仍继续分析 */
    }
  }

  let memories: MemoryHit[] = [];
  if (memory && input.userId && input.grade) {
    try {
      memories = await memory.retrieve(input.userId, {
        grade: input.grade,
        angle: "unknown",
        lighting: "unknown",
        limit: 3,
      });
    } catch {
      memories = [];
    }
  }

  const tools = createWebAgentTools({
    frames: input.frames,
    pose: input.pose,
    memory,
    userId: input.userId ?? "anonymous",
    grade: input.grade,
    locale: input.locale,
  });

  const sandbox = new Sandbox({
    workspace,
    tools,
    mode: "off",
    limits: {
      maxSteps: 6,
      defaultTimeoutMs: 8_000,
      maxTimeoutMs: 20_000,
      maxOutputBytes: 200_000,
    },
  });

  const model =
    input.modelImpl ??
    new DeepSeekAgentModel({
      apiKey: input.apiKey,
      model: input.model,
      depth: input.depth,
      baseUrl: input.baseUrl,
      fetchImpl: input.fetchImpl,
      timeoutMs: 28_000,
    });

  const outcome = await runAgent({
    runId: input.runId,
    model,
    modelId: input.model,
    sandbox,
    session: {
      sessionId: input.runId,
      userId: input.userId ?? "anonymous",
      grade: input.grade ?? null,
      angle: "unknown",
      startedAt: now().toISOString(),
      status: "active",
      facts: [],
      openQuestions: [],
    },
    memories,
    policy: buildAgentPolicy(input.locale),
    task: buildAgentTask({
      depth: input.depth,
      locale: input.locale,
      durationSec: input.durationSec,
      frameCount: input.frames.length,
      hasPose: Boolean(input.pose),
    }),
    frames: input.frames,
    durationSec: input.durationSec,
    locale: input.locale,
    depth: input.depth,
    hasPoseEvidence: Boolean(input.pose),
    budget: {
      maxModelTurns: 3,
      maxSteps: 4,
      maxWallMs: 30_000,
      maxTotalTokens: 42_000,
      maxCostUsd: 0.18,
      ...input.budget,
    },
    checkpoint: new CheckpointStore(
      path.join(workspace, "checkpoints.jsonl")
    ),
    writeMemory:
      memory && input.userId
        ? async ({
            runId,
            contract,
            facts,
          }): Promise<MemoryWriteDecision | null> => {
            const episode = buildMemoryInput({
              runId,
              userId: input.userId!,
              grade: input.grade,
              contract,
              facts,
              now,
            });
            if (!episode) {
              return {
                written: false,
                code: "LOW_CONFIDENCE",
                message: "没有可写入的高置信问题，或缺少难度",
              };
            }
            return memory.addEpisode(episode);
          }
        : undefined,
    now,
    onEvent: input.onEvent,
    signal: input.signal,
  });

  if (!outcome.ok || !outcome.contract) {
    throw new AgentAnalysisError(
      outcome.failure
        ? `Agent 分析未通过：${outcome.failure}`
        : "Agent 未产出可用的分析报告",
      outcome
    );
  }

  return {
    analysis: outcome.raw || JSON.stringify(outcome.contract),
    contract: outcome.contract,
    outcome,
  };
}

export type { AgentModelAction };
