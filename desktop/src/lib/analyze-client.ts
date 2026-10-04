import type {
  AnalyzeProgressEvent,
  AnalyzeStartPayload,
} from "@shared/ipc";

export type AnalyzeRunResult = {
  jobId: string;
  analysis: string;
};

export type RunAnalysisOptions = {
  onProgress?: (event: AnalyzeProgressEvent) => void;
  signal?: AbortSignal;
};

export class AnalysisCanceledError extends Error {
  constructor() {
    super("已取消");
    this.name = "AnalysisCanceledError";
  }
}

/**
 * 调用主进程分析流水线并等待结果。
 * 进度事件通过 IPC 推送；`start` 返回 jobId 之前到达的事件会先缓存再回放，
 * 避免丢失最早的「已接收」状态。
 */
export function analyzeVideo(
  payload: AnalyzeStartPayload,
  options: RunAnalysisOptions = {}
): Promise<AnalyzeRunResult> {
  return new Promise<AnalyzeRunResult>((resolve, reject) => {
    let jobId: string | null = null;
    let settled = false;
    const buffered: AnalyzeProgressEvent[] = [];

    const unsubscribe = window.crux.analyze.onProgress((event) => {
      if (settled) return;
      if (!jobId) {
        buffered.push(event);
        return;
      }
      if (event.jobId !== jobId) return;

      options.onProgress?.(event);
      if (event.status === "completed" && event.analysis) {
        settled = true;
        unsubscribe();
        resolve({ jobId, analysis: event.analysis });
      } else if (event.status === "failed") {
        settled = true;
        unsubscribe();
        reject(new Error(event.error ?? "分析失败"));
      }
    });

    const cancel = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (jobId) void window.crux.analyze.cancel(jobId);
      reject(new AnalysisCanceledError());
    };

    if (options.signal) {
      if (options.signal.aborted) {
        cancel();
        return;
      }
      options.signal.addEventListener("abort", cancel, { once: true });
    }

    window.crux.analyze
      .start(payload)
      .then((result) => {
        if (settled) return;
        jobId = result.jobId;
        for (const event of buffered) {
          if (event.jobId === jobId) options.onProgress?.(event);
        }
      })
      .catch((err: unknown) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}
