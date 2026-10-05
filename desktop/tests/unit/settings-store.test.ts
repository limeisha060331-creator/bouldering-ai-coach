// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SettingsStore, maskApiKey } from "../../electron/settings-store";
import { DEFAULT_GEMINI_MODEL } from "@lib/analyze-prompt";
import { DEFAULT_DEEPSEEK_MODEL } from "@shared/providers";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "crux-settings-"));
  file = path.join(dir, "settings.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("maskApiKey", () => {
  it("保留首尾各 4 位", () => {
    const key = "AIzaSyD1234567890abcdef";
    expect(maskApiKey(key)).toBe(`AIza${"•".repeat(key.length - 8)}cdef`);
    expect(maskApiKey("short")).toBe("•••••");
    expect(maskApiKey("")).toBe("");
  });
});

describe("SettingsStore", () => {
  it("默认使用 DeepSeek，且两个后端都没有 Key", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    const snapshot = store.snapshot();

    expect(snapshot.provider).toBe("deepseek");
    expect(snapshot.active.label).toBe("DeepSeek");
    expect(snapshot.active.hasApiKey).toBe(false);
    expect(snapshot.active.model).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(snapshot.active.needsFrames).toBe(true);
    expect(snapshot.providers.gemini.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(snapshot.providers.gemini.supportsVideo).toBe(true);
    expect(store.apiKey()).toBe("");
  });

  it("按后端分别保存 Key 与模型并持久化", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    await store.setApiKey("deepseek", "  sk-deepseek-123456  ");
    await store.setModel("deepseek", "deepseek-flash");
    await store.setApiKey("gemini", "AIza-gemini-key-123456");

    const reopened = new SettingsStore(file, {});
    await reopened.load();
    expect(reopened.apiKey("deepseek")).toBe("sk-deepseek-123456");
    expect(reopened.apiKey("gemini")).toBe("AIza-gemini-key-123456");
    expect(reopened.provider()).toBe("deepseek");
    expect(reopened.snapshot().providers.deepseek.maskedApiKey).toBe(
      maskApiKey("sk-deepseek-123456")
    );
  });

  it("切换后端只影响当前选择，不清空另一家的配置", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    await store.setApiKey("gemini", "AIza-gemini");
    await store.setProvider("gemini");
    expect(store.snapshot().provider).toBe("gemini");
    expect(store.snapshot().active.label).toBe("Google Gemini");

    await store.setProvider("deepseek");
    expect(store.apiKey("gemini")).toBe("AIza-gemini");
  });

  it("环境变量优先于本地设置，并决定默认后端", async () => {
    const store = new SettingsStore(file, {
      DEEPSEEK_API_KEY: "env-deepseek-key",
    });
    await store.load();
    await store.setApiKey("deepseek", "local-key");

    expect(store.apiKey("deepseek")).toBe("env-deepseek-key");
    expect(store.snapshot().providers.deepseek.fromEnv).toBe(true);

    const geminiOnly = new SettingsStore(file, {
      GEMINI_API_KEY: "env-gemini-key",
    });
    await geminiOnly.load();
    expect(geminiOnly.provider()).toBe("gemini");
  });

  it("清空 Key 后 hasApiKey 为 false", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    await store.setApiKey("deepseek", "sk-abc");
    expect(store.snapshot().active.hasApiKey).toBe(true);
    await store.setApiKey("deepseek", "   ");
    expect(store.snapshot().active.hasApiKey).toBe(false);
    expect(store.snapshot().active.maskedApiKey).toBe("");
  });

  it("兼容旧版 settings.json（只有 gemini 字段）", async () => {
    await writeFile(
      file,
      JSON.stringify({ geminiApiKey: "AIza-legacy", geminiModel: "gemini-2.5-flash" }),
      "utf-8"
    );
    const store = new SettingsStore(file, {});
    await store.load();
    expect(store.apiKey("gemini")).toBe("AIza-legacy");
    expect(store.provider()).toBe("deepseek");
  });

  it("applyToEnv 写入两个后端的变量，供仓库根目录 lib 复用", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    await store.setApiKey("gemini", "AIza-xyz");
    await store.setModel("gemini", "gemini-2.5-flash");
    await store.setApiKey("deepseek", "sk-xyz");

    const target: NodeJS.ProcessEnv = {};
    store.applyToEnv(target);
    expect(target.GEMINI_API_KEY).toBe("AIza-xyz");
    expect(target.GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(target.DEEPSEEK_API_KEY).toBe("sk-xyz");
    expect(target.DEEPSEEK_MODEL).toBe(DEFAULT_DEEPSEEK_MODEL);

    await store.setApiKey("gemini", "");
    store.applyToEnv(target);
    expect(target.GEMINI_API_KEY).toBeUndefined();
  });

  it("applyToEnv 不会污染自身环境兜底：清除后应真正失效", async () => {
    const env: NodeJS.ProcessEnv = {};
    const store = new SettingsStore(file, env);
    await store.load();

    await store.setApiKey("deepseek", "sk-abc");
    store.applyToEnv(env);
    expect(store.snapshot().active.hasApiKey).toBe(true);

    await store.setApiKey("deepseek", "");
    expect(store.apiKey("deepseek")).toBe("");
    expect(store.snapshot().active.hasApiKey).toBe(false);
  });
});
