import { randomUUID } from "node:crypto";
import { PROMPT_VERSION } from "@lib/analyze-prompt";
import type {
  AnalysisDepth,
  AnalysisLocale,
  AnalyzeProgressEvent,
  AnalyzeStartPayload,
  AnalyzeStartResult,
  JobStatus,
} from "@shared/ipc";
import { PHASE_LABELS, STATUS_HINTS } from "@shared/analysis-status";
import { classifyAnalysisError, type ErrorDecision } from "./error-policy";

export type AnalysisJob = {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  fileName: string;
  mimeType: string;
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  originalSize: number;
  compressedSize: number;
  videoBuffer: Buffer;
  promptVersion: string;
  analysisAttempt: number;
  geminiFileName?: string;
  geminiFileUri?: string;
  geminiState?: string;
  fileReady?: boolean;
  analysis?: string;
  error?: string;
  retryAfter?: string;
  dailyQuotaExhausted?: boolean;
  logs: string[];
};

export type JobHooks = {
  setStatus(status: JobStatus, patch?: Partial<AnalysisJob>): void;
  log(message: string): void;
};

export type JobRunner = (job: AnalysisJob, hooks: JobHooks) => Promise<string>;

export type JobManagerOptions = {
  run: JobRunner;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** 整体流水线最多重试次数（含首次） */
  maxAttempts?: number;
  onProgress?: (event: AnalyzeProgressEvent) => void;
  onFinished?: (job: AnalysisJob) => void;
  idFactory?: () => string;
};

const MAX_LOGS = 40;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 分析任务状态机（桌面版本地运行，无 Serverless 时限）：
 * 上传 → Gemini 处理 → 分析，带限流退避与整体重试。
 */
export class JobManager {
  private readonly jobs = new Map<string, AnalysisJob>();
  private readonly cancelled = new Set<string>();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(private readonly options: JobManagerOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  }

  list(): AnalysisJob[] {
    return [...this.jobs.values()];
  }

  get(jobId: string): AnalysisJob | undefined {
    return this.jobs.get(jobId);
  }

  start(payload: AnalyzeStartPayload): AnalyzeStartResult {
    const nowIso = new Date(this.now()).toISOString();
    const id = this.options.idFactory?.() ?? randomUUID();
    const job: AnalysisJob = {
      id,
      status: "uploaded",
      createdAt: nowIso,
      updatedAt: nowIso,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      depth: payload.depth,
      locale: payload.locale,
      originalSize: payload.originalSize,
      compressedSize: payload.compressedSize,
      videoBuffer: Buffer.from(payload.data),
      promptVersion: PROMPT_VERSION,
      analysisAttempt: 1,
      logs: [],
    };
    this.jobs.set(id, job);
    this.emit(job);
    void this.execute(job);

    return {
      jobId: id,
      estimatedSeconds: Math.min(
        120,
        30 + Math.ceil(payload.compressedSize / (512 * 1024))
      ),
    };
  }

  cancel(jobId: string): void {
    this.cancelled.add(jobId);
  }

  isCancelled(jobId: string): boolean {
    return this.cancelled.has(jobId);
  }

  private hooks(job: AnalysisJob): JobHooks {
    return {
      setStatus: (status, patch) => this.setStatus(job, status, patch),
      log: (message) => {
        const stamp = new Date(this.now()).toISOString();
        job.logs = [...job.logs, `${stamp} ${message}`].slice(-MAX_LOGS);
      },
    };
  }

  setStatus(
    job: AnalysisJob,
    status: JobStatus,
    patch?: Partial<AnalysisJob>
  ): void {
    if (patch) Object.assign(job, patch);
    job.status = status;
    job.updatedAt = new Date(this.now()).toISOString();
    this.emit(job);
  }

  private emit(job: AnalysisJob): void {
    const elapsedSec = Math.max(
      0,
      Math.round((this.now() - new Date(job.createdAt).getTime()) / 1000)
    );
    this.options.onProgress?.({
      jobId: job.id,
      status: job.status,
      phase: PHASE_LABELS[job.status],
      hint: job.error ? job.error : STATUS_HINTS[job.status],
      elapsedSec,
      retryAfter: job.retryAfter,
      error: job.error,
      analysisAttempt: job.analysisAttempt,
      analysis:
        job.status === "completed" && job.analysis ? job.analysis : undefined,
    });
  }

  private async execute(job: AnalysisJob): Promise<void> {
    const hooks = this.hooks(job);
    const startedAt = this.now();

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (this.cancelled.has(job.id)) {
        this.finish(job, "failed", "已取消分析。");
        return;
      }

      job.analysisAttempt = attempt;
      job.error = undefined;
      job.retryAfter = undefined;

      try {
        const analysis = await this.options.run(job, hooks);
        if (this.cancelled.has(job.id)) {
          this.finish(job, "failed", "已取消分析。");
          return;
        }
        job.analysis = analysis;
        this.setStatus(job, "completed");
        this.options.onFinished?.(job);
        return;
      } catch (err) {
        const decision: ErrorDecision = classifyAnalysisError(err);

        if (!decision.retryable || attempt >= this.maxAttempts) {
          job.dailyQuotaExhausted = decision.dailyQuotaExhausted;
          this.finish(job, "failed", decision.message);
          return;
        }

        job.retryAfter = new Date(
          this.now() + decision.waitSeconds * 1000
        ).toISOString();
        this.setStatus(job, "rate_limited", { error: decision.message });
        await this.sleep(decision.waitSeconds * 1000);

        if (this.cancelled.has(job.id)) {
          this.finish(job, "failed", "已取消分析。");
          return;
        }
        hooks.log(
          `第 ${attempt} 次尝试失败后重试（已等待 ${decision.waitSeconds}s）：${decision.message}`
        );
      }
    }

    const totalSec = Math.round((this.now() - startedAt) / 1000);
    this.finish(job, "failed", `分析多次失败（共 ${totalSec}s），请稍后重试。`);
  }

  private finish(job: AnalysisJob, status: JobStatus, error: string): void {
    job.error = error;
    job.retryAfter = undefined;
    this.setStatus(job, status);
    this.options.onFinished?.(job);
  }
}
