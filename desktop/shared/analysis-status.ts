import type { JobStatus } from "./ipc";

/** 任务状态 → 用户可见提示（主进程与渲染进程共用，避免文案漂移） */
export const STATUS_HINTS: Record<JobStatus, string> = {
  uploaded: "已接收关键帧，准备提交 DeepSeek…",
  analyzing: "DeepSeek 正在逐帧分析…",
  rate_limited: "【排队】DeepSeek 限流或服务繁忙，正在自动重试…",
  completed: "分析完成",
  failed: "分析失败",
};

/** 任务状态 → 阶段标识（与网页版 API 语义保持一致） */
export const PHASE_LABELS: Record<JobStatus, string> = {
  uploaded: "phase_received",
  analyzing: "phase_analyze",
  rate_limited: "rate_limited",
  completed: "done",
  failed: "failed",
};

export const PIPELINE_STATUSES: JobStatus[] = [
  "uploaded",
  "analyzing",
  "rate_limited",
  "completed",
  "failed",
];

export function isTerminalStatus(status: JobStatus): boolean {
  return status === "completed" || status === "failed";
}
