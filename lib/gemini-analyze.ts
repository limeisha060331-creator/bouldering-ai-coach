import { GoogleGenerativeAI } from "@google/generative-ai";
import { ANALYSIS_PROMPT, getGeminiModelId } from "./analyze-prompt";
import { logInfo } from "./gemini-log";
import {
  isGeminiRateLimitError,
  parseGeminiRetrySeconds,
  sleep,
} from "./gemini-retry";
import {
  geminiPhase1Upload,
  geminiPhase2CheckReady,
} from "./gemini-phases";

export { logGeminiError, logInfo } from "./gemini-log";
export { geminiPhase1Upload, geminiPhase2CheckReady } from "./gemini-phases";

export function mapGeminiError(err: unknown): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("429") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource exhausted")
  ) {
    return {
      message:
        "Gemini 免费额度/频率已达上限。请等待约 1 分钟后点击「重新分析」，或在 Vercel 设置 GEMINI_MODEL=gemini-2.0-flash-lite。也可查看 https://ai.dev/rate-limit",
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
        "视频文件太大了！请剪辑成 10MB 以内的关键片段（那一挂、那一蹿）再上传。",
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
        `模型「${model}」不可用。请在 Vercel 环境变量设置 GEMINI_MODEL，例如 gemini-2.0-flash 或 gemini-2.0-flash-lite，并在 AI Studio 查看可用模型列表。`,
      status: 400,
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
  mimeType: string
): Promise<string> {
  const modelId = getGeminiModelId();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId });

  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logInfo(
        "gemini",
        `generateContent 开始 model=${modelId} attempt=${attempt}/${maxAttempts}`
      );

      const result = await model.generateContent([
        { text: ANALYSIS_PROMPT },
        {
          fileData: {
            mimeType,
            fileUri,
          },
        },
      ]);

      const text = result.response.text();
      logInfo("gemini", "generateContent 完成", { length: text?.length ?? 0 });

      if (!text?.trim()) {
        throw new Error("模型未返回分析文本");
      }

      return text.trim();
    } catch (err) {
      lastError = err;
      if (!isGeminiRateLimitError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const waitSec = Math.min(parseGeminiRetrySeconds(err), 20);
      logInfo("gemini", `429 限流，${waitSec}s 后同函数内重试`);
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
  displayName: string
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

  return runGeminiAnalysis(apiKey, p1.fileUri, mimeType);
}
