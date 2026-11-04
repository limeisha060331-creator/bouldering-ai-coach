import {
  analysisContractSchema,
  extractJsonCandidate,
  type AnalysisContract,
} from "../../analysis-schema";
import { checkSafety } from "../sandbox/safety";
import type {
  ValidationContext,
  ValidationIssue,
  ValidationResult,
} from "./types";

function issue(
  partial: Omit<ValidationIssue, "message" | "fixHint"> & {
    message: string;
    fixHint: string;
  }
): ValidationIssue {
  return partial;
}

function toSeconds(timestamp: string): number {
  const [minutes, seconds] = timestamp.split(":");
  return Number.parseInt(minutes, 10) * 60 + Number.parseInt(seconds, 10);
}

/**
 * 契约层：先保证输出是能消费的 JSON，再谈内容。
 * 这里不评价建议好不好，只判“能不能用”。
 */
function parseContract(raw: string): {
  contract: AnalysisContract | null;
  issues: ValidationIssue[];
} {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    return {
      contract: null,
      issues: [
        issue({
          code: "E_SCHEMA",
          class: "E1",
          path: "$",
          severity: "P0",
          message: "输出里没有可解析的 JSON 对象",
          fixHint: "只输出一个 JSON 对象，不要附加解释文字或 Markdown 标题",
          expected: "单个 JSON 对象",
          actual: "未找到 JSON",
        }),
      ],
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch (err) {
    return {
      contract: null,
      issues: [
        issue({
          code: "E_SCHEMA",
          class: "E1",
          path: "$",
          severity: "P0",
          message: `JSON 语法错误: ${(err as Error).message}`,
          fixHint: "检查引号、逗号和括号，重新输出完整 JSON",
          expected: "合法 JSON",
          actual: (err as Error).message,
        }),
      ],
    };
  }

  const parsed = analysisContractSchema.safeParse(value);
  if (parsed.success) {
    return { contract: parsed.data, issues: [] };
  }

  return {
    contract: null,
    issues: parsed.error.issues.slice(0, 6).map((item) =>
      issue({
        code: "E_SCHEMA",
        class: "E1",
        path: item.path.length > 0 ? item.path.join(".") : "$",
        severity: "P0",
        message: item.message,
        fixHint: "按 schema 补齐该字段；分数范围 1-5，时间戳格式 MM:SS",
        expected: "符合 analysisContractSchema",
        actual: item.message,
      })
    ),
  };
}

function checkTimeline(
  contract: AnalysisContract,
  context: ValidationContext
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  let previous = -1;

  contract.segments.forEach((segment, index) => {
    const seconds = toSeconds(segment.t);
    const limit = context.durationSec + 2;

    if (seconds > limit) {
      issues.push(
        issue({
          code: "E_TIMESTAMP_OUT_OF_RANGE",
          class: "E1",
          path: `segments.${index}.t`,
          severity: "P0",
          message: `时间戳 ${segment.t} 超出视频时长 ${context.durationSec}s`,
          fixHint: `把时间戳改到 0:00-${formatLimit(context.durationSec)} 之间，或删掉这一条`,
          expected: `0 <= t <= ${limit}s`,
          actual: `${seconds}s`,
        })
      );
    }

    if (seconds < previous) {
      issues.push(
        issue({
          code: "E_TIMESTAMP_NOT_MONOTONIC",
          class: "E1",
          path: `segments.${index}.t`,
          severity: "P1",
          message: "时间戳倒序，用户无法按顺序跳转",
          fixHint: "按时间从早到晚重排 segments，不要改变内容",
          expected: "时间戳单调递增",
          actual: `${segment.t} 出现在更晚的时间之后`,
        })
      );
    }

    if (seen.has(segment.t)) {
      issues.push(
        issue({
          code: "E_DUPLICATE_TIMESTAMP",
          class: "E1",
          path: `segments.${index}.t`,
          severity: "P2",
          message: "同一时间戳出现多次，像是在凑条数",
          fixHint: "合并重复时间戳的点评，或换成真实的其他时间点",
          expected: "时间戳唯一",
          actual: segment.t,
        })
      );
    }

    seen.add(segment.t);
    previous = Math.max(previous, seconds);
  });

  return issues;
}

/**
 * 证据层：每条点评必须能落到某个工具事实上。
 * 这条规则让模型没法靠“写得像”通过校验。
 */
function checkEvidence(
  contract: AnalysisContract,
  context: ValidationContext
): ValidationIssue[] {
  const tolerance = context.evidenceToleranceSec ?? 2.5;
  const issues: ValidationIssue[] = [];

  contract.segments.forEach((segment, index) => {
    const seconds = toSeconds(segment.t);
    const matched = context.facts.some(
      (fact) => Math.abs(fact.atSec - seconds) <= tolerance
    );
    if (matched) return;

    issues.push(
      issue({
        code: "E_CLAIM_WITHOUT_EVIDENCE",
        class: "E2",
        path: `segments.${index}`,
        severity: "P0",
        message: `时间戳 ${segment.t} 附近没有工具事实支撑`,
        fixHint:
          "先调用 pose.analyze 获取该时间段的动作证据，再写这条点评；不允许只改时间戳凑数",
        expected: `距某个事实 <= ${tolerance}s`,
        actual: `${segment.t} 附近无事实`,
      })
    );
  });

  return issues;
}

/**
 * 覆盖层：工具发现的关键事实必须被讲到。
 * 只查幻觉不查覆盖，最终会得到一个什么都不说的 agent。
 */
function checkCoverage(
  contract: AnalysisContract,
  context: ValidationContext
): ValidationIssue[] {
  const tolerance = context.evidenceToleranceSec ?? 2.5;
  const floor = context.coverageConfidenceFloor ?? 0.7;
  const issues: ValidationIssue[] = [];

  for (const fact of context.facts) {
    if (fact.kind === "constraint") continue;
    if (fact.confidence < floor) continue;

    const covered = contract.segments.some(
      (segment) => Math.abs(toSeconds(segment.t) - fact.atSec) <= tolerance
    );
    if (covered) continue;

    issues.push(
      issue({
        code: "E_COVERAGE_MISS",
        class: "E3",
        path: `coverage.${fact.id}`,
        severity: "P1",
        message: `关键事实没有被任何点评覆盖: ${fact.detail}`,
        fixHint: `补一条 ${formatSeconds(fact.atSec)} 的点评，覆盖「${fact.detail}」`,
        expected: "每个高置信事实至少一条点评",
        actual: fact.detail,
      })
    );
  }

  return issues;
}

function checkSegmentCount(
  contract: AnalysisContract,
  context: ValidationContext
): ValidationIssue[] {
  const min = context.minSegments ?? 2;
  if (contract.segments.length >= min) return [];

  return [
    issue({
      code: "E_TOO_FEW_SEGMENTS",
      class: "E3",
      path: "segments",
      severity: "P1",
      message: `只有 ${contract.segments.length} 条点评，低于下限 ${min}`,
      fixHint: `补到至少 ${min} 条，每条对应一个独立时间点`,
      expected: `>= ${min} 条`,
      actual: `${contract.segments.length} 条`,
    }),
  ];
}

function checkSafetyLine(
  raw: string,
  contract: AnalysisContract | null
): ValidationIssue[] {
  const text = contract
    ? [
        ...contract.segments.map(
          (segment) => `${segment.evidence} ${segment.fix ?? ""}`
        ),
        contract.overallAdvice ?? "",
      ].join("\n")
    : raw;

  const verdict = checkSafety(text);
  if (verdict.allowed) return [];

  return [
    issue({
      code: "E_SAFETY_BLOCKED",
      class: "E4",
      path: "$",
      severity: "P0",
      message: `触碰安全红线: ${verdict.reason}`,
      fixHint:
        "删除医疗、自伤或隐私内容；训练建议只描述动作，不做诊断。安全类错误不重试",
      expected: "不触碰安全红线",
      actual: verdict.match,
    }),
  ];
}

export function validateReport(
  raw: string,
  context: ValidationContext
): ValidationResult {
  const { contract, issues } = parseContract(raw);
  const all: ValidationIssue[] = [...issues];

  if (contract) {
    all.push(...checkTimeline(contract, context));
    all.push(...checkEvidence(contract, context));
    all.push(...checkCoverage(contract, context));
    all.push(...checkSegmentCount(contract, context));
  }

  all.push(...checkSafetyLine(raw, contract));

  return {
    ok: contract !== null && all.length === 0,
    contract,
    issues: all,
  };
}

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatLimit(durationSec: number): string {
  return formatSeconds(durationSec + 2);
}
