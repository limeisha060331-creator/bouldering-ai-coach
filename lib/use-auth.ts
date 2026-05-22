"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "./auth-types";

export function useAuth(): {
  user: PublicUser | null;
  loading: boolean;
  configured: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as {
        user: PublicUser | null;
        configured?: boolean;
      };
      setConfigured(data.configured !== false);
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAuth = () => void refresh();
    window.addEventListener("crux-auth", onAuth);
    return () => window.removeEventListener("crux-auth", onAuth);
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.dispatchEvent(new Event("crux-auth"));
  }, []);

  return { user, loading, configured, refresh, logout };
}

export function notifyAuthChange() {
  window.dispatchEvent(new Event("crux-auth"));
}
