"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_STORAGE_KEY, applyTheme, readTheme, type Theme } from "./theme";

export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const t = readTheme();
    setThemeState(t);
    applyTheme(t);
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const next = readTheme();
        setThemeState(next);
        applyTheme(next);
      }
    };
    const onCustom = () => {
      const next = readTheme();
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("crux-theme", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("crux-theme", onCustom);
    };
  }, []);

  const setTheme = useCallback((t: Theme) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
    applyTheme(t);
    setThemeState(t);
    window.dispatchEvent(new Event("crux-theme"));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  return [theme, setTheme, toggle];
}
