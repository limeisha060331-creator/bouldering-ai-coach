import { waitUntil } from "@vercel/functions";
import {
  appendJobLog,
  getJob,
  readPrivateBlob,
  saveJob,
  type AnalysisJob,
  type JobStatus,
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
  formatGeminiDailyQuotaMessage,
  formatGeminiGenerateContentCooldownMessage,
  formatGeminiRpmRateLimitMessage,
  isGeminiDailyQuotaExceeded,
  isGeminiDailyQuotaHardStop,
  isGeminiRpmRateLimit,
  isGeminiRateLimitError,
  isGeminiTransientError,
  parseGeminiRetrySeconds,
} from "./gemini-retry";
import { geminiPhase1Upload, geminiPhase2CheckReady } from "./gemini-phases";
import { getAnalysisPrompt, getMaxOutputTokens } from "./analyze-prompt";

/** 后台 generateContent 超过此时长视为卡死并重试 */
const STALE_ANALYSIS_MS = 100_000;
/** Gemini 处理视频阶段最长等待 */
const STALE_GEMINI_PROCESSING_MS = 180_000;
/** 阶段一长时间未离开 uploaded/uploading */
const STALE_UPLOAD_MS = 120_000;
const MAX_ANALYSIS_BACKGROUND_ATTEMPTS = 3;
/** 同一任务并发推进锁（跨 status 轮询与 POST waitUntil） */
const PIPELINE_LOCK_MS = 120_000;

function msSince(iso?: string): number {
  if (!iso) return 0;
  return Date.now() - new Date(iso).getTime();
}

function withStatus(job: AnalysisJob, status: JobStatus): AnalysisJob {
  const now = new Date().toISOString();
  return {
    ...job,
    status,
    statusSince: now,
    updatedAt: now,
  };
}

async function fetchVideoBuffer(
  job: AnalysisJob & { videoBuffer?: Buffer }
): Promise<Buffer> {
  if (job.videoBuffer) return job.videoBuffer;

  if (job.videoBlobPath) {
    return readPrivateBlob(job.videoBlobPath);
  }

  if (job.videoBlobUrl) {
    const res = await fetch(job.videoBlobUrl);
    if (!res.ok) throw new Error(`无法读取云存储视频: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error("缺少视频数据");
}

async function loadJob(
  jobId: string
): Promise<(AnalysisJob & { videoBuffer?: Buffer }) | null> {
  if (isMemoryJobStoreEnabled()) {
    return getMemoryJob(jobId);
  }
  return getJob(jobId);
}

async function persistJob(
  job: AnalysisJob,
  videoBuffer?: Buffer
): Promise<void> {
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

async function persistGeminiError(
  jobId: string,
  err: unknown,
  fallbackJob?: AnalysisJob
): Promise<void> {
  logGeminiError(`job/${jobId}`, err);
  const current = (await loadJob(jobId)) ?? fallbackJob;
  if (!current) return;

  if (isGeminiDailyQuotaExceeded(err)) {
    if (isGeminiDailyQuotaHardStop(err)) {
      await persistJob(
        withStatus(
          {
            ...current,
            analysisStarted: false,
            analysisStartedAt: undefined,
            retryAfter: undefined,
            dailyQuotaExhausted: true,
            error: formatGeminiDailyQuotaMessage(err),
          },
          "failed"
        )
      );
      return;
    }

    const waitSec = parseGeminiRetrySeconds(err);
    await persistJob(
      withStatus(
        {
          ...current,
          analysisStarted: false,
          analysisStartedAt: undefined,
          dailyQuotaExhausted: false,
          retryAfter: new Date(Date.now() + waitSec * 1000).toISOString(),
          error: formatGeminiGenerateContentCooldownMessage(err),
        },
        "rate_limited"
      )
    );
    return;
  }

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
        : isGeminiRpmRateLimit(err)
          ? formatGeminiRpmRateLimitMessage(err)
          : `Gemini 短时限流，约 ${waitSec} 秒后自动重试…`;
    await persistJob(
      withStatus(
        {
          ...current,
          analysisStarted: false,
          analysisStartedAt: undefined,
          dailyQuotaExhausted: false,
          retryAfter: new Date(Date.now() + waitSec * 1000).toISOString(),
          error: errorMsg,
        },
        "rate_limited"
      )
    );
    return;
  }

  const { message } = mapGeminiError(err);
  await persistJob(
    withStatus(
      {
        ...current,
        analysisStarted: false,
        analysisStartedAt: undefined,
        error: message,
      },
      "failed"
    )
  );
}

/** 在 waitUntil 中跑完整 generateContent，避免单次 status 轮询超过 60s 被 Vercel 杀掉 */
async function executeAnalysisInBackground(jobId: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const job = await loadJob(jobId);
    if (job) {
      await persistJob(
        withStatus({ ...job, error: "GEMINI_API_KEY 未配置" }, "failed")
      );
    }
    return;
  }

  const job = await loadJob(jobId);
  if (!job || job.status !== "analyzing" || !job.geminiFileUri) return;

  try {
    logInfo("job", `[后台] generateContent 开始 jobId=${jobId}`);
    const analysis = await runGeminiAnalysis(
      apiKey,
      job.geminiFileUri,
      job.mimeType,
      {
        depth: job.depth ?? "deep",
        locale: job.locale ?? "zh",
        prompt: getAnalysisPrompt(job.depth ?? "deep", job.locale ?? "zh"),
        maxOutputTokens: getMaxOutputTokens(job.depth ?? "deep"),
        maxAttempts: 1,
      }
    );

    await persistJob(
      withStatus(
        {
          ...job,
          analysis,
          analysisStarted: false,
          analysisStartedAt: undefined,
          error: undefined,
        },
        "completed"
      )
    );
    logInfo("job", `[后台] 任务完成 jobId=${jobId}`);
  } catch (err) {
    await persistGeminiError(jobId, err, job);
  }
}

function scheduleBackgroundAnalysis(jobId: string): void {
  waitUntil(
    executeAnalysisInBackground(jobId).catch((err) => {
      logGeminiError(`waitUntil/analysis/${jobId}`, err);
    })
  );
}

/**
 * 轮询前修复卡死任务（不推进 Gemini，仅重置/失败）
 * @returns 是否已处理（调用方应重新 load job）
 */
export async function recoverStaleJob(jobId: string): Promise<boolean> {
  const job = await loadJob(jobId);
  if (!job || job.status === "completed" || job.status === "failed") {
    return false;
  }

  const since = job.statusSince ?? job.updatedAt ?? job.createdAt;

  if (
    (job.status === "uploaded" || job.status === "gemini_uploading") &&
    msSince(since) > STALE_UPLOAD_MS
  ) {
    logInfo("job", `恢复：上传阶段卡死 ${jobId}，重置为 uploaded`);
    await persistJob(
      withStatus(
        {
          ...job,
          analysisStarted: false,
          analysisStartedAt: undefined,
          error: "上传阶段超时，正在自动重试…",
        },
        "uploaded"
      )
    );
    return true;
  }

  if (
    job.status === "gemini_processing" &&
    msSince(since) > STALE_GEMINI_PROCESSING_MS
  ) {
    logInfo("job", `恢复：Gemini 处理视频超时 ${jobId}`);
    await persistJob(
      withStatus(
        {
          ...job,
          error:
            "Gemini 处理视频超过 3 分钟。请换更短片段后重新分析。",
        },
        "failed"
      )
    );
    return true;
  }

  if (job.status === "analyzing" && job.analysisStarted) {
    const staleMs = msSince(job.analysisStartedAt ?? since);
    if (staleMs > STALE_ANALYSIS_MS) {
      const attempt = (job.analysisAttempt ?? 1) + 1;
      if (attempt > MAX_ANALYSIS_BACKGROUND_ATTEMPTS) {
        logInfo("job", `恢复：分析多次卡死，标记失败 ${jobId}`);
        await persistJob(
          withStatus(
            {
              ...job,
              analysisStarted: false,
              analysisStartedAt: undefined,
              error:
                "分析多次超时未完成。请改用「轻量」深度、缩短视频后重试（模型请保持 gemini-2.5-flash）。",
            },
            "failed"
          )
        );
        return true;
      }
      logInfo(
        "job",
        `恢复：分析卡死 ${Math.round(staleMs / 1000)}s，后台重试 ${attempt}/${MAX_ANALYSIS_BACKGROUND_ATTEMPTS}`
      );
      await persistJob({
        ...withStatus(job, "analyzing"),
        analysisStarted: false,
        analysisStartedAt: undefined,
        analysisAttempt: attempt,
        error: `分析耗时较长，正在自动重试（${attempt}/${MAX_ANALYSIS_BACKGROUND_ATTEMPTS}）…`,
      });
      scheduleBackgroundAnalysis(jobId);
      return true;
    }
  }

  if (job.status === "rate_limited" && job.retryAfter) {
    const until = new Date(job.retryAfter).getTime();
    if (Date.now() >= until - 2000) {
      logInfo("job", `恢复：限流冷却已结束 ${jobId}`);
      await persistJob(
        withStatus(
          {
            ...job,
            analysisStarted: false,
            analysisStartedAt: undefined,
            retryAfter: undefined,
            error: undefined,
          },
          "analyzing"
        )
      );
      scheduleBackgroundAnalysis(jobId);
      return true;
    }
  }

  return false;
}

/** 在后台推进任务，供 status 轮询快速返回 JSON，避免 Vercel 504 */
export function schedulePipelineAdvance(jobId: string): void {
  waitUntil(
    advanceAnalysisJob(jobId).catch((err) => {
      logGeminiError(`waitUntil/pipeline/${jobId}`, err);
    })
  );
}

/** 每次仅推进一个阶段；分析阶段用 waitUntil 后台执行 */
export async function advanceAnalysisJob(jobId: string): Promise<void> {
  let job = await loadJob(jobId);
  if (!job) {
    logInfo("job", `任务不存在: ${jobId}`);
    return;
  }

  if (job.status === "completed" || job.status === "failed") return;

  if (job.pipelineLockUntil) {
    const lockUntil = new Date(job.pipelineLockUntil).getTime();
    if (Date.now() < lockUntil) {
      logInfo("job", `推进跳过（另一实例进行中）${jobId}`);
      return;
    }
  }

  await persistJob({
    ...job,
    pipelineLockUntil: new Date(Date.now() + PIPELINE_LOCK_MS).toISOString(),
  });

  try {
    job = (await loadJob(jobId)) ?? job;
    if (job.status === "completed" || job.status === "failed") return;

    await advanceAnalysisJobUnlocked(jobId, job);
  } finally {
    const latest = await loadJob(jobId);
    if (latest?.pipelineLockUntil) {
      await persistJob({ ...latest, pipelineLockUntil: undefined });
    }
  }
}

async function advanceAnalysisJobUnlocked(
  jobId: string,
  initialJob: AnalysisJob & { videoBuffer?: Buffer }
): Promise<void> {
  let job = initialJob;

  if (job.status === "rate_limited") {
    if (job.retryAfter && new Date(job.retryAfter) > new Date()) {
      return;
    }
    job = withStatus(
      {
        ...job,
        analysisStarted: false,
        analysisStartedAt: undefined,
        retryAfter: undefined,
        error: undefined,
        analysisAttempt: job.analysisAttempt ?? 1,
      },
      "analyzing"
    );
    await persistJob(job);
    scheduleBackgroundAnalysis(jobId);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await persistJob(
      withStatus({ ...job, error: "GEMINI_API_KEY 未配置" }, "failed")
    );
    return;
  }

  try {
    if (job.status === "uploaded" || job.status === "gemini_uploading") {
      job = await appendJobLog(
        withStatus(job, "gemini_uploading"),
        "[阶段一] 上传至 Gemini Files API…"
      );

      const buffer = await fetchVideoBuffer(job);
      const p1 = await geminiPhase1Upload(
        apiKey,
        buffer,
        job.mimeType,
        job.fileName
      );

      job = withStatus(
        {
          ...job,
          geminiFileName: p1.fileName,
          geminiFileUri: p1.fileUri,
        },
        "gemini_processing"
      );
      await persistJob(job);
      await appendJobLog(job, `[阶段一] 完成 fileName=${p1.fileName}`);
      return;
    }

    if (job.status === "gemini_processing" && job.geminiFileName) {
      const check = await geminiPhase2CheckReady(apiKey, job.geminiFileName);

      if (check.state === "FAILED") {
        throw new Error("Gemini 视频处理失败，请换更短片段重试");
      }

      if (!check.ready) {
        logInfo("job", `[阶段二] 仍在处理 state=${check.state}`);
        return;
      }

      job = await appendJobLog(
        withStatus(job, "analyzing"),
        "[阶段二] 视频已就绪，启动 AI 分析…"
      );
      await persistJob({
        ...job,
        analysisStarted: false,
        analysisStartedAt: undefined,
        analysisAttempt: 1,
      });
      scheduleBackgroundAnalysis(jobId);
      return;
    }

    if (job.status === "analyzing") {
      if (!job.geminiFileUri) return;

      if (job.analysisStarted) {
        logInfo("job", `[阶段二-B] 后台分析进行中 jobId=${jobId}`);
        return;
      }

      job = {
        ...withStatus(job, "analyzing"),
        analysisStarted: true,
        analysisStartedAt: new Date().toISOString(),
        analysisAttempt: job.analysisAttempt ?? 1,
      };
      await persistJob(job);
      await appendJobLog(job, "[阶段二-B] 已提交后台 generateContent…");
      scheduleBackgroundAnalysis(jobId);
    }
  } catch (err) {
    await persistGeminiError(jobId, err, job);
  }
}

/** @deprecated 使用 advanceAnalysisJob */
export async function processAnalysisJob(jobId: string): Promise<void> {
  return advanceAnalysisJob(jobId);
}
