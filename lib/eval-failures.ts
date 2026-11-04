import {
  failureMeta,
  type FailureCode,
  type FailureFinding,
  type FailureSeverity,
} from "./failure-taxonomy";
import type { BoulderGrade } from "./types";

const SEVERITY_RANK: Record<FailureSeverity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

export type BaseFailureInput = {
  raw: string;
  segmentCount: number;
  scorePresent: boolean;
  gradePredicted: BoulderGrade | null;
  gradeExpected: string | null;
  gradeMatch: boolean | null;
  /** 难度不一致时写进证据里的标注来源，例如「标注」「外部标注」 */
  gradeExpectedLabel: string;
  durationSec: number;
  inRangeCount: number;
  timestampInRangeRate: number;
  timestampMonotonic: boolean;
  genericCount: number;
  genericAdviceRate: number;
  duplicateSegmentRate: number;
  avgSegmentChars: number;
  hasDimensionScores: boolean;
};

export function addFailure(
  failures: FailureFinding[],
  code: FailureCode,
  evidence: string
): void {
  const meta = failureMeta(code);
  failures.push({
    code,
    severity: meta.severity,
    owner: meta.owner,
    evidence,
    fix: meta.fix,
  });
}

/** 有标注和无标注两种评测共用的失败判定，差异由输入字段表达。 */
export function collectBaseFailures(
  input: BaseFailureInput
): FailureFinding[] {
  const failures: FailureFinding[] = [];
  const add = (code: FailureCode, evidence: string) =>
    addFailure(failures, code, evidence);

  if (!input.raw.trim()) add("EMPTY_OUTPUT", "模型正文为空");
  if (input.segmentCount === 0) {
    add("NO_TIMESTAMPED_SEGMENTS", "0 条可解析时间戳");
  }
  if (!input.scorePresent) {
    add("SCORE_MISSING", "未解析到「评分：xx/100」");
  }
  if (input.gradePredicted == null) {
    add("GRADE_MISSING", "未解析到「难度：Vx」");
  } else if (input.gradeMatch === false && input.gradeExpected != null) {
    add(
      "GRADE_MISMATCH",
      `模型判断 ${input.gradePredicted}，${input.gradeExpectedLabel} ${input.gradeExpected}`
    );
  }
  if (input.segmentCount > 0 && input.timestampInRangeRate < 1) {
    add(
      "TIMESTAMP_OUT_OF_RANGE",
      `${input.segmentCount - input.inRangeCount}/${input.segmentCount} 条超出 0-${
        input.durationSec + 2
      }s`
    );
  }
  if (input.segmentCount > 1 && !input.timestampMonotonic) {
    add("TIMESTAMP_NOT_MONOTONIC", "存在倒序时间戳");
  }
  if (input.genericAdviceRate > 0.3) {
    add(
      "GENERIC_ADVICE",
      `${input.genericCount}/${input.segmentCount} 条含空话短语`
    );
  }
  if (input.duplicateSegmentRate > 0.2) {
    add(
      "DUPLICATE_SEGMENT",
      `重复率 ${(input.duplicateSegmentRate * 100).toFixed(0)}%`
    );
  }
  if (input.segmentCount > 0 && input.avgSegmentChars < 12) {
    add(
      "SEGMENT_TOO_SHORT",
      `平均每条 ${input.avgSegmentChars.toFixed(1)} 字`
    );
  }
  if (!input.hasDimensionScores) {
    add("DIMENSION_SCORES_MISSING", "未找到完整的 5 维分数");
  }

  return failures;
}

export function sortFailures(failures: FailureFinding[]): FailureFinding[] {
  return failures.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.code.localeCompare(b.code)
  );
}
