// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeProgressEvent } from "@shared/ipc";

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

function payload() {
  return {
    fileName: "crux.mp4",
    mimeType: "video/mp4" as const,
    depth: "deep" as const,
    locale: "zh" as const,
    originalSize: 2048,
    compressedSize: 2048,
    data: new Uint8Array([1, 2, 3, 4]),
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
