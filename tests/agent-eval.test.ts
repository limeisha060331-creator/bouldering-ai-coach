import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AgentEvalCase,
  AgentRunRecord,
  ConfigMetrics,
} from "../lib/agent/eval";
import {
  VIOLATION_KINDS,
  computeConfigMetrics,
  evaluateGate,
  lcsLength,
  oracleRecord,
  runAgentEval,
  runHarnessSelfTest,
  scoreRun,
  scoreTrajectory,
  withViolation,
} from "../lib/agent/eval";

function makeCase(overrides: Partial<AgentEvalCase> = {}): AgentEvalCase {
  return {
    id: "case-1",
    title: "V4 侧机位抱石",
    durationSec: 45,
    grade: "V4",
    angle: "side",
    requiredTools: ["video_probe", "pose_extract"],
    allowedTools: ["video_probe", "pose_extract", "frame_grab"],
    oracleTools: ["video_probe", "pose_extract", "frame_grab"],
    maxSteps: 3,
    budgetUsd: 0.2,
    ...overrides,
  };
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "crux-agent-eval-"));
  tempDirs.push(dir);
  return dir;
}

describe("轨迹打分", () => {
  it("标准答案轨迹全部通过", () => {
    const testCase = makeCase();
    const oracle = oracleRecord(testCase, { config: "m", k: 1 });

    const score = scoreRun(testCase, oracle);

    expect(score.passed).toBe(true);
    expect(score.reasons).toEqual([]);
    expect(score.trajectory).toMatchObject({
      toolRecall: 1,
      toolPrecision: 1,
      orderViolations: 0,
      redundantCalls: 0,
      steps: 3,
      stepRatio: 1,
      unsupportedClaims: 0,
    });
  });

  it("少调必需工具时召回率下降并被判失败", () => {
    const testCase = makeCase();
    const broken = withViolation(
      oracleRecord(testCase, { config: "m", k: 1 }),
      "missing-tool"
    );

    const score = scoreRun(testCase, broken);

    expect(score.passed).toBe(false);
    expect(score.reasons).toContain("missing-required-tool");
    expect(score.trajectory.toolRecall).toBeCloseTo(0.5);
  });

  it("调用白名单之外的工具会拉低精确率", () => {
    const testCase = makeCase();
    const record = oracleRecord(testCase, { config: "m", k: 1 });
    record.toolCalls.push({
      tool: "shell_exec",
      argsHash: "evil",
      ok: true,
      durationMs: 5,
      replay: false,
    });

    const score = scoreRun(testCase, record);

    expect(score.passed).toBe(false);
    expect(score.reasons).toContain("unexpected-tool");
    expect(score.trajectory.toolPrecision).toBeCloseTo(0.75);
  });

  it("工具顺序颠倒会产生顺序违规", () => {
    const testCase = makeCase();
    const broken = withViolation(
      oracleRecord(testCase, { config: "m", k: 1 }),
      "wrong-order"
    );

    const score = scoreRun(testCase, broken);

    expect(score.passed).toBe(false);
    expect(score.reasons).toContain("tool-order-violation");
    expect(score.trajectory.orderViolations).toBeGreaterThan(0);
  });

  it("相同工具加相同参数重复调用算冗余", () => {
    const testCase = makeCase();
    const broken = withViolation(
      oracleRecord(testCase, { config: "m", k: 1 }),
      "redundant"
    );

    const score = scoreRun(testCase, broken);

    expect(score.passed).toBe(false);
    expect(score.reasons).toContain("redundant-call");
    expect(score.trajectory.redundantCalls).toBe(1);
  });

  it("结论正确但完全绕过工具仍然不通过", () => {
    const testCase = makeCase();
    const record: AgentRunRecord = {
      ...oracleRecord(testCase, { config: "m", k: 1 }),
      toolCalls: [],
    };

    const score = scoreRun(testCase, record);

    expect(score.passed).toBe(false);
    expect(score.reasons).toContain("missing-required-tool");
    expect(score.trajectory.steps).toBe(0);
  });

  it("超过步数预算不通过", () => {
    const testCase = makeCase({ maxSteps: 2 });
    const record = oracleRecord(testCase, { config: "m", k: 1 });

    const score = scoreRun(testCase, record);

    expect(score.passed).toBe(false);
    expect(score.reasons).toContain("step-budget");
  });

  it("超过成本预算不通过", () => {
    const testCase = makeCase();
    const record = {
      ...oracleRecord(testCase, { config: "m", k: 1 }),
      costUsd: testCase.budgetUsd + 0.01,
    };

    const score = scoreRun(testCase, record);

    expect(score.passed).toBe(false);
    expect(score.reasons).toContain("cost-budget");
  });

  it("无证据的结论单独计数", () => {
    const testCase = makeCase();
    const broken = withViolation(
      oracleRecord(testCase, { config: "m", k: 1 }),
      "unsupported-claim"
    );

    expect(scoreTrajectory(testCase, broken).unsupportedClaims).toBe(1);
    expect(scoreRun(testCase, broken).passed).toBe(false);
  });

  it("LCS 能识别完全一致和完全颠倒的序列", () => {
    expect(lcsLength(["a", "b", "c"], ["a", "b", "c"])).toBe(3);
    expect(lcsLength(["c", "b", "a"], ["a", "b", "c"])).toBe(1);
    expect(lcsLength([], ["a"])).toBe(0);
  });
});

describe("harness 自测", () => {
  it("标准答案全过，七类违规全部被抓", () => {
    const cases = [
      makeCase({ id: "case-1" }),
      makeCase({
        id: "case-2",
        requiredTools: ["video_probe", "frame_grab"],
        oracleTools: ["video_probe", "frame_grab"],
      }),
    ];

    const result = runHarnessSelfTest(cases);

    expect(result.oraclePassed).toBe(true);
    expect(result.total).toBe(cases.length * VIOLATION_KINDS.length);
    expect(result.caught).toBe(result.total);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("自测能发现坏的标准答案", () => {
    const impossible = makeCase({
      id: "bad-oracle",
      requiredTools: ["video_probe", "pose_extract", "memory_write"],
    });

    const result = runHarnessSelfTest([impossible]);

    expect(result.ok).toBe(false);
    expect(result.oraclePassed).toBe(false);
  });
});

describe("聚合指标", () => {
  it("pass^k 要求同一 case 的 k 次全部通过", () => {
    const caseA = makeCase({ id: "a" });
    const caseB = makeCase({ id: "b" });
    const runs = [
      oracleRecord(caseA, { config: "m", k: 1 }),
      oracleRecord(caseA, { config: "m", k: 2 }),
      oracleRecord(caseB, { config: "m", k: 1 }),
      withViolation(
        oracleRecord(caseB, { config: "m", k: 2 }),
        "missing-tool"
      ),
    ];

    const metrics = computeConfigMetrics([caseA, caseB], runs, 2);

    expect(metrics.runPassRate).toBe(0.75);
    expect(metrics.casePassRate).toBe(1);
    expect(metrics.passPowK).toBe(0.5);
    expect(metrics.failureTags["missing-required-tool"]).toBe(1);
  });

  it("时延和成本用最近秩法取 P50/P90", () => {
    const testCase = makeCase();
    const runs = [100, 200, 300, 400, 500].map((durationMs, index) => ({
      ...oracleRecord(testCase, { config: "m", k: index + 1 }),
      durationMs,
      costUsd: index / 100,
    }));

    const metrics = computeConfigMetrics([testCase], runs, 1);

    expect(metrics.p90LatencyMs).toBe(500);
    expect(metrics.p50CostUsd).toBe(0.02);
  });
});

describe("门禁", () => {
  const healthy: ConfigMetrics = {
    runs: 4,
    runPassRate: 1,
    casePassRate: 1,
    passPowK: 1,
    p50LatencyMs: 1_000,
    p90LatencyMs: 2_000,
    p50CostUsd: 0.01,
    p90CostUsd: 0.02,
    avgSteps: 3,
    avgToolRecall: 1,
    avgOrderViolations: 0,
    failureTags: {},
  };

  it("全部达标时放行", () => {
    expect(evaluateGate({ overall: healthy })).toEqual({
      passed: true,
      reasons: [],
    });
  });

  it("P90 时延或成本超标时拒绝", () => {
    const slow = evaluateGate({ overall: { ...healthy, p90LatencyMs: 200_000 } });
    const pricey = evaluateGate({ overall: { ...healthy, p90CostUsd: 0.9 } });

    expect(slow.passed).toBe(false);
    expect(slow.reasons.join(" ")).toContain("P90 时延");
    expect(pricey.passed).toBe(false);
    expect(pricey.reasons.join(" ")).toContain("P90 成本");
  });

  it("顺序违规超过阈值时拒绝", () => {
    const result = evaluateGate({
      overall: { ...healthy, avgOrderViolations: 0.5 },
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("顺序违规");
  });

  it("能力不达标或用自定义阈值时按阈值判断", () => {
    expect(
      evaluateGate({ overall: { ...healthy, passPowK: 0.5 } }).passed
    ).toBe(false);
    expect(
      evaluateGate(
        { overall: { ...healthy, passPowK: 0.5 } },
        {
          minPassPowK: 0.5,
          maxP90LatencyMs: 3_000,
          maxP90CostUsd: 0.05,
          maxAvgOrderViolations: 0,
        }
      ).passed
    ).toBe(true);
  });
});

describe("批量运行", () => {
  function fixedNow(): Date {
    return new Date("2026-11-04T00:00:00.000Z");
  }

  it("两次运行得到完全一致的报告", async () => {
    const cases = [makeCase({ id: "a" }), makeCase({ id: "b" })];
    const run = (dir: string) =>
      runAgentEval({
        cases,
        configs: ["model-a"],
        k: 2,
        outDir: dir,
        concurrency: 2,
        now: fixedNow,
        runCase: async ({ testCase, config, k }) => ({
          ...oracleRecord(testCase, { config, k }),
          runId: `run-${testCase.id}-${config}-${k}`,
        }),
      });

    const first = await run(await tempDir());
    const second = await run(await tempDir());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.runs).toHaveLength(4);
    expect(first.gate.passed).toBe(true);
  });

  it("断点续跑不会重复执行已完成的样本", async () => {
    const dir = await tempDir();
    const cases = [makeCase({ id: "a" }), makeCase({ id: "b" })];
    let executions = 0;

    const options = {
      cases,
      configs: ["model-a"],
      k: 2,
      outDir: dir,
      concurrency: 2,
      now: fixedNow,
      runCase: async ({
        testCase,
        config,
        k,
      }: {
        testCase: AgentEvalCase;
        config: string;
        k: number;
      }) => {
        executions += 1;
        return {
          ...oracleRecord(testCase, { config, k }),
          runId: `run-${testCase.id}-${config}-${k}`,
        };
      },
    };

    const first = await runAgentEval(options);
    expect(executions).toBe(4);

    const resumed = await runAgentEval({ ...options, resume: true });
    expect(executions).toBe(4);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(first));
  });
});
