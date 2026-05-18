import { put, list } from "@vercel/blob";
import {
  isMemoryJobStoreEnabled,
  updateMemoryJob,
} from "./job-memory-store";

export type JobStatus =
  | "uploaded"
  | "gemini_uploading"
  | "gemini_processing"
  | "analyzing"
  | "completed"
  | "failed";

export interface AnalysisJob {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  fileName: string;
  mimeType: string;
  videoBlobUrl?: string;
  geminiFileName?: string;
  geminiFileUri?: string;
  analysis?: string;
  error?: string;
  logs?: string[];
  /** 防止 analyze 阶段被重复触发 */
  analysisStarted?: boolean;
  /** 原始 / 压缩后大小（字节） */
  originalSize?: number;
  compressedSize?: number;
}

function jobPath(id: string) {
  return `jobs/${id}.json`;
}

export function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** 是否走异步任务（Blob 或本地内存任务表） */
export function supportsAsyncJobs(): boolean {
  return hasBlobStorage();
}

export async function saveJob(job: AnalysisJob): Promise<void> {
  if (!hasBlobStorage()) {
    throw new Error("BLOB_READ_WRITE_TOKEN 未配置");
  }
  await put(jobPath(job.id), JSON.stringify(job), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getJob(id: string): Promise<AnalysisJob | null> {
  if (!hasBlobStorage()) return null;
  try {
    const blobs = await list({ prefix: jobPath(id), limit: 1 });
    const blob = blobs.blobs[0];
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as AnalysisJob;
  } catch {
    return null;
  }
}

export async function uploadVideoBlob(
  jobId: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const blob = await put(`videos/${jobId}`, buffer, {
    access: "public",
    contentType: mimeType,
  });
  return blob.url;
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
