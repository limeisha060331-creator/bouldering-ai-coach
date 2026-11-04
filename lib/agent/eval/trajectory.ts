import type {
  AgentEvalCase,
  AgentRunRecord,
  RunScore,
  TrajectoryMetrics,
} from "./types";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** 最长公共子序列，用来判断工具顺序偏离了多少 */
export function lcsLength(a: string[], b: string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i][j] =
        a[i - 1] === b[j - 1]
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }

  return table[a.length][b.length];
}

export function scoreTrajectory(
  testCase: AgentEvalCase,
  record: AgentRunRecord
): TrajectoryMetrics {
  const calls = record.toolCalls;
  const called = calls.map((call) => call.tool);

  const required = unique(testCase.requiredTools);
  const calledSet = new Set(called);
  const recall =
    required.length === 0
      ? 1
      : required.filter((tool) => calledSet.has(tool)).length / required.length;

  const allowed = new Set(testCase.allowedTools);
  const allowedCalls = called.filter((tool) => allowed.has(tool)).length;
  const precision = called.length === 0 ? 1 : allowedCalls / called.length;

  const callKeys = new Set(
    calls.map((call) => `${call.tool}:${call.argsHash}`)
  );
  const redundantCalls = calls.length - callKeys.size;

  const oracle = unique(testCase.oracleTools);
  const orderViolations = Math.max(0, oracle.length - lcsLength(called, oracle));

  const unsupportedClaims = record.validation.issues.filter(
    (issue) => issue.code === "E_CLAIM_WITHOUT_EVIDENCE"
  ).length;

  return {
    toolRecall: round(recall),
    toolPrecision: round(precision),
    orderViolations,
    redundantCalls,
    steps: calls.length,
    stepRatio: round(calls.length / Math.max(1, oracle.length)),
    unsupportedClaims,
  };
}

export function scoreRun(
  testCase: AgentEvalCase,
  record: AgentRunRecord
): RunScore {
  const trajectory = scoreTrajectory(testCase, record);
  const reasons: string[] = [];

  if (!record.validation.ok) reasons.push("validation-failed");
  if (trajectory.toolRecall < 1) reasons.push("missing-required-tool");
  if (trajectory.toolPrecision < 1) reasons.push("unexpected-tool");
  if (trajectory.orderViolations > 0) reasons.push("tool-order-violation");
  if (trajectory.redundantCalls > 0) reasons.push("redundant-call");
  if (trajectory.steps > testCase.maxSteps) reasons.push("step-budget");
  if (record.costUsd > testCase.budgetUsd) reasons.push("cost-budget");

  return { passed: reasons.length === 0, reasons, trajectory };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
