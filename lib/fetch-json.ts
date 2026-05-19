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
    if (lower.includes("blob") || lower.includes("bLOB_READ_WRITE")) {
      return "未配置 Vercel Blob。请在 Vercel → Storage 创建 Blob 并绑定 BLOB_READ_WRITE_TOKEN 后重新部署。";
    }
    if (status === 504) {
      return (
        "云端处理超时（504）。分析仍在后台进行时请继续等待；若反复出现，请用更短视频、选「轻量」深度，或查看 Vercel Logs。"
      );
    }
    if (status === 503) {
      return (
        "服务暂不可用（503）。请确认已配置 BLOB_READ_WRITE_TOKEN 与 GEMINI_API_KEY，并重新部署后再试。"
      );
    }
    return "服务暂时不可用，请稍后重试。";
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

export type UiLocale = "zh" | "en";

/** 浏览器层 fetch 失败（无 HTTP 响应），常见于断网、连接重置、上传中断 */
export function explainFetchError(
  err: unknown,
  locale: UiLocale = "zh"
): { message: string; retryable: boolean } {
  if (err instanceof Error && err.name === "AbortError") {
    return {
      message: locale === "zh" ? "已取消" : "Canceled",
      retryable: true,
    };
  }

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline) {
      return {
        message:
          locale === "zh"
            ? "当前设备未联网，请连接网络后重试。"
            : "You appear to be offline. Connect and try again.",
        retryable: true,
      };
    }
    return {
      message:
        locale === "zh"
          ? "无法连接服务器（网络请求失败）。请检查：① 网络/Wi‑Fi 是否稳定；② 分析过程中保持本页在前台、勿切换应用；③ 视频是否已压缩到 4MB 以内；④ 若使用 VPN/代理，可尝试关闭后重试。稍等片刻再点「使用当前视频再试」。"
          : "Could not reach the server. Check your connection, keep this tab in the foreground, ensure the clip is under 4MB, then retry.",
      retryable: true,
    };
  }

  return {
    message: msg || (locale === "zh" ? "请求失败" : "Request failed"),
    retryable: true,
  };
}

export function errorFromFetchJson<T extends { error?: string; retryable?: boolean }>(
  parsed: ParsedFetchJson<T>,
  fallback: string
): { message: string; retryable: boolean } {
  if (parsed.parseError || !parsed.data) {
    const message = humanizeNonJsonBody(parsed.status, parsed.rawText);
    return {
      message,
      retryable:
        parsed.status >= 500 ||
        parsed.status === 429 ||
        parsed.status === 413 ||
        parsed.status === 504,
    };
  }
  const data = parsed.data;
  return {
    message: data.error || fallback,
    retryable: Boolean(data.retryable) || parsed.status >= 500 || parsed.status === 429,
  };
}
