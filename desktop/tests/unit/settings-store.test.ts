// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SettingsStore, maskApiKey } from "../../electron/settings-store";
import { DEFAULT_GEMINI_MODEL } from "@lib/analyze-prompt";

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
  it("默认使用内置模型且无 Key", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    const snapshot = store.snapshot();
    expect(snapshot.hasApiKey).toBe(false);
    expect(snapshot.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(snapshot.fromEnv).toBe(false);
    expect(store.apiKey()).toBe("");
  });

  it("保存 Key 与模型并持久化", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    await store.setApiKey("  AIza-test-key-123456  ");
    await store.setModel("gemini-2.5-pro");

    const reopened = new SettingsStore(file, {});
    await reopened.load();
    expect(reopened.apiKey()).toBe("AIza-test-key-123456");
    expect(reopened.model()).toBe("gemini-2.5-pro");
    expect(reopened.snapshot().maskedApiKey).toBe(
      maskApiKey("AIza-test-key-123456")
    );
  });

  it("环境变量优先于本地设置", async () => {
    const store = new SettingsStore(file, { GEMINI_API_KEY: "env-key-1234567890" });
    await store.load();
    await store.setApiKey("local-key");
    expect(store.apiKey()).toBe("env-key-1234567890");
    expect(store.snapshot().fromEnv).toBe(true);
  });

  it("清空 Key 后 hasApiKey 为 false", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    await store.setApiKey("AIza-abc");
    expect(store.snapshot().hasApiKey).toBe(true);
    await store.setApiKey("   ");
    expect(store.snapshot().hasApiKey).toBe(false);
  });

  it("applyToEnv 写入 process.env 供仓库根目录 lib 复用", async () => {
    const store = new SettingsStore(file, {});
    await store.load();
    await store.setApiKey("AIza-xyz");
    await store.setModel("gemini-2.5-flash");

    const target: NodeJS.ProcessEnv = {};
    store.applyToEnv(target);
    expect(target.GEMINI_API_KEY).toBe("AIza-xyz");
    expect(target.GEMINI_MODEL).toBe("gemini-2.5-flash");

    await store.setApiKey("");
    store.applyToEnv(target);
    expect(target.GEMINI_API_KEY).toBeUndefined();
  });

  it("applyToEnv 不会污染自身环境兜底：清除后应真正失效", async () => {
    const env: NodeJS.ProcessEnv = {};
    const store = new SettingsStore(file, env);
    await store.load();

    await store.setApiKey("AIza-abc");
    store.applyToEnv(env);
    expect(store.snapshot().hasApiKey).toBe(true);

    await store.setApiKey("");
    expect(store.apiKey()).toBe("");
    expect(store.snapshot().hasApiKey).toBe(false);
  });
});
