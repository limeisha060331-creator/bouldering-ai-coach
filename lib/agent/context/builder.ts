import { createHash } from "node:crypto";
import type { MemoryHit } from "../memory/types";
import { stableStringify } from "../sandbox/stable-json";
import type { ToolResult } from "../sandbox/types";
import { estimateTokens, truncateText } from "./tokens";
import type {
  ContextBudget,
  ContextBundle,
  ContextInput,
  ContextSection,
  DroppedItem,
  SectionId,
  SessionState,
} from "./types";

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  total: 6_000,
  policy: 600,
  profile: 400,
  session: 1_400,
  memory: 1_200,
  tools: 2_000,
  task: 400,
};

const TITLES: Record<SectionId, string> = {
  policy: "系统策略",
  profile: "用户档案",
  session: "本次训练",
  memory: "可比历史",
  tools: "工具结果",
  task: "当前任务",
};

/**
 * 组装顺序固定：策略 -> 档案 -> 本次状态 -> 历史记忆 -> 工具结果 -> 任务。
 * 裁剪规则全部是规则，不是模型判断——否则同一输入两次跑会得到不同上下文。
 */
export function buildContext(
  input: ContextInput,
  options: { budget?: ContextBudget } = {}
): ContextBundle {
  const budget = options.budget ?? DEFAULT_CONTEXT_BUDGET;
  const dropped: DroppedItem[] = [];
  const sections: ContextSection[] = [
    makeSection("policy", input.policy, budget.policy, "head"),
    makeSection("profile", profileText(input.profile), budget.profile, "head"),
    sessionSection(input.session, budget.session),
    memorySection(input.memories ?? [], budget.memory, dropped),
    toolsSection(input.tools ?? [], budget.tools),
    makeSection("task", input.task, budget.task, "head"),
  ];

  const totalTokens = sections.reduce((sum, item) => sum + item.tokens, 0);
  const digest = createHash("sha256")
    .update(
      stableStringify(
        sections.map((item) => ({ id: item.id, content: item.content }))
      )
    )
    .digest("hex")
    .slice(0, 16);

  return { sections, budget: budget.total, totalTokens, dropped, digest };
}

export function renderContext(bundle: ContextBundle): string {
  return bundle.sections
    .filter((section) => section.content.trim().length > 0)
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n");
}

function makeSection(
  id: SectionId,
  raw: string,
  maxTokens: number,
  keep: "head" | "tail"
): ContextSection {
  const trimmed = raw.trim();
  const result = truncateText(trimmed, maxTokens, keep);
  return {
    id,
    title: TITLES[id],
    content: result.text,
    tokens: estimateTokens(result.text),
    truncated: result.truncated,
  };
}

function profileText(profile: ContextInput["profile"]): string {
  if (!profile) return "";
  return [
    `水平：${profile.level}`,
    `目标：${profile.goals.join("、") || "未填写"}`,
    `伤病：${profile.injuries.join("、") || "无"}`,
    `语言：${profile.language}`,
    `语气：${profile.tone}`,
  ].join("；");
}

function sessionSection(state: SessionState, maxTokens: number): ContextSection {
  const header = [
    `session ${state.sessionId}`,
    `难度 ${state.grade ?? "未标"}`,
    `机位 ${state.angle}`,
    `状态 ${state.status}`,
  ].join(" · ");

  const factLines = state.facts.map((fact) => {
    const where = fact.bodyPart ? ` ${fact.bodyPart}` : "";
    return `- ${fact.atSec.toFixed(1)}s${where}：${fact.detail}（置信 ${fact.confidence.toFixed(2)}）`;
  });
  const questionLines = state.openQuestions.map((item) => `- ${item}`);

  const compose = (facts: string[], questions: string[]) =>
    [
      header,
      ...(facts.length > 0 ? ["事实：", ...facts] : []),
      ...(questions.length > 0 ? ["待确认：", ...questions] : []),
    ].join("\n");

  let facts = [...factLines];
  let questions = [...questionLines];
  let content = compose(facts, questions);
  let truncated = false;

  // 预算不够时先丢最早的事实，再丢末尾的待确认项
  while (estimateTokens(content) > maxTokens && facts.length > 0) {
    facts = facts.slice(1);
    truncated = true;
    content = compose(facts, questions);
  }
  while (estimateTokens(content) > maxTokens && questions.length > 0) {
    questions = questions.slice(0, -1);
    truncated = true;
    content = compose(facts, questions);
  }

  if (estimateTokens(content) > maxTokens) {
    const result = truncateText(content, maxTokens, "tail");
    content = result.text;
    truncated = true;
  }

  return {
    id: "session",
    title: TITLES.session,
    content,
    tokens: estimateTokens(content),
    truncated,
  };
}

function memorySection(
  hits: MemoryHit[],
  maxTokens: number,
  dropped: DroppedItem[]
): ContextSection {
  const ordered = [...hits].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.episode.at !== b.episode.at) {
      return a.episode.at < b.episode.at ? 1 : -1;
    }
    return a.episode.id.localeCompare(b.episode.id);
  });

  const lines: string[] = [];
  let used = 0;

  for (const hit of ordered) {
    const line = formatHit(hit);
    const cost = estimateTokens(line) + 1;
    if (used + cost > maxTokens) {
      dropped.push({
        section: "memory",
        id: hit.episode.id,
        reason: "budget",
      });
      continue;
    }
    lines.push(line);
    used += cost;
  }

  const content = lines.join("\n");
  return {
    id: "memory",
    title: TITLES.memory,
    content,
    tokens: estimateTokens(content),
    truncated: dropped.some((item) => item.section === "memory"),
  };
}

function formatHit(hit: MemoryHit): string {
  const issues = hit.episode.issues
    .slice(0, 3)
    .map((issue) => `${issue.bodyPart}${issue.detail}`)
    .join("；");
  return `- ${hit.episode.at.slice(0, 10)} ${hit.episode.grade}/${hit.episode.angle}：${issues}（${hit.reason}）`;
}

function toolsSection(
  results: ToolResult[],
  maxTokens: number
): ContextSection {
  if (results.length === 0) {
    return {
      id: "tools",
      title: TITLES.tools,
      content: "",
      tokens: 0,
      truncated: false,
    };
  }

  // 新的在前，预算不够先丢最旧的
  const newestFirst = [...results].reverse();
  const kept: string[] = [];
  let used = 0;
  let dropped = 0;

  for (const result of newestFirst) {
    const line = formatToolResult(result);
    const cost = estimateTokens(line) + 1;
    if (used + cost > maxTokens) {
      dropped += 1;
      continue;
    }
    kept.push(line);
    used += cost;
  }

  const marker =
    dropped > 0 ? `（较早 ${dropped} 条工具结果已省略）` : "";
  const content = [marker, ...kept].filter(Boolean).join("\n");

  return {
    id: "tools",
    title: TITLES.tools,
    content,
    tokens: estimateTokens(content),
    truncated: dropped > 0,
  };
}

function formatToolResult(result: ToolResult): string {
  const status = result.ok
    ? "ok"
    : `失败 ${result.error?.code ?? "E_INTERNAL"}`;

  let summary = "";
  if (result.data !== undefined) {
    summary = JSON.stringify(result.data);
  } else {
    summary = result.stdout || result.stderr;
  }
  summary = summary.replace(/\s+/g, " ").trim();
  if (summary.length > 240) summary = `${summary.slice(0, 240)}…`;

  return `- ${result.tool} ${status} ${result.durationMs}ms：${summary}`;
}
