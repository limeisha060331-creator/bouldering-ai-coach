import { describe, expect, it } from "vitest";
import {
  formatGeminiDailyQuotaMessage,
  formatGeminiRpmRateLimitMessage,
  isGeminiDailyQuotaExceeded,
  isGeminiDailyQuotaHardStop,
  isGeminiRateLimitError,
  isGeminiRetryableError,
  isGeminiRpmRateLimit,
  isGeminiTransientError,
  parseGeminiRetrySeconds,
  transientBackoffSeconds,
} from "@lib/gemini-retry";

const rpmError = new Error(
  "429 QuotaFailure GenerateRequestsPerMinute PerMinute retry in 12.5s"
);
const dailyHardStop = new Error(
  "429 QuotaFailure generate_content_free_tier GenerateRequestsPerDay limit: 20 retry in 7200s"
);
const transient = new Error("503 Service Unavailable: model is overloaded");

describe("gemini-retry 分类", () => {
  it("识别 RPM 限流（可短时重试）", () => {
    expect(isGeminiRateLimitError(rpmError)).toBe(true);
    expect(isGeminiRpmRateLimit(rpmError)).toBe(true);
    expect(isGeminiDailyQuotaExceeded(rpmError)).toBe(false);
    expect(isGeminiRetryableError(rpmError)).toBe(true);
  });

  it("识别日配额硬停（不应无限重试）", () => {
    expect(isGeminiDailyQuotaExceeded(dailyHardStop)).toBe(true);
    expect(isGeminiDailyQuotaHardStop(dailyHardStop)).toBe(true);
    expect(isGeminiRetryableError(dailyHardStop)).toBe(false);
    expect(formatGeminiDailyQuotaMessage(dailyHardStop)).toContain("20");
  });

  it("识别 503 临时故障", () => {
    expect(isGeminiTransientError(transient)).toBe(true);
    expect(isGeminiRetryableError(transient)).toBe(true);
  });

  it("解析等待秒数并封顶 120s", () => {
    expect(parseGeminiRetrySeconds(rpmError)).toBe(16);
    expect(parseGeminiRetrySeconds(transient)).toBe(25);
    expect(parseGeminiRetrySeconds(new Error("no hint"))).toBe(45);
    expect(parseGeminiRetrySeconds(dailyHardStop)).toBe(120);
  });

  it("RPM 文案包含等待时间", () => {
    expect(formatGeminiRpmRateLimitMessage(rpmError)).toContain("16");
  });

  it("退避时间表为递增", () => {
    expect(transientBackoffSeconds(1)).toBe(4);
    expect(transientBackoffSeconds(4)).toBe(24);
    expect(transientBackoffSeconds(9)).toBe(24);
  });
});
