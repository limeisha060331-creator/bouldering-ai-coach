import { useCallback, useEffect, useState } from "react";
import { THEME_STORAGE_KEY, applyTheme, readTheme, type Theme } from "@lib/theme";

export function useTheme(): [Theme, (theme: Theme) => void, () => void] {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const initial = readTheme();
    setThemeState(initial);
    applyTheme(initial);

    const sync = () => {
      const next = readTheme();
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener("storage", sync);
    window.addEventListener("crux-theme", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("crux-theme", sync);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    setThemeState(next);
    window.dispatchEvent(new Event("crux-theme"));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  return [theme, setTheme, toggle];
}
