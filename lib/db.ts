import { sql } from "@vercel/postgres";
import { getDatabaseUrl, isAuthConfigured } from "./auth-config";

let tableReady: Promise<void> | null = null;

/** @vercel/postgres 默认只读 POSTGRES_URL；Neon 集成常只注入 DATABASE_URL */
function ensurePostgresEnv() {
  if (!process.env.POSTGRES_URL?.trim()) {
    const url = getDatabaseUrl();
    if (url) process.env.POSTGRES_URL = url;
  }
}

export async function ensureUsersTable(): Promise<void> {
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

export type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
};

export async function findUserByEmail(
  email: string
): Promise<DbUser | null> {
  await ensureUsersTable();
  const { rows } = await sql<DbUser>`
    SELECT id, email, password_hash, display_name, created_at::text
    FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  await ensureUsersTable();
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
  const { rows } = await sql<DbUser>`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES (${input.id}, ${input.email.toLowerCase()}, ${input.passwordHash}, ${input.displayName})
    RETURNING id, email, password_hash, display_name, created_at::text
  `;
  return rows[0]!;
}
