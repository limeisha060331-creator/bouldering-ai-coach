// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { JobManager, type AnalysisJob } from "../../electron/job-manager";
import type { AnalyzeStartPayload, AnalyzeProgressEvent } from "@shared/ipc";

function payload(): AnalyzeStartPayload {
  return {
    fileName: "crux.mp4",
    mimeType: "video/mp4",
    depth: "deep",
    locale: "zh",
    originalSize: 1024,
    compressedSize: 1024,
    data: new Uint8Array([1, 2, 3, 4]),
  };
}

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createManager(
  run: (job: AnalysisJob) => Promise<string>,
  overrides: Partial<ConstructorParameters<typeof JobManager>[0]> = {}
) {
  const events: AnalyzeProgressEvent[] = [];
  const finished: AnalysisJob[] = [];
  const manager = new JobManager({
    run: (job) => run(job),
    sleep: async () => {},
    idFactory: () => "job-test",
    onProgress: (event) => events.push(event),
    onFinished: (job) => finished.push(job),
    ...overrides,
  });
  return { manager, events, finished };
}

describe("JobManager", () => {
  it("成功路径：从 uploaded 走到 completed 并回传正文", async () => {
    const { manager, events, finished } = createManager(async () => "分析正文");
    const { jobId, estimatedSeconds } = manager.start(payload());

    expect(jobId).toBe("job-test");
    expect(estimatedSeconds).toBeGreaterThan(0);
    await flush();

    expect(manager.get(jobId)?.status).toBe("completed");
    expect(manager.get(jobId)?.analysis).toBe("分析正文");
    expect(events[0].status).toBe("uploaded");
    expect(events.at(-1)?.status).toBe("completed");
    expect(events.at(-1)?.analysis).toBe("分析正文");
    expect(finished).toHaveLength(1);
  });

  it("可重试错误：先进入 rate_limited，再重试成功", async () => {
    let attempts = 0;
    const { manager, events } = createManager(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("429 GenerateRequestsPerMinute retry in 3s");
      }
      return "第二次成功";
    });

    manager.start(payload());
    await flush();

    expect(attempts).toBe(2);
    expect(manager.get("job-test")?.status).toBe("completed");
    expect(manager.get("job-test")?.analysis).toBe("第二次成功");
    const rateLimited = events.filter((e) => e.status === "rate_limited");
    expect(rateLimited).toHaveLength(1);
    expect(rateLimited[0].retryAfter).toBeTruthy();
  });

  it("不可重试错误：直接标记 failed 且不重试", async () => {
    const run = vi.fn(async () => {
      throw new Error("unexpected failure");
    });
    const { manager, finished } = createManager(run);

    manager.start(payload());
    await flush();

    expect(run).toHaveBeenCalledTimes(1);
    const job = manager.get("job-test");
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("unexpected failure");
    expect(finished).toHaveLength(1);
  });

  it("达到最大重试次数后失败", async () => {
    let attempts = 0;
    const { manager } = createManager(async () => {
      attempts += 1;
      throw new Error("503 service unavailable");
    });

    manager.start(payload());
    await flush(20);

    expect(attempts).toBe(3);
    expect(manager.get("job-test")?.status).toBe("failed");
  });

  it("取消任务后不再产出结果", async () => {
    const deferred: { resolve: ((value: string) => void) | null } = {
      resolve: null,
    };
    const { manager } = createManager(
      () =>
        new Promise<string>((resolve) => {
          deferred.resolve = resolve;
        })
    );

    const { jobId } = manager.start(payload());
    manager.cancel(jobId);
    deferred.resolve?.("迟到结果");
    await flush();

    const job = manager.get(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("取消");
    expect(job?.analysis).toBeUndefined();
  });

  it("日配额硬停：failed 且标记 dailyQuotaExhausted", async () => {
    const { manager } = createManager(async () => {
      throw new Error(
        "429 QuotaFailure generate_content_free_tier GenerateRequestsPerDay limit: 20 retry in 9000s"
      );
    });

    manager.start(payload());
    await flush();

    const job = manager.get("job-test");
    expect(job?.status).toBe("failed");
    expect(job?.dailyQuotaExhausted).toBe(true);
  });

  it("未配置 API Key 时给出可操作提示", async () => {
    const { manager } = createManager(async () => {
      throw new Error("未配置 Gemini API Key，请在「设置」中填写后再分析。");
    });

    manager.start(payload());
    await flush();

    expect(manager.get("job-test")?.error).toContain("API Key");
  });

  it("任务对象保留 prompt 版本与输入元数据", async () => {
    const { manager } = createManager(async () => "ok");
    manager.start(payload());
    const job = manager.get("job-test");
    expect(job?.promptVersion).toBeTruthy();
    expect(job?.mimeType).toBe("video/mp4");
    expect(job?.videoBuffer.length).toBe(4);
    await flush();
  });
});
