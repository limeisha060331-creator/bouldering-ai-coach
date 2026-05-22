import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  getAuthSecret,
  isAuthConfigured,
} from "./auth-config";
import { findUserByEmail, findUserById, insertUser } from "./db";
import type { PublicUser } from "./auth-types";

export type { PublicUser } from "./auth-types";

const BCRYPT_ROUNDS = 10;

function toPublicUser(u: {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    createdAt: u.created_at,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function signSessionToken(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(getAuthSecret());
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secret);
}

export async function setSessionCookie(userId: string, email: string) {
  const token = await signSessionToken(userId, email);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<PublicUser | null> {
  if (!isAuthConfigured()) return null;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(getAuthSecret());
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.sub;
    if (!userId) return null;
    const user = await findUserById(userId);
    if (!user) return null;
    return toPublicUser(user);
  } catch {
    return null;
  }
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  if (!isAuthConfigured()) {
    return { error: "账户服务未配置，请联系管理员" };
  }

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { error: "请输入有效的邮箱地址" };
  }
  if (input.password.length < 8) {
    return { error: "密码至少 8 位" };
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return { error: "该邮箱已注册，请直接登录" };
  }

  const displayName = input.displayName?.trim() || null;
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);

  try {
    const row = await insertUser({
      id,
      email,
      passwordHash,
      displayName,
    });
    await setSessionCookie(row.id, row.email);
    return { user: toPublicUser(row) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { error: "该邮箱已注册" };
    }
    throw e;
  }
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  if (!isAuthConfigured()) {
    return { error: "账户服务未配置，请联系管理员" };
  }

  const email = normalizeEmail(input.email);
  const user = await findUserByEmail(email);
  if (!user) {
    return { error: "邮箱或密码不正确" };
  }

  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) {
    return { error: "邮箱或密码不正确" };
  }

  await setSessionCookie(user.id, user.email);
  return { user: toPublicUser(user) };
}
