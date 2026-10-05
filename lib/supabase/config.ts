/**
 * Supabase 环境变量读取。
 * 同时兼容 NEXT_PUBLIC_ 前缀（Supabase / Vercel 集成默认注入）与无前缀写法。
 */

export function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    undefined
  );
}

/** service_role 密钥：仅服务端可用，务必不要加 NEXT_PUBLIC_ 前缀 */
export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

/** 服务端能否用 service_role 读写数据库（当前项目的主路径） */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/** 是否配置了任意一套 Supabase 凭据 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    getSupabaseUrl() && (getSupabaseServiceRoleKey() || getSupabaseAnonKey())
  );
}
