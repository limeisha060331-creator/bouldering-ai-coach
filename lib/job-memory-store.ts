import type { AnalysisJob } from "./analysis-jobs";

/** 本地开发无 Blob 时的内存任务表（单进程 dev 有效） */
const memoryJobs = new Map<string, AnalysisJob & { videoBuffer?: Buffer }>();

export function isMemoryJobStoreEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function saveMemoryJob(
  job: AnalysisJob,
  videoBuffer?: Buffer
): void {
  memoryJobs.set(job.id, { ...job, videoBuffer });
}

export function getMemoryJob(
  id: string
): (AnalysisJob & { videoBuffer?: Buffer }) | null {
  return memoryJobs.get(id) ?? null;
}

export function updateMemoryJob(job: AnalysisJob): void {
  const prev = memoryJobs.get(job.id);
  memoryJobs.set(job.id, { ...prev, ...job, videoBuffer: prev?.videoBuffer });
}
