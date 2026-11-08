"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { PublicUser } from "./auth-types";
import {
  getBrowserSupabaseConfig,
  getSupabaseBrowser,
} from "./supabase/browser";
import { invalidateAnalysisCache } from "./analysis-store";

function toPublicUser(user: User): PublicUser {
  const displayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null;
  return {
    id: user.id,
    email: user.email ?? "",
    displayName,
    createdAt: user.created_at,
  };
}

export function useAuth(): {
  user: PublicUser | null;
  loading: boolean;
  configured: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(
    () => getBrowserSupabaseConfig().configured
  );
  const [configured] = useState(() => getBrowserSupabaseConfig().configured);

  const refresh = useCallback(async () => {
    if (!getBrowserSupabaseConfig().configured) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        const { data: local } = await supabase.auth.getSession();
        setUser(local.session?.user ? toPublicUser(local.session.user) : null);
      } else {
        setUser(data.user ? toPublicUser(data.user) : null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    // 会话校验是异步的；这里只是发起请求，setState 发生在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const onAuth = () => void refresh();
    window.addEventListener("crux-auth", onAuth);
    const { data } = getSupabaseBrowser().auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          invalidateAnalysisCache();
        }
        setUser(session?.user ? toPublicUser(session.user) : null);
        setLoading(false);
      }
    );
    return () => {
      window.removeEventListener("crux-auth", onAuth);
      data.subscription.unsubscribe();
    };
  }, [configured, refresh]);

  const logout = useCallback(async () => {
    if (!getBrowserSupabaseConfig().configured) return;
    await getSupabaseBrowser().auth.signOut();
    invalidateAnalysisCache();
    setUser(null);
    window.dispatchEvent(new Event("crux-auth"));
  }, []);

  return { user, loading, configured, refresh, logout };
}

export function notifyAuthChange() {
  window.dispatchEvent(new Event("crux-auth"));
}
