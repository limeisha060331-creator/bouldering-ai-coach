// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeProgressEvent, AnalyzeStartPayload } from "@shared/ipc";

const phases = vi.hoisted(() => ({
  geminiPhase1Upload: vi.fn(),
  geminiPhase2CheckReady: vi.fn(),
  geminiPhase2DeleteFile: vi.fn(),
}));

vi.mock("@lib/gemini-phases", () => ({
  geminiPhase1Upload: phases.geminiPhase1Upload,
  geminiPhase2CheckReady: phases.geminiPhase2CheckReady,
  geminiPhase2DeleteFile: phases.geminiPhase2DeleteFile,
}));

const { JobManager } = await import("../../electron/job-manager");
const { createGeminiRunner } = await import("../../electron/gemini-runner");
const { createDeepSeekRunner } = await import("../../electron/deepseek-runner");

beforeEach(() => {
  phases.geminiPhase1Upload.mockReset();
  phases.geminiPhase2CheckReady.mockReset();
  phases.geminiPhase2DeleteFile.mockReset();

  phases.geminiPhase1Upload.mockImplementation(async () => ({
    fileName: "files/abc",
    fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
    mimeType: "video/mp4",
    state: "PROCESSING",
  }));
  phases.geminiPhase2CheckReady.mockImplementation(async () => ({
    state: "ACTIVE",
    ready: true,
  }));
  phases.geminiPhase2DeleteFile.mockImplementation(async () => undefined);
});

function createPipeline(generate: (attempt: number) => Promise<string>) {
  let attempt = 0;
  const events: AnalyzeProgressEvent[] = [];
  const manager = new JobManager({
    run: createGeminiRunner({
      apiKey: () => "test-key",
      sleep: async () => undefined,
      runGenerateContent: (async () => generate((attempt += 1))) as never,
    }),
    sleep: async () => undefined,
    idFactory: () => "job-pipeline",
    onProgress: (event) => events.push(event),
  });
  return { manager, events };
}

function payload(patch: Partial<AnalyzeStartPayload> = {}): AnalyzeStartPayload {
  return {
    provider: "gemini",
    fileName: "crux.mp4",
    mimeType: "video/mp4",
    depth: "deep",
    locale: "zh",
    originalSize: 2048,
    compressedSize: 2048,
    data: new Uint8Array([1, 2, 3, 4]),
    frames: [],
    ...patch,
  };
}

async function flush(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("分析流水线（JobManager + GeminiRunner 集成）", () => {
  it("从上传一路走到 completed，并回调最终正文", async () => {
    const { manager, events } = createPipeline(
      async () => "难度：V5\n00:04 起步重心偏后\n核心维度评估\n1. 重心：胯部离墙远"
    );

    const { jobId } = manager.start(payload());
    await flush();

    const job = manager.get(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.analysis).toContain("难度：V5");
    expect(job?.promptVersion).toBeTruthy();

    const statuses = events.map((e) => e.status);
    expect(statuses).toEqual([
      "uploaded",
      "gemini_uploading",
      "gemini_processing",
      "analyzing",
      "completed",
    ]);
    expect(events.at(-1)?.analysis).toContain("难度：V5");
    expect(phases.geminiPhase2DeleteFile).toHaveBeenCalledTimes(1);
  });

  it("generateContent 遇到 429 时进入排队并自动重试成功（不重复上传）", async () => {
    const { manager, events } = createPipeline(async (attempt) => {
      if (attempt === 1) {
        throw new Error("429 GenerateRequestsPerMinute retry in 2s");
      }
      return "第二次拿到分析正文";
    });

    const { jobId } = manager.start(payload());
    await flush(24);

    const job = manager.get(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.analysis).toBe("第二次拿到分析正文");
    expect(job?.analysisAttempt).toBe(2);

    const statuses = events.map((e) => e.status);
    expect(statuses).toContain("rate_limited");
    expect(statuses.at(-1)).toBe("completed");
    // 视频只上传一次，重试直接复用 Gemini 上的文件
    expect(phases.geminiPhase1Upload).toHaveBeenCalledTimes(1);
  });

  it("日配额耗尽时明确失败且不无限重试", async () => {
    const { manager } = createPipeline(async () => {
      throw new Error(
        "429 QuotaFailure generate_content_free_tier GenerateRequestsPerDay limit: 20 retry in 9000s"
      );
    });

    const { jobId } = manager.start(payload());
    await flush(24);

    const job = manager.get(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.dailyQuotaExhausted).toBe(true);
    expect(job?.error).toContain("今日免费次数已用尽");
  });

  it("中途取消会终止流水线", async () => {
    const { manager } = createPipeline(
      () => new Promise<string>(() => undefined)
    );

    const { jobId } = manager.start(payload());
    await flush(4);
    manager.cancel(jobId);
    await flush(4);

    expect(manager.get(jobId)?.status).toBe("failed");
    expect(manager.get(jobId)?.error).toContain("取消");
  });
});

function deepSeekPayload(withFrames = true) {
  return payload({
    provider: "deepseek",
    data: new Uint8Array(0),
    frames: withFrames
      ? [
          {
            seconds: 0.4,
            timestamp: "00:00",
            dataUrl: "data:image/jpeg;base64,F1",
          },
          {
            seconds: 3.1,
            timestamp: "00:03",
            dataUrl: "data:image/jpeg;base64,F2",
          },
        ]
      : [],
  });
}

function createDeepSeekPipeline(fetchImpl: typeof fetch) {
  const events: AnalyzeProgressEvent[] = [];
  const manager = new JobManager({
    run: createDeepSeekRunner({
      apiKey: () => "sk-test-key",
      model: () => "deepseek-flash",
      fetchImpl,
    }),
    sleep: async () => undefined,
    idFactory: () => "job-deepseek",
    onProgress: (event) => events.push(event),
  });
  return { manager, events };
}

function deepSeekOkResponse(text: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: text } }] }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("DeepSeek 流水线（关键帧 → 图像理解）", () => {
  it("用关键帧跑通并回传带时间轴的分析正文", async () => {
    const fetchImpl = vi.fn(async () =>
      deepSeekOkResponse("难度：V5\n00:03 起步重心偏后")
    ) as unknown as typeof fetch;
    const { manager, events } = createDeepSeekPipeline(fetchImpl);

    const { jobId } = manager.start(deepSeekPayload());
    await flush(16);

    const job = manager.get(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.analysis).toContain("难度：V5");
    expect(events.map((e) => e.status)).toEqual([
      "uploaded",
      "analyzing",
      "completed",
    ]);

    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toContain("api.deepseek.com");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("deepseek-flash");
    expect(JSON.stringify(body.messages)).toContain("第 1/2 帧");
    expect(JSON.stringify(body.messages)).toContain(
      "data:image/jpeg;base64,F2"
    );
  });

  it("余额不足时直接失败且不重试", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Insufficient Balance" } }),
          { status: 402 }
        )
    ) as unknown as typeof fetch;
    const { manager } = createDeepSeekPipeline(fetchImpl);

    const { jobId } = manager.start(deepSeekPayload());
    await flush(16);

    expect(manager.get(jobId)?.status).toBe("failed");
    expect(manager.get(jobId)?.error).toContain("余额不足");
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
  });

  it("503 时排队重试后成功", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(
          JSON.stringify({ error: { message: "overloaded" } }),
          { status: 503 }
        );
      }
      return deepSeekOkResponse("第二次拿到分析正文");
    }) as unknown as typeof fetch;
    const { manager, events } = createDeepSeekPipeline(fetchImpl);

    const { jobId } = manager.start(deepSeekPayload());
    await flush(24);

    expect(manager.get(jobId)?.status).toBe("completed");
    expect(manager.get(jobId)?.analysis).toBe("第二次拿到分析正文");
    expect(events.map((e) => e.status)).toContain("rate_limited");
  });

  it("缺少关键帧时给出可操作错误", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { manager } = createDeepSeekPipeline(fetchImpl);

    const { jobId } = manager.start(deepSeekPayload(false));
    await flush(8);

    expect(manager.get(jobId)?.status).toBe("failed");
    expect(manager.get(jobId)?.error).toContain("关键帧");
    expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
  });
});
