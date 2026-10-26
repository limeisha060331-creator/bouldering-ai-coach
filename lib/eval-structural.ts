import type { ParsedAnalysis } from "./types";
import { DIMENSION_KEYS, type DimensionScores } from "./eval-schema";
import { parseDimensionScores } from "./eval-metrics";
import {
  checkTimestamps,
  computeDuplicateSegmentRate,
  countGenericSegments,
  meanSegmentChars,
} from "./eval-signals";
import {
  failureMeta,
  type FailureCode,
  type FailureFinding,
  type FailureSeverity,
} from "./failure-taxonomy";

/**
 * 真实视频的结构基线。
 *
 * 与 evaluateAnalysis 的区别：这里不吃人工标签，所以只跑「看输出就能判」的指标。
 * 好处是真视频当天就能出数；代价是它不衡量建议对不对，只衡量建议能不能用。
 * 报告里必须写明这个边界，否则 90 分的结构分会被误读成 90 分的教练质量。
 */

const SEVERITY_RANK: Record<FailureSeverity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const mean = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export type StructuralInput = {
  caseId: string;
  model: string;
  durationSec: number;
  /** 只有外部可核对的难度才传，比如视频标题里写明的 V6；没有就传 null */
  expectedGrade?: string | null;
};

export type StructuralCaseMetrics = {
  caseId: string;
  model: string;
  durationSec: number;
  segmentCount: number;
  formatValid: boolean;
  scorePresent: boolean;
  score: number | null;
  gradePredicted: string | null;
  gradeExpected: string | null;
  gradeMatch: boolean | null;
  timestampInRangeRate: number;
  timestampMonotonic: boolean;
  genericAdviceRate: number;
  duplicateSegmentRate: number;
  avgSegmentChars: number;
  dimensionScores: DimensionScores | null;
  /** 只用不依赖人工标签的部分重归一化，取值范围 0-1 */
  structuralScore: number;
  failureCodes: FailureCode[];
  failures: FailureFinding[];
};

export type StructuralAggregate = {
  cases: number;
  /** 至少解析出一条时间戳片段：模型输出「能不能被程序读」 */
  parseableRate: number;
  /** 可解析且给出总分：模型输出「符不符合产品契约」 */
  formatValidRate: number;
  timestampInRangeRate: number;
  timestampMonotonicRate: number;
  genericAdviceRate: number;
  duplicateSegmentRate: number;
  avgSegmentChars: number;
  avgSegmentCount: number;
  dimensionScoresPresentRate: number;
  gradeMatchRate: number | null;
  structuralScore: number;
  p0Cases: number;
  failureCounts: Partial<Record<FailureCode, number>>;
};

export function evaluateStructural(
  input: StructuralInput,
  raw: string,
  parsed: ParsedAnalysis
): StructuralCaseMetrics {
  const segments = parsed.segments;
  const segmentCount = segments.length;
  const scorePresent = parsed.score != null;
  const gradePredicted = parsed.grade ?? null;
  const gradeExpected = input.expectedGrade ?? null;
  const gradeMatch =
    gradeExpected == null || gradePredicted == null
      ? null
      : gradePredicted === gradeExpected;

  const timestamps = checkTimestamps(parsed, input.durationSec);
  const duplicateSegmentRate = computeDuplicateSegmentRate(segments);
  const genericCount = countGenericSegments(segments);
  const genericAdviceRate =
    segmentCount === 0 ? 1 : genericCount / segmentCount;
  const avgSegmentChars = meanSegmentChars(segments);
  const dimensionScores = parseDimensionScores(raw);

  const formatValid = segmentCount > 0 && scorePresent;
  const lengthAdequacy = clamp(avgSegmentChars / 40, 0, 1);

  const weighted: { weight: number; value: number }[] = [
    { weight: 0.15, value: formatValid ? 1 : 0 },
    { weight: 0.15, value: timestamps.inRangeRate },
    { weight: 0.2, value: 1 - genericAdviceRate },
    { weight: 0.1, value: 1 - duplicateSegmentRate },
    { weight: 0.1, value: lengthAdequacy },
  ];
  if (gradeMatch != null) {
    weighted.push({ weight: 0.05, value: gradeMatch ? 1 : 0 });
  }
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const numerator = weighted.reduce(
    (sum, item) => sum + item.weight * item.value,
    0
  );

  const failures: FailureFinding[] = [];
  function addFailure(code: FailureCode, evidence: string): void {
    const meta = failureMeta(code);
    failures.push({
      code,
      severity: meta.severity,
      owner: meta.owner,
      evidence,
      fix: meta.fix,
    });
  }

  if (!raw.trim()) addFailure("EMPTY_OUTPUT", "模型正文为空");
  if (segmentCount === 0) {
    addFailure("NO_TIMESTAMPED_SEGMENTS", "0 条可解析时间戳");
  }
  if (!scorePresent) addFailure("SCORE_MISSING", "未解析到「评分：xx/100」");
  if (gradePredicted == null) {
    addFailure("GRADE_MISSING", "未解析到「难度：Vx」");
  } else if (gradeMatch === false && gradeExpected != null) {
    addFailure(
      "GRADE_MISMATCH",
      `模型判断 ${gradePredicted}，外部标注 ${gradeExpected}`
    );
  }
  if (segmentCount > 0 && timestamps.inRangeRate < 1) {
    addFailure(
      "TIMESTAMP_OUT_OF_RANGE",
      `${segmentCount - timestamps.inRangeCount}/${segmentCount} 条超出 0-${
        input.durationSec + 2
      }s`
    );
  }
  if (segmentCount > 1 && !timestamps.monotonic) {
    addFailure("TIMESTAMP_NOT_MONOTONIC", "存在倒序时间戳");
  }
  if (genericAdviceRate > 0.3) {
    addFailure(
      "GENERIC_ADVICE",
      `${genericCount}/${segmentCount} 条含空话短语`
    );
  }
  if (duplicateSegmentRate > 0.2) {
    addFailure(
      "DUPLICATE_SEGMENT",
      `重复率 ${(duplicateSegmentRate * 100).toFixed(0)}%`
    );
  }
  if (segmentCount > 0 && avgSegmentChars < 12) {
    addFailure(
      "SEGMENT_TOO_SHORT",
      `平均每条 ${avgSegmentChars.toFixed(1)} 字`
    );
  }
  if (!dimensionScores) {
    addFailure("DIMENSION_SCORES_MISSING", "未找到完整的 5 维分数");
  }

  failures.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.code.localeCompare(b.code)
  );

  return {
    caseId: input.caseId,
    model: input.model,
    durationSec: input.durationSec,
    segmentCount,
    formatValid,
    scorePresent,
    score: parsed.score,
    gradePredicted,
    gradeExpected,
    gradeMatch,
    timestampInRangeRate: timestamps.inRangeRate,
    timestampMonotonic: timestamps.monotonic,
    genericAdviceRate,
    duplicateSegmentRate,
    avgSegmentChars,
    dimensionScores,
    structuralScore: clamp(
      totalWeight === 0 ? 0 : numerator / totalWeight,
      0,
      1
    ),
    failureCodes: failures.map((item) => item.code),
    failures,
  };
}

export function aggregateStructural(
  results: StructuralCaseMetrics[]
): StructuralAggregate {
  const failureCounts: Partial<Record<FailureCode, number>> = {};
  for (const result of results) {
    for (const code of result.failureCodes) {
      failureCounts[code] = (failureCounts[code] ?? 0) + 1;
    }
  }

  const gradeValues = results
    .map((item) => item.gradeMatch)
    .filter((value): value is boolean => value != null);

  return {
    cases: results.length,
    parseableRate: mean(results.map((item) => (item.segmentCount > 0 ? 1 : 0))),
    formatValidRate: mean(results.map((item) => (item.formatValid ? 1 : 0))),
    timestampInRangeRate: mean(
      results.map((item) => item.timestampInRangeRate)
    ),
    timestampMonotonicRate: mean(
      results.map((item) => (item.timestampMonotonic ? 1 : 0))
    ),
    genericAdviceRate: mean(results.map((item) => item.genericAdviceRate)),
    duplicateSegmentRate: mean(
      results.map((item) => item.duplicateSegmentRate)
    ),
    avgSegmentChars: mean(results.map((item) => item.avgSegmentChars)),
    avgSegmentCount: mean(results.map((item) => item.segmentCount)),
    dimensionScoresPresentRate: mean(
      results.map((item) => (item.dimensionScores ? 1 : 0))
    ),
    gradeMatchRate:
      gradeValues.length === 0
        ? null
        : mean(gradeValues.map((value) => (value ? 1 : 0))),
    structuralScore: mean(results.map((item) => item.structuralScore)),
    p0Cases: results.filter((item) =>
      item.failures.some((failure) => failure.severity === "P0")
    ).length,
    failureCounts,
  };
}

export const STRUCTURAL_DIMENSIONS = DIMENSION_KEYS;
