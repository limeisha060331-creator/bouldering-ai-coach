import type { BoulderGrade, ParsedAnalysis } from "./types";
import {
  DIMENSION_KEYS,
  type DimensionKey,
  type DimensionScores,
  type EvalCase,
} from "./eval-schema";
import {
  type FailureCode,
  type FailureFinding,
} from "./failure-taxonomy";
import { parseAnalysisContract } from "./analysis-schema";
import {
  addFailure,
  collectBaseFailures,
  sortFailures,
} from "./eval-failures";
import {
  checkTimestamps,
  computeDuplicateSegmentRate,
  countGenericSegments,
  meanSegmentChars,
} from "./eval-signals";

export type CaseMetrics = {
  caseId: string;
  label: string;
  model: string;
  segmentCount: number;
  formatValid: boolean;
  scorePresent: boolean;
  score: number | null;
  gradePredicted: BoulderGrade | null;
  gradeExpected: BoulderGrade;
  gradeMatch: boolean | null;
  timestampInRangeRate: number;
  timestampMonotonic: boolean;
  mustMentionCoverage: number;
  mustMentionHits: string[];
  mustMentionMisses: string[];
  genericAdviceRate: number;
  duplicateSegmentRate: number;
  avgSegmentChars: number;
  dimensionScores: DimensionScores | null;
  dimensionMae: number | null;
  qualityScore: number;
  failureCodes: FailureCode[];
  failures: FailureFinding[];
};

export type AggregateMetrics = {
  cases: number;
  formatValidRate: number;
  timestampInRangeRate: number;
  mustMentionCoverage: number;
  genericAdviceRate: number;
  duplicateSegmentRate: number;
  gradeMatchRate: number | null;
  dimensionMae: number | null;
  dimensionMaeCases: number;
  dimensionMaeCoverage: number;
  qualityScore: number;
  avgSegmentCount: number;
  failureCounts: Partial<Record<FailureCode, number>>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function labelToDimension(label: string): DimensionKey | null {
  if (/顺序|节奏|衔接/.test(label)) return "sequence";
  if (/完攀|完成|收尾/.test(label)) return "completion";
  if (/脚点|踩脚|抓握|手点/.test(label)) return "feet";
  if (/重心|身体位置|胯部/.test(label)) return "hips";
  if (/发力|动作技术|力量/.test(label)) return "power";
  return null;
}

/**
 * 只认显式的「维度分：重心 4/5，发力 3/5…」。
 * 现在的自由文本 Prompt 不保证输出这一行，所以缺分是预期内的失败，
 * 不是脚本算不出来再猜一个分数。
 */
export function parseDimensionScores(raw: string): DimensionScores | null {
  // v2 契约优先：分数直接来自 schema 校验过的字段，不再依赖某一行文案的写法
  const contract = parseAnalysisContract(raw);
  if (contract) return contract.dimensionScores;

  const line = raw
    .split("\n")
    .map((item) => item.trim())
    .find((item) => /维度分\s*[：:]/.test(item));
  if (!line) return null;

  const body = line.replace(/^.*?维度分\s*[：:]\s*/, "");
  const scores: Partial<Record<DimensionKey, number>> = {};

  for (const part of body.split(/[，,;；]/)) {
    const match = part
      .trim()
      .match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*(?:\/\s*5)?\s*$/);
    if (!match) continue;

    const dimension = labelToDimension(match[1].trim());
    const value = Number(match[2]);
    if (!dimension || !Number.isFinite(value) || value < 1 || value > 5) {
      continue;
    }
    scores[dimension] = value;
  }

  const complete = DIMENSION_KEYS.every((key) => scores[key] != null);
  return complete ? (scores as DimensionScores) : null;
}

function computeDimensionMae(
  predicted: DimensionScores,
  expected: DimensionScores
): number {
  return mean(
    DIMENSION_KEYS.map((key) => Math.abs(predicted[key] - expected[key]))
  );
}

export function evaluateAnalysis(
  evalCase: EvalCase,
  raw: string,
  parsed: ParsedAnalysis,
  label = ""
): CaseMetrics {
  const segments = parsed.segments;
  const segmentCount = segments.length;
  const scorePresent = parsed.score != null;
  const gradePredicted = parsed.grade ?? null;
  const gradeMatch =
    gradePredicted == null ? null : gradePredicted === evalCase.grade;

  const timestamps = checkTimestamps(parsed, evalCase.durationSec);
  const inRangeCount = timestamps.inRangeCount;
  const timestampInRangeRate = timestamps.inRangeRate;
  const timestampMonotonic = timestamps.monotonic;

  const duplicateSegmentRate = computeDuplicateSegmentRate(segments);
  const genericCount = countGenericSegments(segments);
  const genericAdviceRate =
    segmentCount === 0 ? 1 : genericCount / segmentCount;

  const mustMentionHits = evalCase.labels.mustMention.filter((keyword) =>
    raw.includes(keyword)
  );
  const mustMentionMisses = evalCase.labels.mustMention.filter(
    (keyword) => !raw.includes(keyword)
  );
  const mustMentionCoverage =
    evalCase.labels.mustMention.length === 0
      ? 1
      : mustMentionHits.length / evalCase.labels.mustMention.length;

  const avgSegmentChars = meanSegmentChars(segments);

  const dimensionScores = parseDimensionScores(raw);
  const dimensionMae = dimensionScores
    ? computeDimensionMae(dimensionScores, evalCase.labels.dimensions)
    : null;

  const formatValid = segmentCount > 0 && scorePresent;
  const lengthAdequacy = clamp(avgSegmentChars / 40, 0, 1);
  const baseQuality =
    0.15 * (formatValid ? 1 : 0) +
    0.15 * timestampInRangeRate +
    0.25 * mustMentionCoverage +
    0.2 * (1 - genericAdviceRate) +
    0.1 * (1 - duplicateSegmentRate) +
    0.05 * (gradeMatch == null ? 0 : gradeMatch ? 1 : 0) +
    0.1 * lengthAdequacy;

  const failures = collectBaseFailures({
    raw,
    segmentCount,
    scorePresent,
    gradePredicted,
    gradeExpected: evalCase.grade,
    gradeMatch,
    gradeExpectedLabel: "标注",
    durationSec: evalCase.durationSec,
    inRangeCount,
    timestampInRangeRate,
    timestampMonotonic,
    genericCount,
    genericAdviceRate,
    duplicateSegmentRate,
    avgSegmentChars,
    hasDimensionScores: dimensionScores != null,
  });

  if (mustMentionCoverage < 0.6) {
    addFailure(
      failures,
      "MUST_MENTION_MISSED",
      `命中 ${mustMentionHits.length}/${evalCase.labels.mustMention.length}，漏掉：${mustMentionMisses.join("、")}`
    );
  }
  if (dimensionMae != null && dimensionMae > 1) {
    addFailure(
      failures,
      "DIMENSION_MAE_HIGH",
      `MAE ${dimensionMae.toFixed(2)}`
    );
  }

  sortFailures(failures);

  const p0Count = failures.filter((item) => item.severity === "P0").length;
  const penalty = p0Count === 0 ? 1 : p0Count === 1 ? 0.85 : 0.65;

  return {
    caseId: evalCase.id,
    label,
    model: evalCase.model,
    segmentCount,
    formatValid,
    scorePresent,
    score: parsed.score,
    gradePredicted,
    gradeExpected: evalCase.grade,
    gradeMatch,
    timestampInRangeRate,
    timestampMonotonic,
    mustMentionCoverage,
    mustMentionHits,
    mustMentionMisses,
    genericAdviceRate,
    duplicateSegmentRate,
    avgSegmentChars,
    dimensionScores,
    dimensionMae,
    qualityScore: clamp(baseQuality * penalty, 0, 1),
    failureCodes: failures.map((item) => item.code),
    failures,
  };
}

export function aggregateMetrics(results: CaseMetrics[]): AggregateMetrics {
  const gradeValues = results
    .map((item) => item.gradeMatch)
    .filter((value): value is boolean => value != null);
  const maeValues = results
    .map((item) => item.dimensionMae)
    .filter((value): value is number => value != null);

  const failureCounts: Partial<Record<FailureCode, number>> = {};
  for (const result of results) {
    for (const code of result.failureCodes) {
      failureCounts[code] = (failureCounts[code] ?? 0) + 1;
    }
  }

  return {
    cases: results.length,
    formatValidRate: mean(results.map((item) => (item.formatValid ? 1 : 0))),
    timestampInRangeRate: mean(
      results.map((item) => item.timestampInRangeRate)
    ),
    mustMentionCoverage: mean(
      results.map((item) => item.mustMentionCoverage)
    ),
    genericAdviceRate: mean(results.map((item) => item.genericAdviceRate)),
    duplicateSegmentRate: mean(
      results.map((item) => item.duplicateSegmentRate)
    ),
    gradeMatchRate:
      gradeValues.length === 0
        ? null
        : mean(gradeValues.map((value) => (value ? 1 : 0))),
    dimensionMae:
      maeValues.length === 0 ? null : mean(maeValues),
    dimensionMaeCases: maeValues.length,
    dimensionMaeCoverage:
      results.length === 0 ? 0 : maeValues.length / results.length,
    qualityScore: mean(results.map((item) => item.qualityScore)),
    avgSegmentCount: mean(results.map((item) => item.segmentCount)),
    failureCounts,
  };
}
