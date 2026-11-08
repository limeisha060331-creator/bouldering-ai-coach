import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "./config";

export type AuthUser = {
  id: string;
  email: string | null;
};

/**
 * 从 Authorization: Bearer <access_token> 校验 Supabase 会话。
 * 只用于 Route Handler；不要在客户端调用。
 */
export async function getUserFromRequest(
  request: Request
): Promise<AuthUser | null> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey() ?? getSupabaseServiceRoleKey();
  if (!url || !anonKey) return null;

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  if (!token) return null;

  try {
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
