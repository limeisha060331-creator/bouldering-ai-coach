import {
  geminiPhase1Upload,
  geminiPhase2CheckReady,
  geminiPhase2DeleteFile,
} from "@lib/gemini-phases";
import { runGeminiAnalysis } from "@lib/gemini-analyze";
import { getAnalysisPrompt, getMaxOutputTokens } from "@lib/analyze-prompt";
import type { JobHooks, JobRunner } from "./job-manager";

export const VIDEO_PROCESSING_POLL_MS = 2500;
export const VIDEO_PROCESSING_TIMEOUT_MS = 180_000;

export type GeminiRunnerOptions = {
  /** 延迟读取，保证设置里刚填的 Key 立即生效 */
  apiKey: () => string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollIntervalMs?: number;
  processingTimeoutMs?: number;
  runGenerateContent?: typeof runGeminiAnalysis;
};

/**
 * 真实的分析流水线：
 * 阶段一 uploadFile → 阶段二 轮询 ACTIVE → generateContent。
 * 阶段进度通过 hooks 同步给任务状态机。
 */
export function createGeminiRunner(options: GeminiRunnerOptions): JobRunner {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const pollInterval = options.pollIntervalMs ?? VIDEO_PROCESSING_POLL_MS;
  const processingTimeout = options.processingTimeoutMs ?? VIDEO_PROCESSING_TIMEOUT_MS;
  const generate = options.runGenerateContent ?? runGeminiAnalysis;

  return async function runAnalysisJob(job, hooks: JobHooks): Promise<string> {
    const apiKey = options.apiKey();
    if (!apiKey) {
      throw new Error("未配置 Gemini API Key，请在「设置」中填写后再分析。");
    }

    if (!job.geminiFileUri) {
      hooks.setStatus("gemini_uploading");
      hooks.log(`[阶段一] 上传视频到 Gemini Files API（${job.mimeType}）`);
      const uploaded = await geminiPhase1Upload(
        apiKey,
        job.videoBuffer,
        job.mimeType,
        job.fileName
      );
      hooks.setStatus("gemini_processing", {
        geminiFileName: uploaded.fileName,
        geminiFileUri: uploaded.fileUri,
        geminiState: uploaded.state,
        fileReady: uploaded.state === "ACTIVE",
      });
      hooks.log(`[阶段一] 完成 ${uploaded.fileName}`);
    }

    if (!job.fileReady) {
      const deadline = now() + processingTimeout;
      let ready = false;

      while (!ready) {
        const check = await geminiPhase2CheckReady(apiKey, job.geminiFileName!);
        if (check.state === "FAILED") {
          throw new Error("Gemini 视频处理失败，请换更短片段后重试。");
        }
        if (check.ready) {
          ready = true;
          break;
        }
        if (now() >= deadline) {
          throw new Error(
            "Gemini 处理视频超过 3 分钟。请换更短片段后重新分析。"
          );
        }
        hooks.setStatus("gemini_processing", { geminiState: check.state });
        await sleep(pollInterval);
      }
    }

    hooks.setStatus("analyzing", { fileReady: true });
    hooks.log("[阶段二] 视频已就绪，启动 generateContent");

    const depth = job.depth ?? "deep";
    const locale = job.locale ?? "zh";
    const analysis = await generate(apiKey, job.geminiFileUri!, job.mimeType, {
      depth,
      locale,
      prompt: getAnalysisPrompt(depth, locale),
      maxOutputTokens: getMaxOutputTokens(depth),
      maxAttempts: 2,
    });

    await geminiPhase2DeleteFile(apiKey, job.geminiFileName!);
    return analysis;
  };
}
