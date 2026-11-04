import type { BoulderGrade } from "../../bouldering-grade";

export type ToolCallRecord = {
  tool: string;
  argsHash: string;
  ok: boolean;
  errorCode?: string;
  durationMs: number;
  replay: boolean;
};

export type AgentRunRecord = {
  runId: string;
  caseId: string;
  config: string;
  /** 第几次重复运行，从 1 开始 */
  k: number;
  startedAt: string;
  durationMs: number;
  costUsd: number;
  output: string;
  toolCalls: ToolCallRecord[];
  validation: {
    ok: boolean;
    issues: Array<{ code: string; class: string; path: string }>;
  };
  contextDigest: string;
};

export type AgentEvalCase = {
  id: string;
  title: string;
  durationSec: number;
  grade: BoulderGrade;
  angle: "front" | "side" | "unknown";
  /** 必须调用的工具 */
  requiredTools: string[];
  /** 允许调用的工具全集 */
  allowedTools: string[];
  /** 最小工具序列，用来算顺序违规 */
  oracleTools: string[];
  maxSteps: number;
  budgetUsd: number;
};

export type TrajectoryMetrics = {
  toolRecall: number;
  toolPrecision: number;
  orderViolations: number;
  redundantCalls: number;
  steps: number;
  stepRatio: number;
  unsupportedClaims: number;
};

export type RunScore = {
  passed: boolean;
  reasons: string[];
  trajectory: TrajectoryMetrics;
};

export type ConfigMetrics = {
  runs: number;
  runPassRate: number;
  /** 至少有一次通过的 case 占比 */
  casePassRate: number;
  /** k 次全部通过的 case 占比 */
  passPowK: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p50CostUsd: number;
  p90CostUsd: number;
  avgSteps: number;
  avgToolRecall: number;
  avgOrderViolations: number;
  failureTags: Record<string, number>;
};

export type GateThresholds = {
  minPassPowK: number;
  maxP90LatencyMs: number;
  maxP90CostUsd: number;
  maxAvgOrderViolations: number;
};

export type GateResult = {
  passed: boolean;
  reasons: string[];
};

export type AgentEvalReport = {
  version: 1;
  createdAt: string;
  cases: number;
  configs: string[];
  k: number;
  overall: ConfigMetrics;
  byConfig: Record<string, ConfigMetrics>;
  runs: AgentRunRecord[];
  gate: GateResult;
};
