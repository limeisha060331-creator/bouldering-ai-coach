import { describe, expect, it } from "vitest";
import type { SessionFact } from "../lib/agent/context";
import {
  runRepairLoop,
  validateReport,
  type ValidationContext,
} from "../lib/agent/validate";

function fact(
  id: string,
  atSec: number,
  bodyPart: string,
  detail: string,
  confidence = 0.9
): SessionFact {
  return {
    id,
    kind: "kinematic",
    atSec,
    bodyPart,
    detail,
    confidence,
    sourceCallId: "c1",
  };
}

const context: ValidationContext = {
  durationSec: 45,
  facts: [
    fact("f1", 5, "右脚", "脚尖没有压住岩点"),
    fact("f2", 12, "胯部", "离墙太远"),
  ],
};

function report(segments: Array<{ t: string; evidence: string; fix?: string }>) {
  return JSON.stringify({
    grade: "V4",
    score: 78,
    dimensionScores: { hips: 4, power: 3, feet: 3, sequence: 4, completion: 4 },
    segments,
    overallAdvice: "下次先解决起步脚点，再处理中段重心。",
  });
}

const GOOD = report([
  { t: "00:05", evidence: "起步时右脚脚尖没有压住岩点", fix: "先用脚尖压住再发力" },
  { t: "00:12", evidence: "中段胯部离墙超过一拳", fix: "折膝时把膝盖往里扣" },
]);

describe("agent validators", () => {
  it("契约、时间轴、证据、覆盖都成立时通过", () => {
    const result = validateReport(GOOD, context);

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.contract?.segments).toHaveLength(2);
  });

  it("非 JSON 输出归为 E1 契约错误", () => {
    const result = validateReport("这次攀爬整体不错，注意重心。", context);

    expect(result.ok).toBe(false);
    expect(result.contract).toBeNull();
    expect(result.issues[0]?.code).toBe("E_SCHEMA");
    expect(result.issues[0]?.class).toBe("E1");
  });

  it("时间戳超出视频时长", () => {
    const result = validateReport(
      report([
        { t: "00:05", evidence: "起步时右脚脚尖没有压住岩点" },
        { t: "01:30", evidence: "结尾处身体完全展开" },
      ]),
      context
    );

    expect(result.issues.map((item) => item.code)).toContain(
      "E_TIMESTAMP_OUT_OF_RANGE"
    );
  });

  it("时间戳倒序", () => {
    const result = validateReport(
      report([
        { t: "00:12", evidence: "中段胯部离墙超过一拳" },
        { t: "00:05", evidence: "起步时右脚脚尖没有压住岩点" },
      ]),
      context
    );

    expect(result.issues.map((item) => item.code)).toContain(
      "E_TIMESTAMP_NOT_MONOTONIC"
    );
  });

  it("没有工具事实支撑的点评判为 E2", () => {
    const result = validateReport(
      report([
        { t: "00:05", evidence: "起步时右脚脚尖没有压住岩点" },
        { t: "00:12", evidence: "中段胯部离墙超过一拳" },
        { t: "00:30", evidence: "最后一步左手发力不够" },
      ]),
      context
    );

    expect(result.issues.map((item) => item.code)).toContain(
      "E_CLAIM_WITHOUT_EVIDENCE"
    );
  });

  it("漏掉关键事实判为 E3", () => {
    const result = validateReport(
      report([{ t: "00:05", evidence: "起步时右脚脚尖没有压住岩点" }]),
      context
    );

    const codes = result.issues.map((item) => item.code);
    expect(codes).toContain("E_COVERAGE_MISS");
    expect(codes).toContain("E_TOO_FEW_SEGMENTS");
  });

  it("空报告不会因为“没写错”而通过", () => {
    const result = validateReport(report([]), context);

    expect(result.ok).toBe(false);
  });

  it("安全红线判为 E4，且优先级最高", () => {
    const result = validateReport(
      report([
        { t: "00:05", evidence: "起步前建议服用止痛药", fix: "按剂量吃" },
        { t: "00:12", evidence: "中段胯部离墙超过一拳" },
      ]),
      context
    );

    const safety = result.issues.find((item) => item.class === "E4");
    expect(safety?.code).toBe("E_SAFETY_BLOCKED");
  });
});

describe("repair loop", () => {
  it("首轮失败后带着结构化反馈修复成功", async () => {
    const outputs = ["不是 JSON", GOOD];
    const feedbacks: Array<string | null> = [];
    let index = 0;

    const outcome = await runRepairLoop({
      generate: async ({ feedbackText }) => {
        feedbacks.push(feedbackText);
        return outputs[index++];
      },
      validate: (raw) => validateReport(raw, context),
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.telemetry.firstPass).toBe(false);
    expect(outcome.telemetry.repaired).toBe(true);
    expect(outcome.telemetry.codes).toContain("E_SCHEMA");
    expect(feedbacks[0]).toBeNull();
    expect(feedbacks[1]).toContain("E_SCHEMA");
    expect(feedbacks[1]).toContain("只输出一个 JSON 对象");
  });

  it("安全红线不重试", async () => {
    const bad = report([
      { t: "00:05", evidence: "起步前建议服用止痛药", fix: "按剂量吃" },
      { t: "00:12", evidence: "中段胯部离墙超过一拳" },
    ]);
    let calls = 0;

    const outcome = await runRepairLoop({
      generate: async () => {
        calls += 1;
        return bad;
      },
      validate: (raw) => validateReport(raw, context),
    });

    expect(outcome.ok).toBe(false);
    expect(calls).toBe(1);
    expect(outcome.telemetry.exhausted).toBe(true);
    expect(outcome.telemetry.codes).toContain("E_SAFETY_BLOCKED");
  });

  it("一直修不好时按上限停止", async () => {
    let calls = 0;

    const outcome = await runRepairLoop({
      generate: async () => {
        calls += 1;
        return "仍然不是 JSON";
      },
      validate: (raw) => validateReport(raw, context),
    });

    expect(outcome.ok).toBe(false);
    expect(calls).toBe(3);
    expect(outcome.attempts).toHaveLength(3);
    expect(outcome.telemetry.byClass.E1).toBe(3);
    expect(outcome.telemetry.exhausted).toBe(true);
  });
});
