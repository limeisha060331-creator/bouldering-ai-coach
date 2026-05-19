import { errorFromFetchJson, readFetchJson } from "./fetch-json";

const POLL_INTERVAL_MS = 3000;
/** 含 429 冷却、Gemini 处理、卡死重试，需长于 3 分钟 */
const MAX_POLL_MS = 360_000;
const VERCEL_SOFT_LIMIT_MS = 10_000;

export interface AnalyzeApiResult {
  id: string;
  jobId?: string;
  async?: boolean;
  status: string;
  analysis?: string;
  error?: string;
  message?: string;
  phase?: string;
  elapsedMs?: number;
}

export class AnalysisPollError extends Error {
  readonly retryable: boolean;
  readonly elapsedMs: number;

  constructor(message: string, retryable: boolean, elapsedMs: number) {
    super(message);
    this.name = "AnalysisPollError";
    this.retryable = retryable;
    this.elapsedMs = elapsedMs;
  }
}

const STATUS_HINTS: Record<string, string> = {
  uploaded: "已上传，准备提交 Gemini…",
  gemini_uploading: "【阶段一】正在上传至 Gemini Files API…",
  gemini_processing: "【阶段二】Gemini 正在处理视频，请稍候…",
  analyzing: "【阶段二】教练正在观看并分析…",
  rate_limited: "【限流】Gemini 免费额度紧张，正在自动排队重试…",
};

const PHASE_LABELS: Record<string, string> = {
  uploaded: "phase_upload",
  gemini_uploading: "phase1_gemini_upload",
  gemini_processing: "phase2_gemini_wait",
  analyzing: "phase2_gemini_analyze",
  completed: "done",
  failed: "failed",
};

function estimateWaitHint(elapsedMs: number, status: string): string {
  if (elapsedMs > VERCEL_SOFT_LIMIT_MS && status !== "completed") {
    return "（云端采用短请求 + 轮询，规避 Vercel 10 秒限制，请耐心等待）";
  }
  if (elapsedMs > 60_000) {
    return "（分析时间较长，可继续等待或稍后重试）";
  }
  return "";
}

export type PollProgressMeta = {
  retryAfter?: string;
};

export interface PollOptions {
  onProgress?: (
    status: string,
    hint: string,
    elapsedSec: number,
    meta?: PollProgressMeta
  ) => void;
  signal?: AbortSignal;
}

export async function pollUntilComplete(
  jobId: string,
  options?: PollOptions
): Promise<AnalyzeApiResult> {
  const started = Date.now();
  const deadline = started + MAX_POLL_MS;

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new AnalysisPollError("已取消", true, Date.now() - started);
    }

    const res = await fetch(`/api/analyze/status/${jobId}`, {
      cache: "no-store",
      signal: options?.signal,
    });

    type StatusJson = {
      status?: string;
      error?: string;
      retryAfter?: string;
      analysis?: string;
      retryable?: boolean;
    };

    const parsedRes = await readFetchJson<StatusJson>(res);
    if (!parsedRes.ok || !parsedRes.data) {
      const { message, retryable } = errorFromFetchJson(
        parsedRes,
        "查询分析状态失败"
      );
      throw new AnalysisPollError(
        message,
        retryable,
        Date.now() - started
      );
    }

    const data = parsedRes.data;

    const elapsedMs = Date.now() - started;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const status = data.status ?? "uploaded";
    const baseHint =
      status === "rate_limited" && data.error
        ? String(data.error)
        : STATUS_HINTS[status] ?? "分析进行中…";
    const hint = baseHint + estimateWaitHint(elapsedMs, status);

    const meta: PollProgressMeta | undefined =
      status === "rate_limited" && data.retryAfter
        ? { retryAfter: data.retryAfter as string }
        : undefined;

    options?.onProgress?.(status, hint, elapsedSec, meta);

    if (status === "completed" && data.analysis) {
      return {
        id: jobId,
        jobId,
        status: "completed",
        analysis: data.analysis,
        async: true,
        phase: PHASE_LABELS.completed,
        elapsedMs,
      };
    }

    if (status === "failed") {
      throw new AnalysisPollError(
        data.error || "分析失败",
        true,
        elapsedMs
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new AnalysisPollError(
    `分析超时（已等待 ${Math.round(MAX_POLL_MS / 1000)} 秒）。` +
      `这与视频文件大小无必然关系，常见原因是 Gemini 排队、限流(429) 或云端任务卡住。` +
      `请等 1～2 分钟后重新上传并分析；若反复出现，请到 Vercel Logs 查看该 jobId。`,
    true,
    MAX_POLL_MS
  );
}
