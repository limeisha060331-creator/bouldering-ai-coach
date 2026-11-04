// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AnalyzeProgressEvent, AnalyzeStartPayload } from "@shared/ipc";

const { JobManager } = await import("../../electron/job-manager");
const { createDeepSeekRunner } = await import("../../electron/deepseek-runner");

function payload(patch: Partial<AnalyzeStartPayload> = {}): AnalyzeStartPayload {
  return {
    provider: "deepseek",
    fileName: "crux.mp4",
    mimeType: "video/mp4",
    depth: "deep",
    locale: "zh",
    originalSize: 2048,
    compressedSize: 2048,
    frames: [
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
    ],
    ...patch,
  };
}

function createPipeline(fetchImpl: typeof fetch) {
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

function okResponse(text: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: text } }] }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

async function flush(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("分析流水线（JobManager + DeepSeekRunner 集成）", () => {
  it("用关键帧跑通并回传带时间轴的分析正文", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse("难度：V5\n00:03 起步重心偏后")
    ) as unknown as typeof fetch;
    const { manager, events } = createPipeline(fetchImpl);

    const { jobId } = manager.start(payload());
    await flush();

    const job = manager.get(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.analysis).toContain("难度：V5");
    expect(job?.promptVersion).toBeTruthy();
    expect(events.map((e) => e.status)).toEqual([
      "uploaded",
      "analyzing",
      "completed",
    ]);

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toContain("api.deepseek.com");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("deepseek-flash");
    expect(JSON.stringify(body.messages)).toContain("第 1/2 帧");
    expect(JSON.stringify(body.messages)).toContain("data:image/jpeg;base64,F2");
  });

  it("余额不足时直接失败且不重试", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Insufficient Balance" } }),
          { status: 402 }
        )
    ) as unknown as typeof fetch;
    const { manager } = createPipeline(fetchImpl);

    const { jobId } = manager.start(payload());
    await flush();

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
      return okResponse("第二次拿到分析正文");
    }) as unknown as typeof fetch;
    const { manager, events } = createPipeline(fetchImpl);

    const { jobId } = manager.start(payload());
    await flush(24);

    expect(manager.get(jobId)?.status).toBe("completed");
    expect(manager.get(jobId)?.analysis).toBe("第二次拿到分析正文");
    expect(events.map((e) => e.status)).toContain("rate_limited");
  });

  it("缺少关键帧时给出可操作错误", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { manager } = createPipeline(fetchImpl);

    const { jobId } = manager.start(payload({ frames: [] }));
    await flush(8);

    expect(manager.get(jobId)?.status).toBe("failed");
    expect(manager.get(jobId)?.error).toContain("关键帧");
    expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
  });

  it("中途取消会终止流水线", async () => {
    const fetchImpl = vi.fn(
      () => new Promise<Response>(() => undefined)
    ) as unknown as typeof fetch;
    const { manager } = createPipeline(fetchImpl);

    const { jobId } = manager.start(payload());
    await flush(4);
    manager.cancel(jobId);
    await flush(4);

    expect(manager.get(jobId)?.status).toBe("failed");
    expect(manager.get(jobId)?.error).toContain("取消");
  });
});
