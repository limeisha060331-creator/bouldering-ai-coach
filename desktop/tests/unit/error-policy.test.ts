import { describe, expect, it } from "vitest";
import { classifyAnalysisError } from "../../electron/error-policy";
import { RetryLaterError } from "../../electron/errors";

describe("classifyAnalysisError", () => {
  it("RetryLaterError 直接沿用等待时间", () => {
    const decision = classifyAnalysisError(
      new RetryLaterError("Gemini 正在处理视频…", 2.5)
    );
    expect(decision.retryable).toBe(true);
    expect(decision.waitSeconds).toBe(2.5);
    expect(decision.message).toBe("Gemini 正在处理视频…");
  });

  it("RPM 限流 → 可重试，带等待秒数", () => {
    const decision = classifyAnalysisError(
      new Error("429 GenerateRequestsPerMinute retry in 20s")
    );
    expect(decision.retryable).toBe(true);
    expect(decision.waitSeconds).toBe(23);
    expect(decision.dailyQuotaExhausted).toBe(false);
  });

  it("日配额硬停 → 不可重试且标记配额耗尽", () => {
    const decision = classifyAnalysisError(
      new Error(
        "429 QuotaFailure generate_content_free_tier GenerateRequestsPerDay limit: 20 retry in 9000s"
      )
    );
    expect(decision.retryable).toBe(false);
    expect(decision.dailyQuotaExhausted).toBe(true);
  });

  it("未知错误 → 不可重试，并给出可读文案", () => {
    const decision = classifyAnalysisError(new Error("模型返回了奇怪的东西"));
    expect(decision.retryable).toBe(false);
    expect(decision.message).toContain("模型返回了奇怪的东西");
  });

  it("API Key 失效被翻译为可操作提示", () => {
    const decision = classifyAnalysisError(new Error("API key not valid"));
    expect(decision.retryable).toBe(false);
    expect(decision.message).toContain("GEMINI_API_KEY");
  });
});
