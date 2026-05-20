export function isGeminiRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource exhausted")
  );
}

/**
 * 免费层「按模型每日 generateContent 次数」用尽。
 * 勿用宽泛的 "exceeded your current quota"——RPM 限流也会带这句。
 */
export function isGeminiDailyQuotaExceeded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/GenerateRequestsPerMinute|RequestsPerMinute|per minute/i.test(msg)) {
    return false;
  }
  return (
    /generate_content_free_tier/i.test(msg) ||
    /GenerateRequestsPerDay/i.test(msg) ||
    (/QuotaFailure/i.test(msg) &&
      /PerDay|free_tier|FreeTier|GenerateRequestsPerDay/i.test(msg))
  );
}

/** 免费档 RPM 过密（AI Studio 里常见 5 RPM） */
export function isGeminiRpmRateLimit(err: unknown): boolean {
  if (isGeminiDailyQuotaExceeded(err)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    isGeminiRateLimitError(err) &&
    (/GenerateRequestsPerMinute|RequestsPerMinute/i.test(msg) ||
      /retry in \d/i.test(msg))
  );
}

export function formatGeminiRpmRateLimitMessage(err: unknown): string {
  const waitSec = parseGeminiRetrySeconds(err);
  return (
    `Gemini 请求过于频繁（免费档约 5 次/分钟，AI Studio 显示 RPM 未满日额度 RPD 时多为该项）。` +
    `请等待约 ${waitSec} 秒后自动重试，分析过程中请勿连续点击。` +
    ` 用量： https://aistudio.google.com/rate-limit`
  );
}

/** 短时 RPM/并发 429，等待后可能成功 */
export function isGeminiTransientRateLimit(err: unknown): boolean {
  return isGeminiRateLimitError(err) && !isGeminiDailyQuotaExceeded(err);
}

export function formatGeminiDailyQuotaMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const modelMatch = msg.match(/model:\s*([\w.-]+)/i);
  const limitMatch = msg.match(/limit:\s*(\d+)/i);
  const model = modelMatch?.[1] ?? "当前模型";
  const limit = limitMatch?.[1] ?? "20";

  return (
    `Gemini 今日分析次数已达免费上限（${model} 的 generateContent 日配额约 ${limit} 次/天，以 AI Studio 中 RPD 为准）。` +
    `若控制台显示 RPD 未满，请刷新后重试或查看是否误触 RPM（5 次/分钟）。` +
    `也可在 [Google AI Studio](https://aistudio.google.com/apikey) 开通按量计费。用量： https://ai.dev/rate-limit`
  );
}

/** 503 / 502 / 500 等可稍后重试的临时故障 */
export function isGeminiTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("500") ||
    lower.includes("service unavailable") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("high demand") ||
    lower.includes("experiencing") ||
    lower.includes("internal error")
  );
}

import { isGeminiEmptyAnalysisError } from "./gemini-response-text";

export function isGeminiRetryableError(err: unknown): boolean {
  if (isGeminiDailyQuotaExceeded(err)) return false;
  return (
    isGeminiTransientRateLimit(err) ||
    isGeminiTransientError(err) ||
    isGeminiEmptyAnalysisError(err)
  );
}

/** 从 Gemini 报错中解析建议等待秒数，如 "retry in 29.35s" */
export function parseGeminiRetrySeconds(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (match) return Math.min(120, Math.ceil(parseFloat(match[1])) + 3);
  if (isGeminiTransientError(err)) return 25;
  return 45;
}

/** 同一次 generateContent 内的退避（秒） */
export function transientBackoffSeconds(attempt: number): number {
  const schedule = [4, 8, 16, 24];
  return schedule[Math.min(attempt - 1, schedule.length - 1)] ?? 24;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
