import {
  errorFromFetchJson,
  explainFetchError,
  readFetchJson,
} from "./fetch-json";
import type { AgentRunRecord } from "./agent/run-types";

const POLL_INTERVAL_MS = 3000;
/** 含 429 冷却与后台分析重试 */
const MAX_POLL_MS = 540_000;
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
  /** 网页端 Agent 运行审计（工具调用、校验、成本） */
  agent?: AgentRunRecord;
  agentPhase?: string;
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

type StatusJson = {
  status?: string;
  error?: string;
  retryAfter?: string;
  analysis?: string;
  retryable?: boolean;
  analysisAttempt?: number;
  agentPhase?: string;
  agent?: AgentRunRecord;
};

const STATUS_HINTS: Record<string, string> = {
  uploaded: "已接收关键帧，准备提交分析…",
  analyzing: "教练正在逐帧分析（后台运行）…",
  rate_limited: "【排队】DeepSeek 限流或服务繁忙，正在自动重试…",
};

function analyzingHint(
  data: StatusJson,
  elapsedSec: number,
  locale: "zh" | "en"
): string {
  if (data.error) return String(data.error);
  if (data.agentPhase === "agent") {
    return locale === "en"
      ? "Coach agent is gathering evidence and validating the report…"
      : "教练 Agent 正在取证并校验报告…";
  }
  if (data.analysisAttempt && data.analysisAttempt > 1) {
    return locale === "en"
      ? `Background analysis (attempt ${data.analysisAttempt})…`
      : `后台分析中（第 ${data.analysisAttempt} 次尝试）…`;
  }
  if (elapsedSec > 120) {
    return locale === "en"
      ? "Deep analysis is taking longer; please keep waiting…"
      : "深度分析耗时较长，请继续等待…";
  }
  return locale === "en"
    ? "Coach is analyzing frame by frame (background)…"
    : STATUS_HINTS.analyzing;
}

const PHASE_LABELS: Record<string, string> = {
  uploaded: "phase_received",
  analyzing: "phase_analyze",
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
  /** 用于网络错误文案 */
  locale?: "zh" | "en";
  /** Supabase access token；状态接口要求登录 */
  accessToken?: string;
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

    let res: Response;
    try {
      res = await fetch(`/api/analyze/status/${jobId}`, {
        cache: "no-store",
        headers: options?.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : undefined,
        signal: options?.signal,
      });
    } catch (err) {
      const { message, retryable } = explainFetchError(
        err,
        options?.locale ?? "zh"
      );
      throw new AnalysisPollError(
        message,
        retryable,
        Date.now() - started
      );
    }

    const parsedRes = await readFetchJson<StatusJson>(res);
    if (parsedRes.parseError || !parsedRes.ok || !parsedRes.data) {
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
        : status === "analyzing"
          ? analyzingHint(data, elapsedSec, options?.locale ?? "zh")
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
        agent: data.agent,
        agentPhase: data.agentPhase,
        elapsedMs,
      };
    }

    if (status === "failed") {
      throw new AnalysisPollError(
        data.error || "分析失败",
        data.retryable !== false,
        elapsedMs
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new AnalysisPollError(
    `分析超时（已等待 ${Math.round(MAX_POLL_MS / 1000)} 秒，任务 ${jobId}）。` +
      `常见原因：DeepSeek 限流、网络波动，或深度分析耗时过长。` +
      `建议：① 改用「轻量」深度；② 换更短的片段；③ 等待 2 分钟后点「使用当前视频再试」；` +
      `④ 确认 Vercel 中 DEEPSEEK_API_KEY 已配置。可在 Logs 搜索 jobId=${jobId}。`,
    true,
    MAX_POLL_MS
  );
}
