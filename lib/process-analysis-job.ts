import {
  appendJobLog,
  getJob,
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
import { geminiPhase1Upload, geminiPhase2CheckReady } from "./gemini-phases";

async function fetchVideoBuffer(job: AnalysisJob & { videoBuffer?: Buffer }): Promise<Buffer> {
  if (job.videoBuffer) return job.videoBuffer;
  if (!job.videoBlobUrl) throw new Error("缺少视频数据");
  const res = await fetch(job.videoBlobUrl);
  if (!res.ok) throw new Error(`无法读取云存储视频: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
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
        logInfo("job", `[阶段二-B] 分析进行中，跳过重复调用`);
        return;
      }

      job = {
        ...job,
        analysisStarted: true,
        updatedAt: new Date().toISOString(),
      };
      await persistJob(job);
      await appendJobLog(job, "[阶段二-B] generateContent 开始…");

      const analysis = await runGeminiAnalysis(
        apiKey,
        geminiFileUri,
        job.mimeType
      );

      await persistJob({
        ...job,
        status: "completed",
        analysis,
        updatedAt: new Date().toISOString(),
      });
      logInfo("job", `任务完成: ${jobId}`);
    }
  } catch (err) {
    logGeminiError(`job/${jobId}`, err);
    const { message } = mapGeminiError(err);
    const current = (await loadJob(jobId)) ?? job;
    await persistJob({
      ...current,
      status: "failed",
      error: message,
      updatedAt: new Date().toISOString(),
    });
  }
}

/** @deprecated 使用 advanceAnalysisJob */
export async function processAnalysisJob(jobId: string): Promise<void> {
  return advanceAnalysisJob(jobId);
}
