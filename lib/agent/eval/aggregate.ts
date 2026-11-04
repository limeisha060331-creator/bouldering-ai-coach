import { scoreRun } from "./trajectory";
import type {
  AgentEvalCase,
  AgentRunRecord,
  ConfigMetrics,
} from "./types";

/** 最近秩法，结果与样本顺序无关 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
}

export function computeConfigMetrics(
  cases: AgentEvalCase[],
  runs: AgentRunRecord[],
  k: number
): ConfigMetrics {
  const byCase = new Map<string, AgentRunRecord[]>();
  const failureTags: Record<string, number> = {};
  let passedRuns = 0;
  let steps = 0;
  let recall = 0;
  let orderViolations = 0;

  for (const run of runs) {
    const testCase = cases.find((item) => item.id === run.caseId);
    if (!testCase) continue;
    const score = scoreRun(testCase, run);

    if (score.passed) passedRuns += 1;
    for (const reason of score.reasons) {
      failureTags[reason] = (failureTags[reason] ?? 0) + 1;
    }
    for (const issue of run.validation.issues) {
      failureTags[issue.code] = (failureTags[issue.code] ?? 0) + 1;
    }
    for (const call of run.toolCalls) {
      if (call.errorCode) {
        failureTags[call.errorCode] = (failureTags[call.errorCode] ?? 0) + 1;
      }
    }

    steps += score.trajectory.steps;
    recall += score.trajectory.toolRecall;
    orderViolations += score.trajectory.orderViolations;

    const list = byCase.get(run.caseId) ?? [];
    list.push(run);
    byCase.set(run.caseId, list);
  }

  let casePass = 0;
  let passPowK = 0;
  for (const testCase of cases) {
    const list = (byCase.get(testCase.id) ?? []).sort((a, b) => a.k - b.k);
    const scores = list.map((run) => scoreRun(testCase, run).passed);
    if (scores.some(Boolean)) casePass += 1;
    if (scores.length >= k && scores.every(Boolean)) passPowK += 1;
  }

  const caseCount = Math.max(1, cases.length);
  const runCount = Math.max(1, runs.length);

  return {
    runs: runs.length,
    runPassRate: round(passedRuns / runCount),
    casePassRate: round(casePass / caseCount),
    passPowK: round(passPowK / caseCount),
    p50LatencyMs: percentile(runs.map((run) => run.durationMs), 50),
    p90LatencyMs: percentile(runs.map((run) => run.durationMs), 90),
    p50CostUsd: round(percentile(runs.map((run) => run.costUsd), 50)),
    p90CostUsd: round(percentile(runs.map((run) => run.costUsd), 90)),
    avgSteps: round(steps / runCount),
    avgToolRecall: round(recall / runCount),
    avgOrderViolations: round(orderViolations / runCount),
    failureTags: sortRecord(failureTags),
  };
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  const output: Record<string, number> = {};
  for (const key of Object.keys(input).sort()) {
    output[key] = input[key];
  }
  return output;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
