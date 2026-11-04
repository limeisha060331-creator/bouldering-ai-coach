import type { AnalysisContract } from "../../analysis-schema";
import type {
  ErrorClass,
  ValidationIssue,
  ValidationResult,
} from "./types";

export type RepairPolicy = {
  /** 包含首次生成在内，最多生成几次 */
  maxAttempts: number;
  /** 每一类错误允许的修复次数；E4 默认 0 次 */
  budgets: Record<ErrorClass, number>;
};

export const DEFAULT_REPAIR_POLICY: RepairPolicy = {
  maxAttempts: 3,
  budgets: { E1: 2, E2: 1, E3: 1, E4: 0 },
};

export type RepairFeedback = {
  attempt: number;
  issues: Array<{
    class: ErrorClass;
    code: string;
    path: string;
    expected?: string;
    actual?: string;
    fixHint: string;
  }>;
  rules: string[];
};

export type GenerateFn = (input: {
  attempt: number;
  feedback: RepairFeedback | null;
  feedbackText: string | null;
}) => Promise<string>;

export type RepairAttempt = {
  attempt: number;
  ok: boolean;
  issues: ValidationIssue[];
  raw: string;
  durationMs: number;
};

export type RepairTelemetry = {
  attempts: number;
  firstPass: boolean;
  repaired: boolean;
  exhausted: boolean;
  codes: string[];
  byClass: Record<ErrorClass, number>;
  totalMs: number;
};

export type RepairOutcome = {
  ok: boolean;
  raw: string;
  contract: AnalysisContract | null;
  attempts: RepairAttempt[];
  telemetry: RepairTelemetry;
};

const RULES = [
  "只输出一个 JSON 对象，不要解释文字",
  "E2 类错误必须重新调用工具拿证据，不允许只改时间戳或措辞",
  "E4 类错误不重试，直接拒答",
];

export function buildFeedback(
  attempt: number,
  issues: ValidationIssue[]
): RepairFeedback {
  return {
    attempt,
    issues: issues.map((item) => ({
      class: item.class,
      code: item.code,
      path: item.path,
      expected: item.expected,
      actual: item.actual,
      fixHint: item.fixHint,
    })),
    rules: RULES,
  };
}

export function formatFeedback(feedback: RepairFeedback): string {
  const lines = [`第 ${feedback.attempt} 次校验未通过：`];
  for (const item of feedback.issues) {
    const detail = [item.actual, item.expected]
      .filter(Boolean)
      .join(" -> ");
    lines.push(
      `- [${item.class}] ${item.path} ${item.code}${detail ? `：${detail}` : ""}；${item.fixHint}`
    );
  }
  for (const rule of feedback.rules) {
    lines.push(`- 规则：${rule}`);
  }
  return lines.join("\n");
}

/**
 * 校验 -> 结构化反馈 -> 再生成，直到通过或预算耗尽。
 * E4 没有重试预算：让模型重试安全红线，等于教它绕过拦截。
 */
export async function runRepairLoop(args: {
  generate: GenerateFn;
  validate: (raw: string) => ValidationResult;
  policy?: Partial<RepairPolicy>;
}): Promise<RepairOutcome> {
  const policy: RepairPolicy = {
    ...DEFAULT_REPAIR_POLICY,
    ...args.policy,
    budgets: {
      ...DEFAULT_REPAIR_POLICY.budgets,
      ...args.policy?.budgets,
    },
  };

  const remaining: Record<ErrorClass, number> = { ...policy.budgets };
  const attempts: RepairAttempt[] = [];
  const byClass: Record<ErrorClass, number> = { E1: 0, E2: 0, E3: 0, E4: 0 };
  const codes = new Set<string>();
  const startedAt = Date.now();

  let feedback: RepairFeedback | null = null;
  let lastRaw = "";
  let lastContract: AnalysisContract | null = null;
  let exhausted = false;

  while (attempts.length < policy.maxAttempts) {
    const attempt = attempts.length + 1;
    const attemptStartedAt = Date.now();
    const raw = await args.generate({
      attempt,
      feedback,
      feedbackText: feedback ? formatFeedback(feedback) : null,
    });
    const result = args.validate(raw);
    lastRaw = raw;
    lastContract = result.contract;

    attempts.push({
      attempt,
      ok: result.ok,
      issues: result.issues,
      raw,
      durationMs: Date.now() - attemptStartedAt,
    });

    for (const item of result.issues) {
      byClass[item.class] += 1;
      codes.add(item.code);
    }

    if (result.ok) break;

    const classes = [...new Set(result.issues.map((item) => item.class))];
    const blocked = classes.some((item) => remaining[item] <= 0);
    if (blocked) {
      exhausted = true;
      break;
    }
    for (const item of classes) {
      remaining[item] -= 1;
    }

    feedback = buildFeedback(attempt + 1, result.issues);
  }

  const ok = attempts.length > 0 && attempts[attempts.length - 1].ok;
  if (!ok && attempts.length >= policy.maxAttempts) exhausted = true;

  return {
    ok,
    raw: lastRaw,
    contract: lastContract,
    attempts,
    telemetry: {
      attempts: attempts.length,
      firstPass: attempts[0]?.ok ?? false,
      repaired: ok && attempts.length > 1,
      exhausted,
      codes: [...codes].sort(),
      byClass,
      totalMs: Date.now() - startedAt,
    },
  };
}
