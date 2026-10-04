import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "@shared/ipc";

export function notifyAuthChange(): void {
  window.dispatchEvent(new Event("crux-auth"));
}

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
      const data = await window.crux.auth.me();
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
    await window.crux.auth.logout();
    setUser(null);
    notifyAuthChange();
  }, []);

  return { user, loading, configured, refresh, logout };
}
