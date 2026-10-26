import type { AggregateMetrics } from "./eval-metrics";
import {
  FAILURE_LIBRARY,
  type FailureCode,
  type FailureSeverity,
} from "./failure-taxonomy";

export type MetricDirection = "higher_is_better" | "lower_is_better";
export type MetricStatus = "better" | "worse" | "flat" | "missing";
export type Decision = "ship" | "iterate" | "rollback" | "need_more_data";

export type MetricComparison = {
  key: string;
  label: string;
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  direction: MetricDirection;
  status: MetricStatus;
};

export type DecisionPolicy = {
  minCases: number;
  minPrimaryLift: number;
  maxCostIncreasePct: number;
  minFormatValidRate: number;
  minTimestampInRangeRate: number;
  blockingSeverities: FailureSeverity[];
};

export type ComparisonReport = {
  baselineRunId: string;
  candidateRunId: string;
  decision: Decision;
  reasons: string[];
  metrics: MetricComparison[];
  blockingFailures: {
    code: FailureCode;
    label: string;
    baseline: number;
    candidate: number;
  }[];
};

export const DEFAULT_DECISION_POLICY: DecisionPolicy = {
  minCases: 3,
  minPrimaryLift: 0.02,
  maxCostIncreasePct: 20,
  minFormatValidRate: 0.98,
  minTimestampInRangeRate: 0.95,
  blockingSeverities: ["P0"],
};

function compareMetric(input: {
  key: string;
  label: string;
  baseline: number | null;
  candidate: number | null;
  direction: MetricDirection;
}): MetricComparison {
  const { baseline, candidate, direction } = input;

  if (baseline == null || candidate == null) {
    return {
      ...input,
      delta: null,
      status: "missing",
    };
  }

  const delta = candidate - baseline;
  const epsilon = 1e-9;
  let status: MetricStatus = "flat";

  if (Math.abs(delta) > epsilon) {
    const better =
      direction === "higher_is_better" ? delta > 0 : delta < 0;
    status = better ? "better" : "worse";
  }

  return { ...input, delta, status };
}

function costIncreasePct(baseline: number, candidate: number): number {
  if (baseline <= 0) return candidate <= 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((candidate - baseline) / baseline) * 100;
}

export function compareRuns(input: {
  baseline: { runId: string; metrics: AggregateMetrics };
  candidate: { runId: string; metrics: AggregateMetrics };
  avgCostUsd: { baseline: number; candidate: number };
  policy?: DecisionPolicy;
}): ComparisonReport {
  const policy = input.policy ?? DEFAULT_DECISION_POLICY;
  const baseline = input.baseline.metrics;
  const candidate = input.candidate.metrics;

  const metrics: MetricComparison[] = [
    compareMetric({
      key: "qualityScore",
      label: "综合质量分",
      baseline: baseline.qualityScore,
      candidate: candidate.qualityScore,
      direction: "higher_is_better",
    }),
    compareMetric({
      key: "formatValidRate",
      label: "格式合法率",
      baseline: baseline.formatValidRate,
      candidate: candidate.formatValidRate,
      direction: "higher_is_better",
    }),
    compareMetric({
      key: "timestampInRangeRate",
      label: "时间戳可定位率",
      baseline: baseline.timestampInRangeRate,
      candidate: candidate.timestampInRangeRate,
      direction: "higher_is_better",
    }),
    compareMetric({
      key: "mustMentionCoverage",
      label: "关键线索覆盖率",
      baseline: baseline.mustMentionCoverage,
      candidate: candidate.mustMentionCoverage,
      direction: "higher_is_better",
    }),
    compareMetric({
      key: "genericAdviceRate",
      label: "空话率",
      baseline: baseline.genericAdviceRate,
      candidate: candidate.genericAdviceRate,
      direction: "lower_is_better",
    }),
    compareMetric({
      key: "duplicateSegmentRate",
      label: "重复片段率",
      baseline: baseline.duplicateSegmentRate,
      candidate: candidate.duplicateSegmentRate,
      direction: "lower_is_better",
    }),
    compareMetric({
      key: "gradeMatchRate",
      label: "难度判断一致率",
      baseline: baseline.gradeMatchRate,
      candidate: candidate.gradeMatchRate,
      direction: "higher_is_better",
    }),
    compareMetric({
      key: "dimensionMaeCoverage",
      label: "维度分覆盖率",
      baseline: baseline.dimensionMaeCoverage,
      candidate: candidate.dimensionMaeCoverage,
      direction: "higher_is_better",
    }),
    compareMetric({
      key: "dimensionMae",
      label: "维度分 MAE",
      baseline: baseline.dimensionMae,
      candidate: candidate.dimensionMae,
      direction: "lower_is_better",
    }),
    compareMetric({
      key: "avgCostUsd",
      label: "单次成本",
      baseline: input.avgCostUsd.baseline,
      candidate: input.avgCostUsd.candidate,
      direction: "lower_is_better",
    }),
  ];

  const blockingFailures = Object.entries(FAILURE_LIBRARY)
    .filter(([, meta]) => policy.blockingSeverities.includes(meta.severity))
    .map(([code, meta]) => ({
      code: code as FailureCode,
      label: meta.label,
      baseline: baseline.failureCounts[code as FailureCode] ?? 0,
      candidate: candidate.failureCounts[code as FailureCode] ?? 0,
    }))
    .filter((item) => item.baseline > 0 || item.candidate > 0);

  const reasons: string[] = [];
  const sampleSize = Math.min(baseline.cases, candidate.cases);

  if (sampleSize < policy.minCases) {
    reasons.push(
      `样本量 ${sampleSize} 低于最小要求 ${policy.minCases}，先补案例再决策`
    );
    return {
      baselineRunId: input.baseline.runId,
      candidateRunId: input.candidate.runId,
      decision: "need_more_data",
      reasons,
      metrics,
      blockingFailures,
    };
  }

  if (candidate.formatValidRate < policy.minFormatValidRate) {
    reasons.push(
      `格式合法率 ${(candidate.formatValidRate * 100).toFixed(1)}% 低于红线 ${(policy.minFormatValidRate * 100).toFixed(0)}%`
    );
  }
  if (candidate.timestampInRangeRate < policy.minTimestampInRangeRate) {
    reasons.push(
      `时间戳可定位率 ${(candidate.timestampInRangeRate * 100).toFixed(1)}% 低于红线 ${(policy.minTimestampInRangeRate * 100).toFixed(0)}%`
    );
  }

  const costDelta = costIncreasePct(
    input.avgCostUsd.baseline,
    input.avgCostUsd.candidate
  );
  if (costDelta > policy.maxCostIncreasePct) {
    reasons.push(
      `单次成本上涨 ${costDelta.toFixed(1)}%，超过允许的 +${policy.maxCostIncreasePct}%`
    );
  }

  const increasedBlocking = blockingFailures.filter(
    (item) => item.candidate > item.baseline
  );
  for (const item of increasedBlocking) {
    reasons.push(
      `P0 失败「${item.label}」(${item.code}) 从 ${item.baseline} 增到 ${item.candidate}`
    );
  }

  if (reasons.length > 0) {
    return {
      baselineRunId: input.baseline.runId,
      candidateRunId: input.candidate.runId,
      decision: "rollback",
      reasons,
      metrics,
      blockingFailures,
    };
  }

  const lift = candidate.qualityScore - baseline.qualityScore;
  if (lift >= policy.minPrimaryLift) {
    reasons.push(
      `格式合法率 ${(candidate.formatValidRate * 100).toFixed(1)}%，高于 ${(policy.minFormatValidRate * 100).toFixed(0)}% 红线`
    );
    reasons.push(
      `时间戳可定位率 ${(candidate.timestampInRangeRate * 100).toFixed(1)}%，高于 ${(policy.minTimestampInRangeRate * 100).toFixed(0)}% 红线`
    );
    reasons.push(
      `单次成本变化 ${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(1)}%，在 +${policy.maxCostIncreasePct}% 容差内`
    );
    reasons.push(
      `综合质量分提升 ${(lift * 100).toFixed(1)}pt，达到 +${(policy.minPrimaryLift * 100).toFixed(1)}pt 门槛`
    );
    return {
      baselineRunId: input.baseline.runId,
      candidateRunId: input.candidate.runId,
      decision: "ship",
      reasons,
      metrics,
      blockingFailures,
    };
  }

  if (lift <= -policy.minPrimaryLift) {
    reasons.push(
      `综合质量分下降 ${Math.abs(lift * 100).toFixed(1)}pt，超过回滚阈值`
    );
    return {
      baselineRunId: input.baseline.runId,
      candidateRunId: input.candidate.runId,
      decision: "rollback",
      reasons,
      metrics,
      blockingFailures,
    };
  }

  reasons.push(
    `综合质量分变化 ${(lift * 100).toFixed(1)}pt，未达到上线门槛，继续迭代`
  );
  return {
    baselineRunId: input.baseline.runId,
    candidateRunId: input.candidate.runId,
    decision: "iterate",
    reasons,
    metrics,
    blockingFailures,
  };
}
