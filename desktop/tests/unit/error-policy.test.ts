import { describe, expect, it } from "vitest";
import { classifyAnalysisError } from "../../electron/error-policy";
import { RetryLaterError } from "../../electron/errors";
import {
  DeepSeekApiError,
  DeepSeekEmptyAnalysisError,
} from "@lib/deepseek-analysis";

describe("classifyAnalysisError", () => {
  it("RetryLaterError 直接沿用等待时间", () => {
    const decision = classifyAnalysisError(
      new RetryLaterError("关键帧仍在准备…", 2.5)
    );
    expect(decision.retryable).toBe(true);
    expect(decision.waitSeconds).toBe(2.5);
    expect(decision.message).toBe("关键帧仍在准备…");
  });

  it("DeepSeek 限流 → 可重试，带等待秒数", () => {
    const decision = classifyAnalysisError(
      new DeepSeekApiError(429, "DeepSeek 触发限流，稍后会自动重试…", true, 20)
    );
    expect(decision.retryable).toBe(true);
    expect(decision.waitSeconds).toBe(20);
    expect(decision.message).toContain("限流");
  });

  it("余额不足 → 不可重试", () => {
    const decision = classifyAnalysisError(
      new DeepSeekApiError(402, "DeepSeek 账户余额不足", false)
    );
    expect(decision.retryable).toBe(false);
  });

  it("空正文 → 可重试", () => {
    const decision = classifyAnalysisError(
      new DeepSeekEmptyAnalysisError("DeepSeek 未返回分析正文")
    );
    expect(decision.retryable).toBe(true);
    expect(decision.waitSeconds).toBe(8);
  });

  it("未知错误 → 不可重试，并给出可读文案", () => {
    const decision = classifyAnalysisError(new Error("模型返回了奇怪的东西"));
    expect(decision.retryable).toBe(false);
    expect(decision.message).toContain("模型返回了奇怪的东西");
  });
});
