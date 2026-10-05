import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_GEMINI_MODEL } from "@lib/analyze-prompt";
import type { SettingsSnapshot } from "@shared/ipc";

export type StoredSettings = {
  geminiApiKey?: string;
  geminiModel?: string;
};

/** 只展示首尾各 4 位，避免截图/日志泄露完整 Key */
export function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

/**
 * 桌面端设置：Gemini API Key 与模型。
 * 环境变量优先级最高，方便 CI / 高级用户覆盖。
 */
export class SettingsStore {
  private data: StoredSettings = {};
  private loaded = false;
  /**
   * 构造时对进程环境做快照。
   * `applyToEnv` 会把用户设置写回 process.env（供仓库根目录 lib 复用），
   * 若不快照，写回的 Key 会被误判成「环境变量来源」，导致清除后仍然生效。
   */
  private readonly envSnapshot: NodeJS.ProcessEnv;

  constructor(
    private readonly filePath: string,
    env: NodeJS.ProcessEnv = process.env
  ) {
    this.envSnapshot = { ...env };
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as StoredSettings;
      if (parsed && typeof parsed === "object") {
        this.data = {
          geminiApiKey:
            typeof parsed.geminiApiKey === "string"
              ? parsed.geminiApiKey.trim()
              : undefined,
          geminiModel:
            typeof parsed.geminiModel === "string"
              ? parsed.geminiModel.trim()
              : undefined,
        };
      }
    } catch {
      this.data = {};
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      `${JSON.stringify(this.data, null, 2)}\n`,
      "utf-8"
    );
  }

  private envApiKey(): string {
    return (this.envSnapshot.GEMINI_API_KEY ?? "").trim();
  }

  private envModel(): string {
    return (this.envSnapshot.GEMINI_MODEL ?? "").trim();
  }

  /** 生效的 API Key（环境变量 > 用户设置） */
  apiKey(): string {
    return this.envApiKey() || (this.data.geminiApiKey ?? "").trim();
  }

  model(): string {
    return this.envModel() || (this.data.geminiModel ?? "").trim() || DEFAULT_GEMINI_MODEL;
  }

  snapshot(): SettingsSnapshot {
    const apiKey = this.apiKey();
    return {
      hasApiKey: apiKey.length > 0,
      maskedApiKey: maskApiKey(apiKey),
      model: this.model(),
      defaultModel: DEFAULT_GEMINI_MODEL,
      fromEnv: this.envApiKey().length > 0,
    };
  }

  async setApiKey(apiKey: string): Promise<SettingsSnapshot> {
    const trimmed = apiKey.trim();
    this.data.geminiApiKey = trimmed || undefined;
    await this.persist();
    return this.snapshot();
  }

  async setModel(model: string): Promise<SettingsSnapshot> {
    const trimmed = model.trim();
    this.data.geminiModel = trimmed || undefined;
    await this.persist();
    return this.snapshot();
  }

  /**
   * 把配置写回 process.env，
   * 这样复用仓库根目录 lib/ 的 Gemini 代码无需感知桌面端设置来源。
   */
  applyToEnv(target: NodeJS.ProcessEnv = process.env): void {
    const apiKey = this.apiKey();
    if (apiKey) target.GEMINI_API_KEY = apiKey;
    else delete target.GEMINI_API_KEY;
    target.GEMINI_MODEL = this.model();
  }
}
