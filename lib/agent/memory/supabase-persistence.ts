import { getSupabaseAdmin } from "../../supabase/admin";
import type { MemoryFile, MemoryPersistence } from "./store";

/**
 * 网页端记忆持久化：users 表用项目自建账户，service_role 绕过 RLS，
 * 所以这里必须显式按 userId 读写，不能把 userId 交给客户端。
 */
export function createSupabaseMemoryPersistence(
  userId: string
): MemoryPersistence {
  return {
    async read() {
      const { data, error } = await getSupabaseAdmin()
        .from("agent_memory")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return null;
      const raw = (data as { data?: unknown } | null)?.data;
      if (!raw || typeof raw !== "object") return null;
      const parsed = raw as MemoryFile;
      return parsed.version === 1 ? parsed : null;
    },

    async write(data) {
      const { error } = await getSupabaseAdmin()
        .from("agent_memory")
        .upsert(
          {
            user_id: userId,
            data,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (error) throw new Error(error.message);
    },
  };
}
