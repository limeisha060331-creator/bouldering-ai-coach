import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisCanceledError, analyzeVideo } from "@/lib/analyze-client";
import type {
  AnalyzeProgressEvent,
  AnalyzeStartPayload,
  CruxApi,
} from "@shared/ipc";

const payload: AnalyzeStartPayload = {
  provider: "gemini",
  fileName: "crux.mp4",
  mimeType: "video/mp4",
  depth: "deep",
  locale: "zh",
  originalSize: 100,
  compressedSize: 100,
  data: new Uint8Array([1, 2, 3]),
  frames: [],
};

function event(patch: Partial<AnalyzeProgressEvent>): AnalyzeProgressEvent {
  return {
    jobId: "job-1",
    status: "uploaded",
    phase: "phase_upload",
    hint: "已接收视频",
    elapsedSec: 0,
    ...patch,
  };
}

function installFakeApi(options: { startDelayMicrotasks?: number } = {}) {
  let listener: ((event: AnalyzeProgressEvent) => void) | null = null;
  const cancel = vi.fn(async () => undefined);
  const start = vi.fn(async () => {
    for (let i = 0; i < (options.startDelayMicrotasks ?? 0); i++) {
      await Promise.resolve();
    }
    return { jobId: "job-1", estimatedSeconds: 30 };
  });

  window.crux = {
    analyze: {
      start,
      cancel,
      onProgress: (cb: (event: AnalyzeProgressEvent) => void) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
    },
  } as unknown as CruxApi;

  return {
    start,
    cancel,
    emit: (e: AnalyzeProgressEvent) => listener?.(e),
    hasListener: () => listener !== null,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("analyzeVideo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("收到 completed 事件后解析出正文", async () => {
    const api = installFakeApi();
    const onProgress = vi.fn();
    const promise = analyzeVideo(payload, { onProgress });

    await flush();
    api.emit(event({ status: "analyzing", hint: "分析中" }));
    api.emit(
      event({ status: "completed", analysis: "难度：V4\n00:03 起步偏后" })
    );

    await expect(promise).resolves.toEqual({
      jobId: "job-1",
      analysis: "难度：V4\n00:03 起步偏后",
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(api.hasListener()).toBe(false);
  });

  it("start 返回前到达的事件会被缓存并回放", async () => {
    const api = installFakeApi({ startDelayMicrotasks: 3 });
    const onProgress = vi.fn();
    const promise = analyzeVideo(payload, { onProgress });

    api.emit(event({ status: "uploaded", hint: "已接收" }));
    await flush();
    api.emit(event({ status: "completed", analysis: "正文" }));

    await expect(promise).resolves.toMatchObject({ analysis: "正文" });
    expect(onProgress.mock.calls[0][0].status).toBe("uploaded");
    expect(onProgress.mock.calls[1][0].status).toBe("completed");
  });

  it("忽略其他任务的进度事件", async () => {
    const api = installFakeApi();
    const onProgress = vi.fn();
    const promise = analyzeVideo(payload, { onProgress });
    await flush();

    api.emit(event({ jobId: "other-job", status: "analyzing" }));
    api.emit(event({ status: "completed", analysis: "正文" }));

    await expect(promise).resolves.toMatchObject({ analysis: "正文" });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it("failed 事件转为异常", async () => {
    const api = installFakeApi();
    const promise = analyzeVideo(payload);
    await flush();
    api.emit(event({ status: "failed", error: "配额用尽" }));
    await expect(promise).rejects.toThrow("配额用尽");
  });

  it("start 抛错时直接失败", async () => {
    const api = installFakeApi();
    api.start.mockRejectedValueOnce(new Error("未配置 Gemini API Key"));
    await expect(analyzeVideo(payload)).rejects.toThrow("未配置 Gemini API Key");
  });

  it("abort 会取消任务并抛出取消错误", async () => {
    const api = installFakeApi();
    const controller = new AbortController();
    const promise = analyzeVideo(payload, { signal: controller.signal });
    await flush();

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(AnalysisCanceledError);
    expect(api.cancel).toHaveBeenCalledWith("job-1");
  });

  it("已 abort 的 signal 立即失败", async () => {
    installFakeApi();
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzeVideo(payload, { signal: controller.signal })
    ).rejects.toBeInstanceOf(AnalysisCanceledError);
  });
});
