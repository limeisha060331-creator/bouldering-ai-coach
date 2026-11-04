import { put, get } from "@vercel/blob";
import {
  isMemoryJobStoreEnabled,
  updateMemoryJob,
} from "./job-memory-store";
import type { AnalyzeFrame } from "./frame-extraction";

export type JobStatus =
  | "uploaded"
  | "analyzing"
  | "rate_limited"
  | "completed"
  | "failed";

export interface AnalysisJob {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  fileName: string;
  mimeType: string;
  /** 私有 Blob 中保存的关键帧 JSON 路径 */
  framesBlobPath?: string;
  /** 仅内存任务表使用；写 Blob 时单独存放，避免任务 JSON 过大 */
  frames?: AnalyzeFrame[];
  frameCount?: number;
  durationSec?: number;
  model?: string;
  /** provider 返回的真实 token 用量，用于成本对账 */
  usage?: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens: number;
  };
  analysis?: string;
  error?: string;
  logs?: string[];
  analysisStarted?: boolean;
  analysisStartedAt?: string;
  /** 进入当前 status 的时间（用于卡死检测，勿用 updatedAt 心跳覆盖） */
  statusSince?: string;
  /** 分析阶段后台任务重试次数 */
  analysisAttempt?: number;
  /** 429 后自动重试的最早时间（ISO） */
  retryAfter?: string;
  /** 防止多实例同时推进同一任务（ISO 到期时间） */
  pipelineLockUntil?: string;
  originalSize?: number;
  compressedSize?: number;
  /** 提示词版本，便于回归对比 */
  promptVersion?: string;
  depth?: "light" | "deep";
  locale?: "zh" | "en";
}

function jobPath(id: string) {
  return `jobs/${id}.json`;
}

export function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function supportsAsyncJobs(): boolean {
  return hasBlobStorage();
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return Buffer.from(out);
}

/** 从私有 Blob 读取二进制（服务端，带 Token） */
export async function readPrivateBlob(pathname: string): Promise<Buffer> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`无法读取 Blob: ${pathname}`);
  }
  return streamToBuffer(result.stream);
}

/** 从私有 Blob 读取 JSON 任务 */
async function readJobJson(pathname: string): Promise<AnalysisJob | null> {
  try {
    const buf = await readPrivateBlob(pathname);
    return JSON.parse(buf.toString("utf-8")) as AnalysisJob;
  } catch {
    return null;
  }
}

export async function saveJob(job: AnalysisJob): Promise<void> {
  if (!hasBlobStorage()) {
    throw new Error("BLOB_READ_WRITE_TOKEN 未配置");
  }
  await put(jobPath(job.id), JSON.stringify(job), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getJob(id: string): Promise<AnalysisJob | null> {
  if (!hasBlobStorage()) return null;
  return readJobJson(jobPath(id));
}

/** 把关键帧保存到私有 Blob，返回 pathname（非公开 URL） */
export async function uploadFramesBlob(
  jobId: string,
  frames: AnalyzeFrame[]
): Promise<string> {
  const pathname = `frames/${jobId}.json`;
  await put(pathname, JSON.stringify(frames), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return pathname;
}

export async function appendJobLog(
  job: AnalysisJob,
  message: string
): Promise<AnalysisJob> {
  const logs = [...(job.logs ?? []), `${new Date().toISOString()} ${message}`];
  const updated = {
    ...job,
    logs: logs.slice(-30),
    updatedAt: new Date().toISOString(),
  };
  if (isMemoryJobStoreEnabled()) {
    updateMemoryJob(updated);
    return updated;
  }
  await saveJob(updated);
  return updated;
}
