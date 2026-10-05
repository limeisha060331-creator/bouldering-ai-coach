import { sql } from "@vercel/postgres";
import { getDatabaseUrl, isAuthConfigured } from "./auth-config";
import type { DbUser } from "./db-types";
import { isSupabaseAdminConfigured } from "./supabase/config";
import {
  findUserByEmailViaSupabase,
  findUserByIdViaSupabase,
  insertUserViaSupabase,
} from "./supabase/user-repo";

export type { DbUser } from "./db-types";

let tableReady: Promise<void> | null = null;

/** @vercel/postgres 默认只读 POSTGRES_URL；Neon 集成常只注入 DATABASE_URL */
function ensurePostgresEnv() {
  if (!process.env.POSTGRES_URL?.trim()) {
    const url = getDatabaseUrl();
    if (url) process.env.POSTGRES_URL = url;
  }
}

/** 已配置 Supabase service_role 时优先走 PostgREST（HTTPS，无需直连数据库端口） */
function isSupabaseBackend(): boolean {
  return isSupabaseAdminConfigured();
}

/**
 * 表结构由 supabase/migrations/0001_init.sql 维护。
 * PostgREST 不支持执行 DDL，因此 Supabase 模式下这里不做任何事；
 * 兼容旧部署：仍用 @vercel/postgres 直连时自动建表。
 */
export async function ensureUsersTable(): Promise<void> {
  if (isSupabaseBackend()) return;
  if (!isAuthConfigured()) return;
  ensurePostgresEnv();
  if (!tableReady) {
    tableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })();
  }
  await tableReady;
}

export async function findUserByEmail(
  email: string
): Promise<DbUser | null> {
  await ensureUsersTable();
  if (isSupabaseBackend()) return findUserByEmailViaSupabase(email);
  const { rows } = await sql<DbUser>`
    SELECT id, email, password_hash, display_name, created_at::text
    FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  await ensureUsersTable();
  if (isSupabaseBackend()) return findUserByIdViaSupabase(id);
  const { rows } = await sql<DbUser>`
    SELECT id, email, password_hash, display_name, created_at::text
    FROM users WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function insertUser(input: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
}): Promise<DbUser> {
  await ensureUsersTable();
  if (isSupabaseBackend()) return insertUserViaSupabase(input);
  const { rows } = await sql<DbUser>`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES (${input.id}, ${input.email.toLowerCase()}, ${input.passwordHash}, ${input.displayName})
    RETURNING id, email, password_hash, display_name, created_at::text
  `;
  return rows[0]!;
}
