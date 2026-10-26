import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateAnalysis } from "../lib/eval-metrics";
import {
  parseEvalCase,
  parseEvalFixture,
  type EvalCase,
  type EvalFixture,
} from "../lib/eval-schema";
import { parseAnalysis } from "../lib/parse-analysis";

function loadCase(id: string): EvalCase {
  const file = path.join(process.cwd(), "evals", "cases", `${id}.json`);
  return parseEvalCase(JSON.parse(fs.readFileSync(file, "utf8")) as unknown);
}

function loadFixture(fileName: string): EvalFixture {
  const file = path.join(process.cwd(), "evals", "fixtures", fileName);
  return parseEvalFixture(JSON.parse(fs.readFileSync(file, "utf8")) as unknown);
}

function run(caseId: string, fixtureFile: string) {
  const evalCase = loadCase(caseId);
  const fixture = loadFixture(fixtureFile);
  const parsed = parseAnalysis(fixture.raw);
  return evaluateAnalysis(evalCase, fixture.raw, parsed, fixture.label);
}

describe("eval-metrics", () => {
  it("强输出：格式、时间戳、难度、维度分都通过", () => {
    const metrics = run("case-001", "case-001-strong.json");

    expect(metrics.formatValid).toBe(true);
    expect(metrics.scorePresent).toBe(true);
    expect(metrics.gradeMatch).toBe(true);
    expect(metrics.timestampInRangeRate).toBe(1);
    expect(metrics.timestampMonotonic).toBe(true);
    expect(metrics.mustMentionCoverage).toBe(1);
    expect(metrics.genericAdviceRate).toBe(0);
    expect(metrics.duplicateSegmentRate).toBe(0);
    expect(metrics.dimensionMae).toBe(0);
    expect(metrics.qualityScore).toBeGreaterThan(0.9);
    expect(metrics.failureCodes).not.toContain("TIMESTAMP_OUT_OF_RANGE");
  });

  it("空话输出：触发空话率、漏线索、缺维度分", () => {
    const metrics = run("case-002", "case-002-generic.json");

    expect(metrics.mustMentionCoverage).toBeCloseTo(1 / 3, 4);
    expect(metrics.genericAdviceRate).toBeGreaterThan(0.5);
    expect(metrics.dimensionMae).toBeNull();
    expect(metrics.failureCodes).toContain("GENERIC_ADVICE");
    expect(metrics.failureCodes).toContain("MUST_MENTION_MISSED");
    expect(metrics.failureCodes).toContain("DIMENSION_SCORES_MISSING");
    expect(metrics.qualityScore).toBeLessThan(0.7);
  });

  it("坏输出：越界、倒序、重复、缺分、难度不一致都能被抓住", () => {
    const metrics = run("case-003", "case-003-malformed.json");

    expect(metrics.formatValid).toBe(false);
    expect(metrics.scorePresent).toBe(false);
    expect(metrics.gradeMatch).toBe(false);
    expect(metrics.timestampInRangeRate).toBeCloseTo(0.75, 4);
    expect(metrics.timestampMonotonic).toBe(false);
    expect(metrics.duplicateSegmentRate).toBeCloseTo(0.25, 4);
    expect(metrics.dimensionMae).toBeNull();
    expect(metrics.failureCodes).toEqual(
      expect.arrayContaining([
        "SCORE_MISSING",
        "GRADE_MISMATCH",
        "TIMESTAMP_OUT_OF_RANGE",
        "TIMESTAMP_NOT_MONOTONIC",
        "DUPLICATE_SEGMENT",
        "DIMENSION_SCORES_MISSING",
      ])
    );
    expect(metrics.qualityScore).toBeLessThan(0.6);
  });
});
