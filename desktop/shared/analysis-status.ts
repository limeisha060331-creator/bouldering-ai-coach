import type { JobStatus } from "./ipc";

/** 任务状态 → 用户可见提示（主进程与渲染进程共用，避免文案漂移） */
export const STATUS_HINTS: Record<JobStatus, string> = {
  uploaded: "已接收视频，准备上传 Gemini…",
  gemini_uploading: "【阶段一】正在上传至 Gemini Files API…",
  gemini_processing: "【阶段二】Gemini 正在处理视频，请稍候…",
  analyzing: "【阶段二】教练正在观看并分析…",
  rate_limited: "【排队】Gemini 限流或服务繁忙，正在自动重试…",
  completed: "分析完成",
  failed: "分析失败",
};

/** 任务状态 → 阶段标识（与网页版 API 语义保持一致） */
export const PHASE_LABELS: Record<JobStatus, string> = {
  uploaded: "phase_upload",
  gemini_uploading: "phase1_gemini_upload",
  gemini_processing: "phase2_gemini_wait",
  analyzing: "phase2_gemini_analyze",
  rate_limited: "rate_limited",
  completed: "done",
  failed: "failed",
};

export const PIPELINE_STATUSES: JobStatus[] = [
  "uploaded",
  "gemini_uploading",
  "gemini_processing",
  "analyzing",
  "rate_limited",
  "completed",
  "failed",
];

export function isTerminalStatus(status: JobStatus): boolean {
  return status === "completed" || status === "failed";
}
