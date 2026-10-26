import { describe, expect, it } from "vitest";
import {
  computeCost,
  estimateDeepSeekFrameUsage,
  estimateGeminiVideoUsage,
  estimateTextTokens,
  formatUsd,
} from "../lib/ai-cost";

describe("ai-cost", () => {
  it("按百万 token 单价计算 Gemini 成本", () => {
    const cost = computeCost("gemini-2.5-flash", {
      inputTextTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cost.inputCostUsd).toBeCloseTo(0.3, 6);
    expect(cost.outputCostUsd).toBeCloseTo(2.5, 6);
    expect(cost.totalCostUsd).toBeCloseTo(2.8, 6);
    expect(cost.totalCostCny).toBeCloseTo(19.88, 4);
  });

  it("缓存输入单独计价，不与普通输入混在一起", () => {
    const cost = computeCost("gemini-2.5-flash", {
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });

    expect(cost.inputCostUsd).toBeCloseTo(0.03, 6);
  });

  it("按视频秒数估算 Gemini 输入 token", () => {
    const usage = estimateGeminiVideoUsage({
      durationSec: 45,
      promptText: "教练提示词",
      outputText: "一段点评",
      locale: "zh",
    });

    expect(usage.inputVideoTokens).toBe(45 * 263);
    expect(usage.inputTextTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it("按抽帧数估算 DeepSeek 输入 token", () => {
    const usage = estimateDeepSeekFrameUsage({
      frameCount: 16,
      promptText: "教练提示词",
      outputText: "一段点评",
      locale: "zh",
    });

    expect(usage.inputImageTokens).toBe(16 * 258);
    expect(usage.inputVideoTokens).toBeUndefined();
  });

  it("中文按字符数折算 token，空文本返回 0", () => {
    expect(estimateTextTokens("", "zh")).toBe(0);
    expect(estimateTextTokens("你好世界", "zh")).toBe(3);
  });

  it("小额成本保留四位小数，便于看清单次开销", () => {
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(8.123)).toBe("$8.12");
  });
});
