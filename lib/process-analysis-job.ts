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
  updateMemoryJob,
} from "./job-memory-store";
import { logError, logInfo } from "./log";
import {
  describeDeepSeekStatus,
  getDeepSeekModelId,
  isDeepSeekApiError,
  isDeepSeekEmptyAnalysisError,
  runDeepSeekAnalysis,
} from "./deepseek-analysis";
import type { AnalyzeFrame } from "./frame-extraction";

/** 后台分析超过此时长视为卡死并重试 */
const STALE_ANALYSIS_MS = 120_000;
/** 已接收关键帧但长时间没有进入分析 */
const STALE_UPLOAD_MS = 60_000;
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

async function loadJob(jobId: string): Promise<AnalysisJob | null> {
  if (isMemoryJobStoreEnabled()) {
    return getMemoryJob(jobId);
  }
  return getJob(jobId);
}

async function persistJob(job: AnalysisJob): Promise<void> {
  if (isMemoryJobStoreEnabled()) {
    updateMemoryJob(job);
    return;
  }
  await saveJob(job);
}

async function loadFrames(job: AnalysisJob): Promise<AnalyzeFrame[]> {
  if (job.frames && job.frames.length > 0) return job.frames;
  if (job.framesBlobPath) {
    const buf = await readPrivateBlob(job.framesBlobPath);
    return JSON.parse(buf.toString("utf-8")) as AnalyzeFrame[];
  }
  throw new Error("缺少关键帧数据，请重新上传视频");
}

async function persistAnalysisError(
  jobId: string,
  err: unknown,
  fallbackJob?: AnalysisJob
): Promise<void> {
  logError(`job/${jobId}`, err);
  const current = (await loadJob(jobId)) ?? fallbackJob;
  if (!current) return;

  let waitSec = 15;
  let retryable = true;
  let message = "分析失败，请稍后重试。";

  if (isDeepSeekApiError(err)) {
    retryable = err.retryable;
    waitSec = err.waitSeconds || 15;
    message = err.message;
  } else if (isDeepSeekEmptyAnalysisError(err)) {
    waitSec = 12;
    message = `模型未返回正文，约 ${waitSec} 秒后自动重试…`;
  } else if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    if (typeof status === "number") {
      const described = describeDeepSeekStatus(status, err.message);
      retryable = described.retryable;
      waitSec = described.waitSeconds || 15;
      message = described.message;
    } else {
      retryable = false;
      message = err.message;
    }
  }

  if (retryable) {
    await persistJob(
      withStatus(
        {
          ...current,
          analysisStarted: false,
          analysisStartedAt: undefined,
          retryAfter: new Date(Date.now() + waitSec * 1000).toISOString(),
          error: message,
        },
        "rate_limited"
      )
    );
    return;
  }

  await persistJob(
    withStatus(
      {
        ...current,
        analysisStarted: false,
        analysisStartedAt: undefined,
        retryAfter: undefined,
        error: message,
      },
      "failed"
    )
  );
}

/** 在 waitUntil 中跑完整 DeepSeek 调用，避免单次 status 轮询超过时限 */
async function executeAnalysisInBackground(jobId: string): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const job = await loadJob(jobId);
    if (job) {
      await persistJob(
        withStatus({ ...job, error: "DEEPSEEK_API_KEY 未配置" }, "failed")
      );
    }
    return;
  }

  const job = await loadJob(jobId);
  if (!job || job.status !== "analyzing") return;

  try {
    const frames = await loadFrames(job);
    const depth = job.depth ?? "deep";
    const locale = job.locale ?? "zh";
    const model = job.model || getDeepSeekModelId();

    logInfo(
      "job",
      `[后台] DeepSeek 开始 jobId=${jobId} model=${model} frames=${frames.length}`
    );

    const detail = await runDeepSeekAnalysis({
      apiKey,
      model,
      depth,
      locale,
      frames,
      maxAttempts: 1,
    });

    await persistJob(
      withStatus(
        {
          ...job,
          analysis: detail.text,
          model: detail.modelId,
          usage: detail.usage ?? undefined,
          analysisStarted: false,
          analysisStartedAt: undefined,
          error: undefined,
        },
        "completed"
      )
    );
    logInfo(
      "job",
      `[后台] 任务完成 jobId=${jobId} ${detail.latencyMs}ms ${detail.usage?.totalTokens ?? "?"}tok`
    );
  } catch (err) {
    await persistAnalysisError(jobId, err, job);
  }
}

function scheduleBackgroundAnalysis(jobId: string): void {
  waitUntil(
    executeAnalysisInBackground(jobId).catch((err) => {
      logError(`waitUntil/analysis/${jobId}`, err);
    })
  );
}

/**
 * 轮询前修复卡死任务。
 * @returns 是否已处理（调用方应重新 load job）
 */
export async function recoverStaleJob(jobId: string): Promise<boolean> {
  const job = await loadJob(jobId);
  if (!job || job.status === "completed" || job.status === "failed") {
    return false;
  }

  const since = job.statusSince ?? job.updatedAt ?? job.createdAt;

  if (job.status === "uploaded" && msSince(since) > STALE_UPLOAD_MS) {
    logInfo("job", `恢复：任务未进入分析 ${jobId}，重新排队`);
    await persistJob(
      withStatus(
        {
          ...job,
          analysisStarted: false,
          analysisStartedAt: undefined,
          error: undefined,
        },
        "uploaded"
      )
    );
    schedulePipelineAdvance(jobId);
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
                "分析多次超时未完成。请改用「轻量」深度或换更短的视频后重试。",
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
      logError(`waitUntil/pipeline/${jobId}`, err);
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
  initialJob: AnalysisJob
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

  if (!process.env.DEEPSEEK_API_KEY) {
    await persistJob(
      withStatus({ ...job, error: "DEEPSEEK_API_KEY 未配置" }, "failed")
    );
    return;
  }

  try {
    if (job.status === "uploaded") {
      job = await appendJobLog(
        withStatus(
          {
            ...job,
            analysisAttempt: job.analysisAttempt ?? 1,
            analysisStarted: false,
            analysisStartedAt: undefined,
          },
          "analyzing"
        ),
        `[分析] 已接收 ${job.frameCount ?? 0} 张关键帧，提交 DeepSeek…`
      );
      await persistJob(job);
      scheduleBackgroundAnalysis(jobId);
      return;
    }

    if (job.status === "analyzing") {
      if (job.analysisStarted) {
        logInfo("job", `[分析] 后台分析进行中 jobId=${jobId}`);
        return;
      }

      job = {
        ...withStatus(job, "analyzing"),
        analysisStarted: true,
        analysisStartedAt: new Date().toISOString(),
        analysisAttempt: job.analysisAttempt ?? 1,
      };
      await persistJob(job);
      await appendJobLog(job, "[分析] 已提交后台 DeepSeek…");
      scheduleBackgroundAnalysis(jobId);
    }
  } catch (err) {
    await persistAnalysisError(jobId, err, job);
  }
}

/** @deprecated 使用 advanceAnalysisJob */
export async function processAnalysisJob(jobId: string): Promise<void> {
  return advanceAnalysisJob(jobId);
}
