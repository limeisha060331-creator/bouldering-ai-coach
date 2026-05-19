import { put, get } from "@vercel/blob";
import {
  isMemoryJobStoreEnabled,
  updateMemoryJob,
} from "./job-memory-store";

export type JobStatus =
  | "uploaded"
  | "gemini_uploading"
  | "gemini_processing"
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
  /** 私有 Blob 的路径（推荐） */
  videoBlobPath?: string;
  /** @deprecated 旧版 public URL，仅兼容读取 */
  videoBlobUrl?: string;
  geminiFileName?: string;
  geminiFileUri?: string;
  analysis?: string;
  error?: string;
  logs?: string[];
  analysisStarted?: boolean;
  analysisStartedAt?: string;
  /** 429 后自动重试的最早时间（ISO） */
  retryAfter?: string;
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

function videoPath(jobId: string) {
  return `videos/${jobId}`;
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

/** 上传视频到私有 Blob，返回 pathname（非公开 URL） */
export async function uploadVideoBlob(
  jobId: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const pathname = videoPath(jobId);
  await put(pathname, buffer, {
    access: "private",
    contentType: mimeType,
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
