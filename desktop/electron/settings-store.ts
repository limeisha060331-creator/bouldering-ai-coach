import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_GEMINI_MODEL } from "@lib/analyze-prompt";
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_PROVIDER,
  PROVIDERS,
  PROVIDER_CAPABILITIES,
  isAnalysisProvider,
  type AnalysisProvider,
} from "@shared/providers";
import type { ProviderSettings, SettingsSnapshot } from "@shared/ipc";

export type StoredSettings = {
  provider?: AnalysisProvider;
  deepseekApiKey?: string;
  deepseekModel?: string;
  /** 与旧版本字段同名，可直接复用历史配置 */
  geminiApiKey?: string;
  geminiModel?: string;
};

const ENV_KEYS: Record<AnalysisProvider, { apiKey: string; model: string }> = {
  deepseek: { apiKey: "DEEPSEEK_API_KEY", model: "DEEPSEEK_MODEL" },
  gemini: { apiKey: "GEMINI_API_KEY", model: "GEMINI_MODEL" },
};

const DEFAULT_MODELS: Record<AnalysisProvider, string> = {
  deepseek: DEFAULT_DEEPSEEK_MODEL,
  gemini: DEFAULT_GEMINI_MODEL,
};

const KEY_FIELDS: Record<
  AnalysisProvider,
  "deepseekApiKey" | "geminiApiKey"
> = {
  deepseek: "deepseekApiKey",
  gemini: "geminiApiKey",
};

const MODEL_FIELDS: Record<
  AnalysisProvider,
  "deepseekModel" | "geminiModel"
> = {
  deepseek: "deepseekModel",
  gemini: "geminiModel",
};

/** 只展示首尾各 4 位，避免截图/日志泄露完整 Key */
export function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

/**
 * 桌面端设置：分析后端（DeepSeek / Gemini）与各自的 API Key、模型。
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
          provider: isAnalysisProvider(parsed.provider)
            ? parsed.provider
            : undefined,
          deepseekApiKey: this.readString(parsed.deepseekApiKey),
          deepseekModel: this.readString(parsed.deepseekModel),
          geminiApiKey: this.readString(parsed.geminiApiKey),
          geminiModel: this.readString(parsed.geminiModel),
        };
      }
    } catch {
      this.data = {};
    }
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      `${JSON.stringify(this.data, null, 2)}\n`,
      "utf-8"
    );
  }

  private envValue(
    provider: AnalysisProvider,
    kind: "apiKey" | "model"
  ): string {
    return (this.envSnapshot[ENV_KEYS[provider][kind]] ?? "").trim();
  }

  provider(): AnalysisProvider {
    const stored = this.data.provider;
    if (stored && isAnalysisProvider(stored)) return stored;
    // 未显式选择时：环境变量只配了某一个后端，就跟随它
    for (const candidate of PROVIDERS) {
      if (this.envValue(candidate, "apiKey")) return candidate;
    }
    return DEFAULT_PROVIDER;
  }

  apiKey(provider: AnalysisProvider = this.provider()): string {
    return (
      this.envValue(provider, "apiKey") ||
      (this.data[KEY_FIELDS[provider]] as string | undefined)?.trim() ||
      ""
    );
  }

  model(provider: AnalysisProvider = this.provider()): string {
    return (
      this.envValue(provider, "model") ||
      (this.data[MODEL_FIELDS[provider]] as string | undefined)?.trim() ||
      DEFAULT_MODELS[provider]
    );
  }

  providerSettings(provider: AnalysisProvider): ProviderSettings {
    const apiKey = this.apiKey(provider);
    const capability = PROVIDER_CAPABILITIES[provider];
    return {
      hasApiKey: apiKey.length > 0,
      maskedApiKey: maskApiKey(apiKey),
      model: this.model(provider),
      defaultModel: DEFAULT_MODELS[provider],
      fromEnv: this.envValue(provider, "apiKey").length > 0,
      needsFrames: capability.needsFrames,
      supportsVideo: capability.supportsVideo,
      label: capability.label,
      homepage: capability.homepage,
    };
  }

  snapshot(): SettingsSnapshot {
    const providers = {} as Record<AnalysisProvider, ProviderSettings>;
    for (const provider of PROVIDERS) {
      providers[provider] = this.providerSettings(provider);
    }
    const active = this.provider();
    return { provider: active, active: providers[active], providers };
  }

  async setProvider(provider: AnalysisProvider): Promise<SettingsSnapshot> {
    this.data.provider = provider;
    await this.persist();
    return this.snapshot();
  }

  async setApiKey(
    provider: AnalysisProvider,
    apiKey: string
  ): Promise<SettingsSnapshot> {
    const trimmed = apiKey.trim();
    this.data[KEY_FIELDS[provider]] = trimmed || undefined;
    await this.persist();
    return this.snapshot();
  }

  async setModel(
    provider: AnalysisProvider,
    model: string
  ): Promise<SettingsSnapshot> {
    const trimmed = model.trim();
    this.data[MODEL_FIELDS[provider]] = trimmed || undefined;
    await this.persist();
    return this.snapshot();
  }

  /**
   * 把配置写回 process.env，
   * 这样复用仓库根目录 lib/ 的 Gemini 代码无需感知桌面端设置来源。
   */
  applyToEnv(target: NodeJS.ProcessEnv = process.env): void {
    for (const provider of PROVIDERS) {
      const { apiKey, model } = ENV_KEYS[provider];
      const key = this.apiKey(provider);
      if (key) target[apiKey] = key;
      else delete target[apiKey];
      target[model] = this.model(provider);
    }
  }
}
