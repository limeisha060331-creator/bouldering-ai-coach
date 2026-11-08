import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 浏览器端 Supabase 客户端。
 * 只用 publishable / anon key，权限完全由 RLS 控制；
 * 绝不能在这里使用 SUPABASE_SERVICE_ROLE_KEY。
 */

let cached: SupabaseClient | null = null;

export function getBrowserSupabaseConfig(): {
  url?: string;
  key?: string;
  configured: boolean;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return { url, key, configured: Boolean(url && key) };
}

export function getSupabaseBrowser(): SupabaseClient {
  const { url, key } = getBrowserSupabaseConfig();
  if (!url || !key) {
    throw new Error(
      "Supabase 未配置：请在 .env.local 设置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  if (!cached) {
    cached = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { "x-application-name": "crux-bouldering-ai" } },
    });
  }
  return cached;
}
