// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AuthStore,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} from "../../electron/auth-store";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "crux-auth-"));
  file = path.join(dir, "accounts.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("auth-store helpers", () => {
  it("邮箱标准化与校验", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(isValidEmail("foo@bar.com")).toBe(true);
    expect(isValidEmail("foo@bar")).toBe(false);
  });

  it("scrypt 哈希可校验且不可逆推", async () => {
    const hash = await hashPassword("supersecret");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("supersecret", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("supersecret", "garbage")).toBe(false);
  });
});

describe("AuthStore", () => {
  it("注册后自动登录，会话可跨实例恢复", async () => {
    const store = new AuthStore(file);
    await store.load();

    const result = await store.register({
      email: "Climber@Example.com",
      password: "password123",
      displayName: "小岩",
    });
    expect(result.ok).toBe(true);
    expect(store.current()?.email).toBe("climber@example.com");
    expect(store.current()?.displayName).toBe("小岩");

    const reopened = new AuthStore(file);
    await reopened.load();
    expect(reopened.current()?.email).toBe("climber@example.com");
  });

  it("拒绝重复邮箱与弱密码", async () => {
    const store = new AuthStore(file);
    await store.load();
    await store.register({ email: "a@b.com", password: "password123" });

    const duplicate = await store.register({
      email: "A@B.com",
      password: "password123",
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.ok === false && duplicate.error).toContain("已注册");

    const weak = await store.register({ email: "c@d.com", password: "123" });
    expect(weak.ok).toBe(false);

    const bad = await store.register({ email: "not-an-email", password: "password123" });
    expect(bad.ok).toBe(false);
  });

  it("登录校验密码，退出后清空会话", async () => {
    const store = new AuthStore(file);
    await store.load();
    await store.register({ email: "a@b.com", password: "password123" });
    await store.logout();
    expect(store.current()).toBeNull();

    const wrong = await store.login({ email: "a@b.com", password: "nope12345" });
    expect(wrong.ok).toBe(false);

    const unknown = await store.login({ email: "z@b.com", password: "password123" });
    expect(unknown.ok).toBe(false);

    const ok = await store.login({ email: "A@B.com", password: "password123" });
    expect(ok.ok).toBe(true);
    expect(store.current()?.email).toBe("a@b.com");
  });

  it("文件损坏时回退为空账户表", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{ not json", "utf-8");
    const store = new AuthStore(file);
    await store.load();
    expect(store.current()).toBeNull();
    const result = await store.register({ email: "x@y.com", password: "password123" });
    expect(result.ok).toBe(true);
  });
});
