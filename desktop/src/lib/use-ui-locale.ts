import { useCallback, useEffect, useState } from "react";
import type { UiLocale } from "@lib/strings";
import { UI_LOCALE_STORAGE_KEY } from "@lib/strings";

function readLocale(): UiLocale {
  if (typeof window === "undefined") return "zh";
  return window.localStorage.getItem(UI_LOCALE_STORAGE_KEY) === "en"
    ? "en"
    : "zh";
}

export function useUiLocale(): [UiLocale, (locale: UiLocale) => void] {
  const [locale, setLocaleState] = useState<UiLocale>("zh");

  useEffect(() => {
    setLocaleState(readLocale());
    const sync = () => setLocaleState(readLocale());
    window.addEventListener("storage", sync);
    window.addEventListener("bouldering-locale", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("bouldering-locale", sync);
    };
  }, []);

  const setLocale = useCallback((next: UiLocale) => {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, next);
    setLocaleState(next);
    window.dispatchEvent(new Event("bouldering-locale"));
  }, []);

  return [locale, setLocale];
}
