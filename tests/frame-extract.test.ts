import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sandbox } from "../lib/agent/sandbox";
import { createFrameExtractTool } from "../lib/agent/tools";
import type { AnalyzeFrame } from "../lib/frame-extraction";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "frame-extract-test-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function frames(count = 6): AnalyzeFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    seconds: index,
    timestamp: `00:0${index}`,
    dataUrl: `data:image/jpeg;base64,F${index}`,
  }));
}

function sandbox(input: AnalyzeFrame[] = frames()) {
  return new Sandbox({
    workspace,
    tools: [createFrameExtractTool(input, { locale: "zh" })],
    mode: "off",
  });
}

describe("frame.extract", () => {
  it("按时间点匹配最近的帧，并把图片作为附件返回", async () => {
    const result = await sandbox().run("frame.extract", {
      timestamps: ["00:02", "00:04"],
    });

    expect(result.ok).toBe(true);
    expect((result.data as { frames: unknown[] }).frames).toHaveLength(2);
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments?.[0]?.atSec).toBe(2);
    expect((result.data as { attachments?: unknown }).attachments).toBeUndefined();
  });

  it("按时间窗口取帧，并遵守 limit", async () => {
    const result = await sandbox().run("frame.extract", {
      fromSec: 1,
      toSec: 5,
      limit: 2,
    });

    expect(result.ok).toBe(true);
    expect((result.data as { frames: Array<{ atSec: number }> }).frames).toEqual([
      { atSec: 1, timestamp: "00:01" },
      { atSec: 2, timestamp: "00:02" },
    ]);
    expect(result.attachments).toHaveLength(2);
  });

  it("没有匹配的帧时返回空结果而不是报错", async () => {
    const result = await sandbox().run("frame.extract", {
      timestamps: ["09:00"],
    });

    expect(result.ok).toBe(true);
    expect((result.data as { frames: unknown[] }).frames).toHaveLength(0);
    expect(result.attachments).toBeUndefined();
  });
});
