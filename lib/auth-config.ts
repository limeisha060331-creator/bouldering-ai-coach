export const SESSION_COOKIE = "crux_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** Neon / Supabase 等集成可能注入 DATABASE_URL 而非 POSTGRES_URL */
export function getDatabaseUrl(): string | undefined {
  return (
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim()
  );
}

export function isAuthConfigured(): boolean {
  return Boolean(getDatabaseUrl() && process.env.AUTH_SECRET?.trim());
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET 未配置或长度不足（至少 16 字符）");
  }
  return secret;
}
