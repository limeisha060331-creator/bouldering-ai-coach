import { scoreRun } from "./trajectory";
import type { AgentEvalCase, AgentRunRecord } from "./types";

export type ViolationKind =
  | "missing-tool"
  | "wrong-order"
  | "redundant"
  | "unsupported-claim"
  | "over-step"
  | "over-budget"
  | "validation-failed";

export const VIOLATION_KINDS: ViolationKind[] = [
  "missing-tool",
  "wrong-order",
  "redundant",
  "unsupported-claim",
  "over-step",
  "over-budget",
  "validation-failed",
];

export function oracleRecord(
  testCase: AgentEvalCase,
  input: { config: string; k: number; runId?: string }
): AgentRunRecord {
  return {
    runId: input.runId ?? `oracle-${testCase.id}-${input.config}-${input.k}`,
    caseId: testCase.id,
    config: input.config,
    k: input.k,
    startedAt: "2026-11-04T10:00:00.000Z",
    durationMs: 1_000,
    costUsd: Math.min(0.01, testCase.budgetUsd),
    output: '{"ok":true}',
    toolCalls: testCase.oracleTools.map((tool, index) => ({
      tool,
      argsHash: `oracle-${index}`,
      ok: true,
      durationMs: 100,
      replay: false,
    })),
    validation: { ok: true, issues: [] },
    contextDigest: `oracle-${testCase.id}`,
  };
}

export function withViolation(
  record: AgentRunRecord,
  kind: ViolationKind
): AgentRunRecord {
  const copy: AgentRunRecord = {
    ...record,
    toolCalls: record.toolCalls.map((call) => ({ ...call })),
    validation: {
      ok: record.validation.ok,
      issues: record.validation.issues.map((issue) => ({ ...issue })),
    },
  };

  switch (kind) {
    case "missing-tool":
      copy.toolCalls = copy.toolCalls.slice(1);
      return copy;
    case "wrong-order":
      copy.toolCalls = [...copy.toolCalls].reverse();
      return copy;
    case "redundant":
      copy.toolCalls = [...copy.toolCalls, { ...copy.toolCalls[copy.toolCalls.length - 1] }];
      return copy;
    case "unsupported-claim":
      copy.validation = {
        ok: false,
        issues: [
          ...copy.validation.issues,
          { code: "E_CLAIM_WITHOUT_EVIDENCE", class: "E2", path: "segments.0" },
        ],
      };
      return copy;
    case "over-step":
      copy.toolCalls = Array.from(
        { length: record.toolCalls.length + 1 },
        (_, index) => ({
          tool: record.toolCalls[0]?.tool ?? "unknown",
          argsHash: `repeat-${index}`,
          ok: true,
          durationMs: 10,
          replay: false,
        })
      );
      return copy;
    case "over-budget":
      copy.costUsd = record.costUsd + 1_000;
      return copy;
    case "validation-failed":
      copy.validation = {
        ok: false,
        issues: [
          ...copy.validation.issues,
          { code: "E_SCHEMA", class: "E1", path: "$" },
        ],
      };
      return copy;
  }
}

export type SelfTestResult = {
  ok: boolean;
  oraclePassed: boolean;
  caught: number;
  total: number;
  failures: string[];
};

/**
 * Harness 自证：
 * 标准答案必须 100% 通过，每一种已知违规必须 100% 被抓。
 * 这两条不过，后面的指标都是假的。
 */
export function runHarnessSelfTest(cases: AgentEvalCase[]): SelfTestResult {
  const failures: string[] = [];
  let oraclePassed = true;
  let caught = 0;
  let total = 0;

  for (const testCase of cases) {
    const oracle = oracleRecord(testCase, { config: "oracle", k: 1 });
    if (!scoreRun(testCase, oracle).passed) {
      oraclePassed = false;
      failures.push(`oracle 未通过: ${testCase.id}`);
    }

    for (const kind of VIOLATION_KINDS) {
      total += 1;
      const broken = withViolation(oracle, kind);
      if (!scoreRun(testCase, broken).passed) {
        caught += 1;
      } else {
        failures.push(`未抓到 ${kind}: ${testCase.id}`);
      }
    }
  }

  return {
    ok: oraclePassed && caught === total,
    oraclePassed,
    caught,
    total,
    failures,
  };
}
