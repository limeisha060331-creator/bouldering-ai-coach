import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { stableStringify } from "../sandbox/stable-json";
import type { ContextBundle, SessionState } from "./types";

export type Checkpoint = {
  runId: string;
  step: number;
  at: string;
  stateDigest: string;
  contextDigest: string;
  state: SessionState;
  context: ContextBundle;
};

export function digestObject(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("hex")
    .slice(0, 16);
}

/**
 * 每步落一个 JSONL 检查点：崩溃能续跑，回放能对齐。
 */
export class CheckpointStore {
  constructor(private readonly filePath: string) {}

  async save(checkpoint: Checkpoint): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(checkpoint)}\n`, "utf8");
  }

  async list(runId: string): Promise<Checkpoint[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Checkpoint)
        .filter((item) => item.runId === runId)
        .sort((a, b) => a.step - b.step);
    } catch {
      return [];
    }
  }

  async latest(runId: string): Promise<Checkpoint | null> {
    const all = await this.list(runId);
    return all.length > 0 ? all[all.length - 1] : null;
  }
}
