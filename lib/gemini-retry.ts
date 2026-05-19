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

/** 免费层「按模型每日 generateContent 次数」用尽（重试无效，需换日/换模型/开通计费） */
export function isGeminiDailyQuotaExceeded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /generate_content_free_tier/i.test(msg) ||
    /GenerateRequestsPerDay/i.test(msg) ||
    /exceeded your current quota/i.test(msg) ||
    (/QuotaFailure/i.test(msg) && /PerDay|free_tier|FreeTier/i.test(msg))
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
    `今日 Gemini 免费额度已用完（${model} 每天约 ${limit} 次分析请求，含失败重试也会扣次数）。` +
    `请明天再试，或在 [Google AI Studio](https://aistudio.google.com/apikey) 为项目开通按量计费后继续使用同一 Key。` +
    `请在 AI Studio 确认有额度的模型，并在 Vercel 设置 GEMINI_MODEL=gemini-2.5-flash（勿用 2.0 系列，常为 0/0）。用量： https://ai.dev/rate-limit`
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
