import {
  appendJobLog,
  getJob,
  readPrivateBlob,
  saveJob,
  type AnalysisJob,
} from "./analysis-jobs";
import {
  getMemoryJob,
  isMemoryJobStoreEnabled,
  saveMemoryJob,
  updateMemoryJob,
} from "./job-memory-store";
import {
  logGeminiError,
  logInfo,
  mapGeminiError,
  runGeminiAnalysis,
} from "./gemini-analyze";
import { isGeminiEmptyAnalysisError } from "./gemini-response-text";
import {
  isGeminiRateLimitError,
  isGeminiTransientError,
  parseGeminiRetrySeconds,
} from "./gemini-retry";
import { geminiPhase1Upload, geminiPhase2CheckReady } from "./gemini-phases";
import { getAnalysisPrompt, getMaxOutputTokens } from "./analyze-prompt";

/** 分析已开始但函数被 Vercel 10s 杀掉时，超过此时长则重置重试 */
const STALE_ANALYSIS_MS = 45_000;
/** Gemini 处理视频阶段最长等待 */
const STALE_GEMINI_PROCESSING_MS = 120_000;

function msSince(iso?: string): number {
  if (!iso) return 0;
  return Date.now() - new Date(iso).getTime();
}

async function fetchVideoBuffer(
  job: AnalysisJob & { videoBuffer?: Buffer }
): Promise<Buffer> {
  if (job.videoBuffer) return job.videoBuffer;

  if (job.videoBlobPath) {
    return readPrivateBlob(job.videoBlobPath);
  }

  // 兼容旧任务里存的 public URL
  if (job.videoBlobUrl) {
    const res = await fetch(job.videoBlobUrl);
    if (!res.ok) throw new Error(`无法读取云存储视频: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error("缺少视频数据");
}

async function loadJob(jobId: string): Promise<(AnalysisJob & { videoBuffer?: Buffer }) | null> {
  if (isMemoryJobStoreEnabled()) {
    return getMemoryJob(jobId);
  }
  return getJob(jobId);
}

async function persistJob(job: AnalysisJob, videoBuffer?: Buffer): Promise<void> {
  if (isMemoryJobStoreEnabled()) {
    updateMemoryJob(job);
    if (videoBuffer) {
      const m = getMemoryJob(job.id);
      if (m) saveMemoryJob(job, videoBuffer);
    }
    return;
  }
  await saveJob(job);
}

/** 每次仅推进一个阶段，保证单次 Serverless 调用尽量 <10s */
export async function advanceAnalysisJob(jobId: string): Promise<void> {
  let job = await loadJob(jobId);
  if (!job) {
    logInfo("job", `任务不存在: ${jobId}`);
    return;
  }

  if (job.status === "completed" || job.status === "failed") return;

  // 429 后等待到 retryAfter 再自动重试分析
  if (job.status === "rate_limited") {
    if (job.retryAfter && new Date(job.retryAfter) > new Date()) {
      logInfo("job", `限流冷却中，retryAfter=${job.retryAfter}`);
      return;
    }
    job = {
      ...job,
      status: "analyzing",
      analysisStarted: false,
      retryAfter: undefined,
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
    await persistJob(job);
    logInfo("job", "冷却结束，重新进入分析阶段");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await persistJob({
      ...job,
      status: "failed",
      error: "GEMINI_API_KEY 未配置",
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    // —— 阶段一：GoogleAIFileManager.uploadFile ——
    if (job.status === "uploaded" || job.status === "gemini_uploading") {
      job = await appendJobLog(job, "[阶段一] 上传至 Gemini Files API…");
      job = {
        ...job,
        status: "gemini_uploading",
        updatedAt: new Date().toISOString(),
      };
      await persistJob(job);

      const buffer = await fetchVideoBuffer(job);
      const p1 = await geminiPhase1Upload(
        apiKey,
        buffer,
        job.mimeType,
        job.fileName
      );

      job = {
        ...job,
        status: "gemini_processing",
        geminiFileName: p1.fileName,
        geminiFileUri: p1.fileUri,
        updatedAt: new Date().toISOString(),
      };
      await persistJob(job);
      await appendJobLog(job, `[阶段一] 完成 fileName=${p1.fileName}`);
      return;
    }

    // —— 阶段二-A：单次 getFile 检查是否 ACTIVE ——
    if (job.status === "gemini_processing" && job.geminiFileName) {
      if (msSince(job.updatedAt) > STALE_GEMINI_PROCESSING_MS) {
        throw new Error(
          "Gemini 处理视频超过 2 分钟仍未就绪，请重新点击「上传并分析」（与文件大小无关，多为 API 排队）。"
        );
      }

      const geminiFileName = job.geminiFileName;
      const check = await geminiPhase2CheckReady(apiKey, geminiFileName);

      if (check.state === "FAILED") {
        throw new Error("Gemini 视频处理失败，请换更短片段重试");
      }

      if (!check.ready) {
        logInfo("job", `[阶段二] 仍在处理 state=${check.state}，等待下次轮询`);
        return;
      }

      job = await appendJobLog(job, "[阶段二] 视频已就绪，排队 AI 分析…");
      job = {
        ...job,
        status: "analyzing",
        updatedAt: new Date().toISOString(),
      };
      await persistJob(job);
      return;
    }

    // —— 阶段二-B：generateContent（可能较慢，仅执行一次）——
    if (job.status === "analyzing") {
      const geminiFileUri = job.geminiFileUri;
      if (!geminiFileUri) return;

      if (job.analysisStarted) {
        const staleMs = msSince(job.analysisStartedAt ?? job.updatedAt);
        if (staleMs < STALE_ANALYSIS_MS) {
          logInfo("job", `[阶段二-B] 分析进行中 ${Math.round(staleMs / 1000)}s，等待`);
          return;
        }
        logInfo("job", `[阶段二-B] 上次分析已卡住 ${Math.round(staleMs / 1000)}s，重置并重试`);
        job = {
          ...job,
          analysisStarted: false,
          analysisStartedAt: undefined,
          updatedAt: new Date().toISOString(),
        };
        await persistJob(job);
      }

      job = {
        ...job,
        analysisStarted: true,
        analysisStartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await persistJob(job);
      await appendJobLog(job, "[阶段二-B] generateContent 开始…");

      const analysis = await runGeminiAnalysis(
        apiKey,
        geminiFileUri,
        job.mimeType,
        {
          depth: job.depth ?? "deep",
          locale: job.locale ?? "zh",
          prompt: getAnalysisPrompt(
            job.depth ?? "deep",
            job.locale ?? "zh"
          ),
          maxOutputTokens: getMaxOutputTokens(job.depth ?? "deep"),
        }
      );

      await persistJob({
        ...job,
        status: "completed",
        analysis,
        analysisStarted: false,
        analysisStartedAt: undefined,
        updatedAt: new Date().toISOString(),
      });
      logInfo("job", `任务完成: ${jobId}`);
    }
  } catch (err) {
    logGeminiError(`job/${jobId}`, err);
    const current = (await loadJob(jobId)) ?? job;

    if (
      isGeminiRateLimitError(err) ||
      isGeminiTransientError(err) ||
      isGeminiEmptyAnalysisError(err)
    ) {
      const waitSec = isGeminiEmptyAnalysisError(err)
        ? 12
        : parseGeminiRetrySeconds(err);
      const errorMsg = isGeminiTransientError(err)
        ? `Gemini 服务繁忙（503），约 ${waitSec} 秒后自动重试…`
        : isGeminiEmptyAnalysisError(err)
          ? `模型未返回正文，约 ${waitSec} 秒后自动重试…`
          : `Gemini 频率限制，约 ${waitSec} 秒后自动重试…`;
      await persistJob({
        ...current,
        status: "rate_limited",
        analysisStarted: false,
        analysisStartedAt: undefined,
        retryAfter: new Date(Date.now() + waitSec * 1000).toISOString(),
        error: errorMsg,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const { message } = mapGeminiError(err);
    await persistJob({
      ...current,
      status: "failed",
      analysisStarted: false,
      analysisStartedAt: undefined,
      error: message,
      updatedAt: new Date().toISOString(),
    });
  }
}

/** @deprecated 使用 advanceAnalysisJob */
export async function processAnalysisJob(jobId: string): Promise<void> {
  return advanceAnalysisJob(jobId);
}
