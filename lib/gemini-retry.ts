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

/** 从 Gemini 报错中解析建议等待秒数，如 "retry in 29.35s" */
export function parseGeminiRetrySeconds(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (match) return Math.min(120, Math.ceil(parseFloat(match[1])) + 3);
  return 45;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
