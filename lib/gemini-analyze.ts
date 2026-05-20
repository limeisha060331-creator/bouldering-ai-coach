import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getAnalysisPrompt,
  getGeminiModelId,
  getMaxOutputTokens,
} from "./analyze-prompt";
import type { AnalysisDepth, AnalysisLocale } from "./types";
import { logInfo } from "./gemini-log";
import {
  formatGeminiDailyQuotaMessage,
  formatGeminiRpmRateLimitMessage,
  isGeminiDailyQuotaExceeded,
  isGeminiRpmRateLimit,
  isGeminiRetryableError,
  isGeminiTransientError,
  isGeminiTransientRateLimit,
  parseGeminiRetrySeconds,
  sleep,
  transientBackoffSeconds,
} from "./gemini-retry";
import {
  geminiPhase1Upload,
  geminiPhase2CheckReady,
} from "./gemini-phases";
import { BOULDER_SAFETY_SETTINGS } from "./gemini-safety";
import {
  extractAnalysisTextFromResponse,
  GeminiEmptyAnalysisError,
  isGeminiEmptyAnalysisError,
} from "./gemini-response-text";

export { logGeminiError, logInfo } from "./gemini-log";
export { geminiPhase1Upload, geminiPhase2CheckReady } from "./gemini-phases";

export type RunGeminiAnalysisOptions = {
  prompt?: string;
  maxOutputTokens?: number;
  depth?: AnalysisDepth;
  locale?: AnalysisLocale;
  /**
   * 单次调用内最多尝试次数。Vercel waitUntil 总时长 ≤60s，
   * 后台分析务必传 1，429/503 由任务状态机跨轮询重试。
   */
  maxAttempts?: number;
};

export function mapGeminiError(err: unknown): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (isGeminiDailyQuotaExceeded(err)) {
    return {
      message: formatGeminiDailyQuotaMessage(err),
      status: 429,
    };
  }

  if (isGeminiRpmRateLimit(err)) {
    return {
      message: formatGeminiRpmRateLimitMessage(err),
      status: 429,
    };
  }

  if (
    lower.includes("429") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource exhausted")
  ) {
    return {
      message: formatGeminiRpmRateLimitMessage(err),
      status: 429,
    };
  }

  if (
    lower.includes("413") ||
    lower.includes("too large") ||
    lower.includes("payload") ||
    lower.includes("request entity") ||
    lower.includes("size limit")
  ) {
    return {
      message:
        "视频文件太大了！请剪辑成 3.5MB 以内的关键片段（那一挂、那一蹿）再上传。",
      status: 413,
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("deadline") ||
    lower.includes("function_invocation_timeout") ||
    lower.includes("timed out")
  ) {
    return {
      message:
        "分析超时（Vercel 免费版函数限 10 秒）。已切换异步模式，请稍候轮询；若仍失败请剪辑更短视频。",
      status: 504,
    };
  }

  if (lower.includes("api key") || lower.includes("api_key")) {
    return {
      message: "API Key 无效或未配置，请检查 GEMINI_API_KEY。",
      status: 401,
    };
  }

  if (lower.includes("not found") && lower.includes("model")) {
    const model = getGeminiModelId();
    return {
      message:
        `模型「${model}」不可用。请在 Vercel 设置 GEMINI_MODEL=gemini-2.5-flash（在 AI Studio Rate Limit 中须为非 0/0）。`,
      status: 400,
    };
  }

  if (isGeminiTransientError(err)) {
    const model = getGeminiModelId();
    return {
      message:
        `Gemini 模型「${model}」当前繁忙或临时不可用（503）。请 1～2 分钟后点击「使用当前视频再试」。`,
      status: 503,
    };
  }

  if (err instanceof GeminiEmptyAnalysisError) {
    return { message: err.userHint, status: 422 };
  }

  if (isGeminiEmptyAnalysisError(err)) {
    return {
      message:
        "模型未返回分析正文。请换更短攀爬片段、尝试「轻量」深度，或稍后重试。",
      status: 422,
    };
  }

  return {
    message: `分析失败：${msg.slice(0, 200)}`,
    status: 500,
  };
}

/** @deprecated 请使用 geminiPhase1Upload */
export async function uploadVideoToGemini(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<{ fileName: string; fileUri: string }> {
  const r = await geminiPhase1Upload(apiKey, buffer, mimeType, displayName);
  return { fileName: r.fileName, fileUri: r.fileUri };
}

export async function runGeminiAnalysis(
  apiKey: string,
  fileUri: string,
  mimeType: string,
  options?: RunGeminiAnalysisOptions
): Promise<string> {
  const modelId = getGeminiModelId();
  const genAI = new GoogleGenerativeAI(apiKey);
  const depth = options?.depth ?? "deep";
  const maxTokens =
    options?.maxOutputTokens ?? getMaxOutputTokens(depth);

  const model = genAI.getGenerativeModel({
    model: modelId,
    safetySettings: BOULDER_SAFETY_SETTINGS,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.4,
    },
  });

  const prompt =
    options?.prompt ??
    getAnalysisPrompt(depth, options?.locale ?? "zh");

  const maxAttempts = options?.maxAttempts ?? 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logInfo(
        "gemini",
        `generateContent 开始 model=${modelId} attempt=${attempt}/${maxAttempts} maxOut=${maxTokens}`
      );

      const result = await model.generateContent([
        { text: prompt },
        {
          fileData: {
            mimeType,
            fileUri,
          },
        },
      ]);

      let text = "";
      try {
        text = result.response.text();
      } catch (textErr) {
        logInfo("gemini", "response.text() 失败，改从 candidates 提取", textErr);
      }

      if (!text.trim()) {
        text = extractAnalysisTextFromResponse(result.response);
      }

      logInfo("gemini", "generateContent 完成", { length: text.length });

      return text.trim();
    } catch (err) {
      lastError = err;
      if (!isGeminiRetryableError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const waitSec = isGeminiTransientRateLimit(err)
        ? Math.min(parseGeminiRetrySeconds(err), 25)
        : isGeminiEmptyAnalysisError(err)
          ? 6
          : transientBackoffSeconds(attempt);
      const kind = isGeminiTransientRateLimit(err)
        ? "429 限流"
        : isGeminiEmptyAnalysisError(err)
          ? "空响应"
          : "503/临时故障";
      if (maxAttempts <= 1) {
        logInfo(
          "gemini",
          `${kind}，不在本次函数内重试（避免 Vercel 60s 超时），交由任务冷却后再试`
        );
        throw err;
      }
      logInfo("gemini", `${kind}，${waitSec}s 后重试 (${attempt}/${maxAttempts})`);
      await sleep(waitSec * 1000);
    }
  }

  throw lastError;
}

/** 同步直传（仅本地调试；Vercel 生产环境请用异步任务） */
export async function analyzeVideoInline(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
  displayName: string,
  opts?: { depth?: AnalysisDepth; locale?: AnalysisLocale }
): Promise<string> {
  logInfo("inline", "同步两阶段：phase1 upload + phase2 analyze");
  const p1 = await geminiPhase1Upload(apiKey, buffer, mimeType, displayName);

  let ready = p1.state === "ACTIVE";
  for (let i = 0; i < 45 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const check = await geminiPhase2CheckReady(apiKey, p1.fileName);
    if (check.state === "FAILED") {
      throw new Error("Gemini 视频处理失败");
    }
    ready = check.ready;
  }
  if (!ready) throw new Error("Gemini 视频处理超时");

  const depth = opts?.depth ?? "deep";
  const locale = opts?.locale ?? "zh";
  return runGeminiAnalysis(apiKey, p1.fileUri, mimeType, {
    depth,
    locale,
    prompt: getAnalysisPrompt(depth, locale),
    maxOutputTokens: getMaxOutputTokens(depth),
  });
}
