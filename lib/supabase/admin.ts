import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./config";

let cached: SupabaseClient | null = null;
let cachedFingerprint = "";

/**
 * 服务端专用 Supabase 客户端（service_role，绕过 RLS）。
 * 只能在 Route Handler / Server Component 里调用，切勿打进浏览器代码。
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      "Supabase 未配置：请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const fingerprint = `${url}::${key.slice(-8)}`;
  if (!cached || fingerprint !== cachedFingerprint) {
    cached = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { "x-application-name": "crux-bouldering-ai" } },
    });
    cachedFingerprint = fingerprint;
  }
  return cached;
}
