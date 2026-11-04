import type {
  AgentEvalReport,
  GateResult,
  GateThresholds,
} from "./types";

export const DEFAULT_GATE_THRESHOLDS: GateThresholds = {
  minPassPowK: 0.8,
  maxP90LatencyMs: 120_000,
  maxP90CostUsd: 0.5,
  maxAvgOrderViolations: 0,
};

/**
 * 门禁是报告的纯函数：同一份报告永远得到同一个结论。
 */
export function evaluateGate(
  report: Pick<AgentEvalReport, "overall">,
  thresholds: GateThresholds = DEFAULT_GATE_THRESHOLDS
): GateResult {
  const reasons: string[] = [];
  const { overall } = report;

  if (overall.passPowK < thresholds.minPassPowK) {
    reasons.push(
      `pass^k ${overall.passPowK} 低于门槛 ${thresholds.minPassPowK}`
    );
  }
  if (overall.p90LatencyMs > thresholds.maxP90LatencyMs) {
    reasons.push(
      `P90 时延 ${overall.p90LatencyMs}ms 超过 ${thresholds.maxP90LatencyMs}ms`
    );
  }
  if (overall.p90CostUsd > thresholds.maxP90CostUsd) {
    reasons.push(
      `P90 成本 $${overall.p90CostUsd} 超过 $${thresholds.maxP90CostUsd}`
    );
  }
  if (overall.avgOrderViolations > thresholds.maxAvgOrderViolations) {
    reasons.push(
      `平均工具顺序违规 ${overall.avgOrderViolations} 超过 ${thresholds.maxAvgOrderViolations}`
    );
  }

  return { passed: reasons.length === 0, reasons };
}
