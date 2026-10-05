// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisJob, JobHooks } from "../../electron/job-manager";
import type { JobStatus } from "@shared/ipc";

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

const { createGeminiRunner } = await import("../../electron/gemini-runner");

function baseJob(patch: Partial<AnalysisJob> = {}): AnalysisJob {
  return {
    id: "job-1",
    status: "uploaded",
    provider: "gemini",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    fileName: "crux.mp4",
    mimeType: "video/mp4",
    depth: "deep",
    locale: "zh",
    originalSize: 10,
    compressedSize: 10,
    videoBuffer: Buffer.from([1, 2, 3]),
    frames: [],
    promptVersion: "test",
    analysisAttempt: 1,
    logs: [],
    ...patch,
  };
}

function hooksRecorder(job: AnalysisJob) {
  const statuses: JobStatus[] = [];
  const logs: string[] = [];
  const hooks: JobHooks = {
    setStatus: (status, patch) => {
      Object.assign(job, patch);
      job.status = status;
      statuses.push(status);
    },
    log: (message) => logs.push(message),
  };
  return { hooks, statuses, logs };
}

beforeEach(() => {
  phases.geminiPhase1Upload.mockReset();
  phases.geminiPhase2CheckReady.mockReset();
  phases.geminiPhase2DeleteFile.mockReset();

  phases.geminiPhase1Upload.mockImplementation(async () => ({
    fileName: "files/abc",
    fileUri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
    mimeType: "video/mp4",
    state: "ACTIVE",
  }));
  phases.geminiPhase2CheckReady.mockImplementation(async () => ({
    state: "ACTIVE",
    ready: true,
  }));
  phases.geminiPhase2DeleteFile.mockImplementation(async () => undefined);
});

describe("createGeminiRunner", () => {
  it("完整跑通上传 → 处理 → 分析，并清理远端文件", async () => {
    const job = baseJob();
    const { hooks, statuses, logs } = hooksRecorder(job);
    const generate = vi.fn(async () => "难度：V4\n00:03 起步重心偏后");

    const runner = createGeminiRunner({
      apiKey: () => "test-key",
      runGenerateContent: generate as never,
    });

    const analysis = await runner(job, hooks);

    expect(analysis).toContain("难度：V4");
    expect(statuses).toEqual([
      "gemini_uploading",
      "gemini_processing",
      "analyzing",
    ]);
    expect(job.geminiFileUri).toBeTruthy();
    expect(job.fileReady).toBe(true);
    expect(generate).toHaveBeenCalledWith(
      "test-key",
      job.geminiFileUri,
      "video/mp4",
      expect.objectContaining({ depth: "deep", locale: "zh", maxAttempts: 2 })
    );
    expect(phases.geminiPhase2DeleteFile).toHaveBeenCalledWith(
      "test-key",
      "files/abc"
    );
    expect(logs.length).toBeGreaterThan(0);
  });

  it("视频未就绪时轮询直到 ACTIVE", async () => {
    phases.geminiPhase1Upload.mockResolvedValue({
      fileName: "files/slow",
      fileUri: "https://x/slow",
      mimeType: "video/mp4",
      state: "PROCESSING",
    });
    phases.geminiPhase2CheckReady
      .mockResolvedValueOnce({ state: "PROCESSING", ready: false })
      .mockResolvedValueOnce({ state: "ACTIVE", ready: true });

    const job = baseJob();
    const { hooks, statuses } = hooksRecorder(job);
    const sleep = vi.fn(async () => undefined);

    const runner = createGeminiRunner({
      apiKey: () => "test-key",
      sleep,
      runGenerateContent: (async () => "ok") as never,
    });

    await runner(job, hooks);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(phases.geminiPhase2CheckReady).toHaveBeenCalledTimes(2);
    expect(statuses.filter((s) => s === "gemini_processing")).toHaveLength(2);
    expect(statuses.at(-1)).toBe("analyzing");
  });

  it("远端处理失败时抛错", async () => {
    phases.geminiPhase1Upload.mockResolvedValue({
      fileName: "files/bad",
      fileUri: "https://x/bad",
      mimeType: "video/mp4",
      state: "PROCESSING",
    });
    phases.geminiPhase2CheckReady.mockResolvedValue({
      state: "FAILED",
      ready: false,
    });

    const job = baseJob();
    const { hooks } = hooksRecorder(job);
    const runner = createGeminiRunner({
      apiKey: () => "test-key",
      runGenerateContent: (async () => "never") as never,
    });

    await expect(runner(job, hooks)).rejects.toThrow("Gemini 视频处理失败");
  });

  it("处理超时抛出可读错误", async () => {
    phases.geminiPhase1Upload.mockResolvedValue({
      fileName: "files/slow",
      fileUri: "https://x/slow",
      mimeType: "video/mp4",
      state: "PROCESSING",
    });
    phases.geminiPhase2CheckReady.mockResolvedValue({
      state: "PROCESSING",
      ready: false,
    });

    let clock = 0;
    const job = baseJob();
    const { hooks } = hooksRecorder(job);
    const runner = createGeminiRunner({
      apiKey: () => "test-key",
      now: () => (clock += 200_000),
      sleep: async () => undefined,
      runGenerateContent: (async () => "never") as never,
    });

    await expect(runner(job, hooks)).rejects.toThrow("超过 3 分钟");
  });

  it("缺少 API Key 时给出配置提示", async () => {
    const job = baseJob();
    const { hooks } = hooksRecorder(job);
    const runner = createGeminiRunner({
      apiKey: () => "",
      runGenerateContent: (async () => "never") as never,
    });

    await expect(runner(job, hooks)).rejects.toThrow("未配置 Gemini API Key");
  });

  it("已经上传过的任务不会重复上传", async () => {
    const job = baseJob({
      geminiFileName: "files/existing",
      geminiFileUri: "https://x/existing",
      fileReady: true,
    });
    const { hooks, statuses } = hooksRecorder(job);
    const runner = createGeminiRunner({
      apiKey: () => "test-key",
      runGenerateContent: (async () => "ok") as never,
    });

    await runner(job, hooks);

    expect(phases.geminiPhase1Upload).not.toHaveBeenCalled();
    expect(statuses).toEqual(["analyzing"]);
  });
});
