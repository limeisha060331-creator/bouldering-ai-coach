import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
const deepseek = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("@vercel/functions", () => ({
  waitUntil: (task: Promise<unknown>) => {
    background.tasks.push(task);
  },
}));

vi.mock("../lib/deepseek-analysis", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/deepseek-analysis")>();
  return { ...actual, runDeepSeekAnalysis: deepseek.run };
});

const { saveMemoryJob, getMemoryJob } = await import("../lib/job-memory-store");
const { advanceAnalysisJob } = await import("../lib/process-analysis-job");
const { DeepSeekApiError } = await import("../lib/deepseek-analysis");

function job(patch: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: "job-1",
    status: "uploaded" as const,
    createdAt: now,
    updatedAt: now,
    statusSince: now,
    fileName: "crux.mp4",
    mimeType: "image/jpeg",
    frameCount: 2,
    durationSec: 12,
    promptVersion: "2026-11-1",
    depth: "deep" as const,
    locale: "zh" as const,
    model: "deepseek-flash",
    frames: [
      { seconds: 0.4, timestamp: "00:00", dataUrl: "data:image/jpeg;base64,F1" },
      { seconds: 9.1, timestamp: "00:09", dataUrl: "data:image/jpeg;base64,F2" },
    ],
    ...patch,
  };
}

async function drain(): Promise<void> {
  while (background.tasks.length > 0) {
    const tasks = background.tasks.splice(0);
    await Promise.all(tasks);
  }
}

beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "development" });
  process.env.DEEPSEEK_API_KEY = "sk-test";
  background.tasks.length = 0;
  deepseek.run.mockReset();
});

afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
  Object.assign(process.env, { NODE_ENV: "test" });
});

describe("advanceAnalysisJob（内存任务表 + DeepSeek 状态机）", () => {
  it("uploaded → analyzing → completed，并保存正文与 usage", async () => {
    deepseek.run.mockResolvedValue({
      text: "难度：V5\n[00:03] 起步重心偏后",
      modelId: "deepseek-flash",
      attempts: 1,
      latencyMs: 1200,
      usage: { promptTokens: 900, outputTokens: 200, totalTokens: 1100, cachedTokens: 0 },
    });
    saveMemoryJob(job());

    await advanceAnalysisJob("job-1");
    await drain();

    const saved = getMemoryJob("job-1");
    expect(saved?.status).toBe("completed");
    expect(saved?.analysis).toContain("难度：V5");
    expect(saved?.usage?.totalTokens).toBe(1100);

    const call = deepseek.run.mock.calls[0][0];
    expect(call.frames).toHaveLength(2);
    expect(call.maxAttempts).toBe(1);
  });

  it("限流错误进入 rate_limited 并写入冷却时间", async () => {
    deepseek.run.mockRejectedValue(
      new DeepSeekApiError(429, "DeepSeek 触发限流", true, 20)
    );
    saveMemoryJob(job());

    await advanceAnalysisJob("job-1");
    await drain();

    const saved = getMemoryJob("job-1");
    expect(saved?.status).toBe("rate_limited");
    expect(saved?.retryAfter).toBeTruthy();
    expect(saved?.error).toContain("限流");
  });

  it("未知错误直接失败，不会无限重试", async () => {
    deepseek.run.mockRejectedValue(new Error("unexpected shape"));
    saveMemoryJob(job());

    await advanceAnalysisJob("job-1");
    await drain();

    const saved = getMemoryJob("job-1");
    expect(saved?.status).toBe("failed");
    expect(saved?.error).toContain("unexpected shape");
    expect(deepseek.run).toHaveBeenCalledTimes(1);
  });

  it("冷却未结束时不再推进", async () => {
    saveMemoryJob(
      job({
        status: "rate_limited",
        retryAfter: new Date(Date.now() + 60_000).toISOString(),
      })
    );

    await advanceAnalysisJob("job-1");
    await drain();

    expect(getMemoryJob("job-1")?.status).toBe("rate_limited");
    expect(deepseek.run).not.toHaveBeenCalled();
  });

  it("未配置 Key 时立刻失败", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    saveMemoryJob(job());

    await advanceAnalysisJob("job-1");
    await drain();

    const saved = getMemoryJob("job-1");
    expect(saved?.status).toBe("failed");
    expect(saved?.error).toContain("DEEPSEEK_API_KEY");
    expect(deepseek.run).not.toHaveBeenCalled();
  });
});
