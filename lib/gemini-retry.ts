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
 * 报错涉及 generateContent 免费日配额（与 AI Studio 总 RPD 可能不是同一计数器）。
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

/** Google 建议等待超过 1 小时时，视为当日额度真正用尽 */
export function isGeminiDailyQuotaHardStop(err: unknown): boolean {
  if (!isGeminiDailyQuotaExceeded(err)) return false;
  const raw = parseGeminiRetrySecondsRaw(err);
  if (raw == null) return true;
  return raw > 3600;
}

/** 从报错解析 retry in Xs（不封顶，用于判断是否硬失败） */
export function parseGeminiRetrySecondsRaw(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (match) return Math.ceil(parseFloat(match[1]));
  return null;
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
    `Gemini 请求过于频繁（免费档约 5 次/分钟）。` +
    `请等待约 ${waitSec} 秒后自动重试，分析过程中请勿连续点击。` +
    ` 用量： https://aistudio.google.com/rate-limit`
  );
}

/** generateContent 配额冷却（RPD 未满也可能出现，会自动重试） */
export function formatGeminiGenerateContentCooldownMessage(err: unknown): string {
  const waitSec = parseGeminiRetrySeconds(err);
  return (
    `Gemini 视频分析接口（generateContent）触发免费配额限制，约 ${waitSec} 秒后自动重试。` +
    `AI Studio 里的 RPD 与该项计数可能不一致；请保持页面打开、勿重复点击。` +
    `若多次失败，可在 Google AI Studio 开通按量计费。`
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
  const model = modelMatch?.[1] ?? "gemini-2.5-flash";
  const limit = limitMatch?.[1] ?? "20";

  return (
    `Gemini 视频分析（generateContent）今日免费次数已用尽（${model} 该项约 ${limit} 次/天）。` +
    `这与 AI Studio 总 RPD 可能不同步；请明天再试，或开通按量计费后继续使用同一 Key。` +
    ` https://aistudio.google.com/rate-limit`
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
  if (isGeminiDailyQuotaExceeded(err) && isGeminiDailyQuotaHardStop(err)) {
    return false;
  }
  return (
    isGeminiRateLimitError(err) ||
    isGeminiTransientError(err) ||
    isGeminiEmptyAnalysisError(err) ||
    isGeminiDailyQuotaExceeded(err)
  );
}

/** 从 Gemini 报错中解析建议等待秒数，如 "retry in 29.35s" */
export function parseGeminiRetrySeconds(err: unknown): number {
  const raw = parseGeminiRetrySecondsRaw(err);
  if (raw != null) return Math.min(120, raw + 3);
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
