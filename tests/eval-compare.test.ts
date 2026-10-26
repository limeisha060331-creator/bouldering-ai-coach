import { describe, expect, it } from "vitest";
import { compareRuns } from "../lib/eval-compare";
import type { AggregateMetrics } from "../lib/eval-metrics";

function metrics(overrides: Partial<AggregateMetrics> = {}): AggregateMetrics {
  return {
    cases: 3,
    formatValidRate: 1,
    timestampInRangeRate: 1,
    mustMentionCoverage: 0.8,
    genericAdviceRate: 0.1,
    duplicateSegmentRate: 0,
    gradeMatchRate: 1,
    dimensionMae: 0.5,
    dimensionMaeCases: 3,
    dimensionMaeCoverage: 1,
    qualityScore: 0.7,
    avgSegmentCount: 5,
    failureCounts: {},
    ...overrides,
  };
}

describe("eval-compare", () => {
  it("质量提升且无红线时上线", () => {
    const report = compareRuns({
      baseline: { runId: "baseline", metrics: metrics() },
      candidate: {
        runId: "candidate",
        metrics: metrics({ qualityScore: 0.75 }),
      },
      avgCostUsd: { baseline: 0.01, candidate: 0.0105 },
    });

    expect(report.decision).toBe("ship");
    expect(report.reasons.join(" ")).toContain("提升");
  });

  it("格式合法率跌破红线时回滚", () => {
    const report = compareRuns({
      baseline: { runId: "baseline", metrics: metrics() },
      candidate: {
        runId: "candidate",
        metrics: metrics({ qualityScore: 0.8, formatValidRate: 0.9 }),
      },
      avgCostUsd: { baseline: 0.01, candidate: 0.01 },
    });

    expect(report.decision).toBe("rollback");
    expect(report.reasons.join(" ")).toContain("格式合法率");
  });

  it("样本不足时不做发布决策", () => {
    const report = compareRuns({
      baseline: { runId: "baseline", metrics: metrics({ cases: 2 }) },
      candidate: {
        runId: "candidate",
        metrics: metrics({ cases: 2, qualityScore: 0.9 }),
      },
      avgCostUsd: { baseline: 0.01, candidate: 0.01 },
    });

    expect(report.decision).toBe("need_more_data");
  });

  it("成本上涨超过 20% 时回滚", () => {
    const report = compareRuns({
      baseline: { runId: "baseline", metrics: metrics() },
      candidate: {
        runId: "candidate",
        metrics: metrics({ qualityScore: 0.8 }),
      },
      avgCostUsd: { baseline: 0.01, candidate: 0.02 },
    });

    expect(report.decision).toBe("rollback");
    expect(report.reasons.join(" ")).toContain("成本");
  });

  it("P0 失败增加时回滚", () => {
    const report = compareRuns({
      baseline: { runId: "baseline", metrics: metrics() },
      candidate: {
        runId: "candidate",
        metrics: metrics({
          qualityScore: 0.8,
          failureCounts: { SCORE_MISSING: 1 },
        }),
      },
      avgCostUsd: { baseline: 0.01, candidate: 0.01 },
    });

    expect(report.decision).toBe("rollback");
    expect(report.reasons.join(" ")).toContain("SCORE_MISSING");
  });
});
