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

export function isGeminiRetryableError(err: unknown): boolean {
  return isGeminiRateLimitError(err) || isGeminiTransientError(err);
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
