/** 将网关/代理返回的纯文本错误转为可读说明 */
export function humanizeNonJsonBody(
  status: number,
  text: string
): string {
  const lower = text.toLowerCase();
  if (
    status === 413 ||
    lower.includes("request entity too large") ||
    lower.includes("payload too large") ||
    lower.includes("body exceeded")
  ) {
    return (
      "上传体积超过服务器限制（Vercel 约 4.5MB）。请使用更短片段或等待前端压缩到 4MB 以内后再试。"
    );
  }
  if (status === 502 || status === 503 || status === 504) {
    return "服务暂时不可用或超时，请稍后重试。";
  }
  if (status === 429) {
    return "请求过于频繁，请稍后再试。";
  }
  const trimmed = text.trim().slice(0, 280);
  return trimmed || `请求失败（HTTP ${status}）`;
}

export type ParsedFetchJson<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  rawText: string;
  parseError: boolean;
};

/**
 * 先读文本再解析 JSON，避免 "Request Entity Too Large" 等纯文本触发 SyntaxError。
 */
export async function readFetchJson<T extends Record<string, unknown>>(
  res: Response
): Promise<ParsedFetchJson<T>> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      rawText,
      parseError: !res.ok,
    };
  }

  try {
    const data = JSON.parse(rawText) as T;
    return {
      ok: res.ok,
      status: res.status,
      data,
      rawText,
      parseError: false,
    };
  } catch {
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      rawText,
      parseError: true,
    };
  }
}

export function errorFromFetchJson<T extends { error?: string; retryable?: boolean }>(
  parsed: ParsedFetchJson<T>,
  fallback: string
): { message: string; retryable: boolean } {
  if (parsed.parseError || !parsed.data) {
    return {
      message: humanizeNonJsonBody(parsed.status, parsed.rawText),
      retryable: parsed.status >= 500 || parsed.status === 429 || parsed.status === 413,
    };
  }
  const data = parsed.data;
  return {
    message: data.error || fallback,
    retryable: Boolean(data.retryable) || parsed.status >= 500 || parsed.status === 429,
  };
}
