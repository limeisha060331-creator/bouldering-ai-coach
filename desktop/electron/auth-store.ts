import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AuthResult, PublicUser } from "@shared/ipc";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

type StoredUser = {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string;
  createdAt: string;
};

type AccountsFile = {
  users: StoredUser[];
  sessionUserId: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

/**
 * 桌面端本地账户：账号与会话都保存在 userData 下的单个 JSON 文件里。
 * 不再依赖 Postgres / JWT，也不需要联网即可注册登录。
 */
export class AuthStore {
  private data: AccountsFile = { users: [], sessionUserId: null };
  private loaded = false;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AccountsFile>;
      this.data = {
        users: Array.isArray(parsed.users) ? (parsed.users as StoredUser[]) : [],
        sessionUserId:
          typeof parsed.sessionUserId === "string" ? parsed.sessionUserId : null,
      };
    } catch {
      this.data = { users: [], sessionUserId: null };
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

  private findByEmail(email: string): StoredUser | undefined {
    return this.data.users.find((u) => u.email === email);
  }

  private findById(id: string): StoredUser | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResult<PublicUser>> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return { ok: false, error: "请输入有效的邮箱地址" };
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: "密码至少 8 位" };
    }
    if (this.findByEmail(email)) {
      return { ok: false, error: "该邮箱已注册，请直接登录" };
    }

    const user: StoredUser = {
      id: randomUUID(),
      email,
      displayName: input.displayName?.trim() || null,
      passwordHash: await hashPassword(input.password),
      createdAt: new Date().toISOString(),
    };

    this.data.users.push(user);
    this.data.sessionUserId = user.id;
    await this.persist();
    return { ok: true, data: toPublicUser(user) };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<AuthResult<PublicUser>> {
    const email = normalizeEmail(input.email);
    const user = this.findByEmail(email);
    if (!user) {
      return { ok: false, error: "邮箱或密码不正确" };
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      return { ok: false, error: "邮箱或密码不正确" };
    }
    this.data.sessionUserId = user.id;
    await this.persist();
    return { ok: true, data: toPublicUser(user) };
  }

  async logout(): Promise<void> {
    this.data.sessionUserId = null;
    await this.persist();
  }

  current(): PublicUser | null {
    if (!this.data.sessionUserId) return null;
    const user = this.findById(this.data.sessionUserId);
    return user ? toPublicUser(user) : null;
  }
}
