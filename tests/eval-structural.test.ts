import { describe, expect, it } from "vitest";
import { parseAnalysis } from "../lib/parse-analysis";
import {
  aggregateStructural,
  evaluateStructural,
  type StructuralInput,
} from "../lib/eval-structural";

const FULL_OUTPUT = [
  "难度：V4",
  "评分：82/100",
  "[00:03] 起步时右脚踩在岩点边缘，脚尖没有压住，身体先向外倒了一次。",
  "[00:08] 第一次重心转移时胯部离墙约一拳，左手抓点后没有立刻把重心带过去。",
  "[00:15] 中段用了折膝，但膝盖方向偏外，右脚的受力点从脚尖滑到了脚掌。",
  "维度分：重心 4/5，发力 3/5，脚点 4/5，顺序 3/5，完攀 5/5",
].join("\n");

const REAL_BASELINE_OUTPUT = [
  "难度：V6",
  "[00:03] 起步时右脚踩在岩点边缘，脚尖没有压住，身体先向外倒了一次。",
  "[00:08] 第一次重心转移时胯部离墙约一拳，左手抓点后没有立刻把重心带过去。",
].join("\n");

function run(input: StructuralInput, raw: string) {
  return evaluateStructural(input, raw, parseAnalysis(raw));
}

const baseInput: StructuralInput = {
  caseId: "case-test",
  model: "gemini-2.5-flash",
  durationSec: 45,
  expectedGrade: "V4",
};

describe("eval-structural", () => {
  it("完整输出：契约、时间戳、维度分都成立", () => {
    const metrics = run(baseInput, FULL_OUTPUT);

    expect(metrics.formatValid).toBe(true);
    expect(metrics.scorePresent).toBe(true);
    expect(metrics.gradeMatch).toBe(true);
    expect(metrics.timestampInRangeRate).toBe(1);
    expect(metrics.dimensionScores).not.toBeNull();
    expect(metrics.structuralScore).toBeGreaterThan(0.9);
    expect(metrics.failureCodes).toHaveLength(0);
  });

  it("真实基线那种输出：能解析，但缺总分与 5 维分，按契约未通过计", () => {
    const metrics = run({ ...baseInput, expectedGrade: "V6" }, REAL_BASELINE_OUTPUT);

    expect(metrics.segmentCount).toBe(2);
    expect(metrics.formatValid).toBe(false);
    expect(metrics.scorePresent).toBe(false);
    expect(metrics.gradeMatch).toBe(true);
    expect(metrics.failureCodes).toContain("SCORE_MISSING");
    expect(metrics.failureCodes).toContain("DIMENSION_SCORES_MISSING");
  });

  it("缺总分属于 P0，不能因为能解析就算通过", () => {
    const metrics = run(baseInput, REAL_BASELINE_OUTPUT);

    const p0 = metrics.failures.filter((item) => item.severity === "P0");
    expect(p0.map((item) => item.code)).toContain("SCORE_MISSING");
  });

  it("时间戳越界与倒序分别报码", () => {
    const raw = [
      "评分：70/100",
      "[00:30] 出手前没有先移重心，肩膀先耸起来了。",
      "[01:12] 这一步在视频里根本不存在，属于编造的时间点。",
    ].join("\n");

    const metrics = run({ ...baseInput, durationSec: 30, expectedGrade: null }, raw);

    expect(metrics.failureCodes).toContain("TIMESTAMP_OUT_OF_RANGE");
    expect(metrics.timestampInRangeRate).toBeLessThan(1);
  });

  it("没有外部难度时不判 GRADE_MISMATCH，也不把难度算进结构分", () => {
    const metrics = run({ ...baseInput, expectedGrade: null }, FULL_OUTPUT);

    expect(metrics.gradeMatch).toBeNull();
    expect(metrics.failureCodes).not.toContain("GRADE_MISMATCH");
  });

  it("难度不一致时报 GRADE_MISMATCH", () => {
    const metrics = run({ ...baseInput, expectedGrade: "V10" }, FULL_OUTPUT);

    expect(metrics.gradeMatch).toBe(false);
    expect(metrics.failureCodes).toContain("GRADE_MISMATCH");
  });

  it("空话短语超过三成报 GENERIC_ADVICE", () => {
    const raw = [
      "评分：60/100",
      "[00:05] 注意重心，多练习就会好的，整体不错。",
      "[00:12] 加强核心，保持专注，继续努力。",
      "[00:20] 右脚踩在岩点边缘，脚尖没有压住，身体向外倒了一次。",
    ].join("\n");

    const metrics = run({ ...baseInput, expectedGrade: null }, raw);

    expect(metrics.genericAdviceRate).toBeGreaterThan(0.3);
    expect(metrics.failureCodes).toContain("GENERIC_ADVICE");
  });

  it("聚合层同时给出可解析率与契约完整率", () => {
    const complete = run(baseInput, FULL_OUTPUT);
    const partial = run(baseInput, REAL_BASELINE_OUTPUT);
    const aggregate = aggregateStructural([complete, partial]);

    expect(aggregate.parseableRate).toBe(1);
    expect(aggregate.formatValidRate).toBe(0.5);
    expect(aggregate.p0Cases).toBe(1);
    expect(aggregate.failureCounts.SCORE_MISSING).toBe(1);
  });
});
