import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ToolResult } from "./types";

export type RecordedEntry = {
  tool: string;
  argsHash: string;
  result: ToolResult;
};

type RecorderFile = {
  version: 1;
  entries: Record<string, RecordedEntry>;
};

/**
 * 工具结果的录制与回放。
 * 没有它，今天 82 分、明天 76 分，你分不清是模型变了还是搜索结果变了。
 */
export class ToolRecorder {
  private readonly entries = new Map<string, RecordedEntry>();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as RecorderFile;
      if (parsed.version !== 1 || !parsed.entries) return;
      for (const [key, entry] of Object.entries(parsed.entries)) {
        this.entries.set(key, entry);
      }
    } catch {
      // 首次运行、文件损坏都从空录制开始
    }
  }

  get(key: string): RecordedEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: RecordedEntry): Promise<void> {
    // 图片附件是 base64，写进录制文件会让它膨胀几十倍；
    // 回放只保证数据与 trace 一致，附件按需重新执行工具生成。
    const result = entry.result.attachments
      ? { ...entry.result, attachments: undefined }
      : entry.result;
    this.entries.set(key, { ...entry, result });
    this.writeChain = this.writeChain.then(() => this.flush());
    return this.writeChain;
  }

  size(): number {
    return this.entries.size;
  }

  private async flush(): Promise<void> {
    const entries: Record<string, RecordedEntry> = {};
    for (const [key, entry] of this.entries) {
      entries[key] = entry;
    }
    const payload: RecorderFile = { version: 1, entries };

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}
