"use client";

import { useCallback, useEffect, useState } from "react";
import type { UiLocale } from "./strings";
import { UI_LOCALE_STORAGE_KEY } from "./strings";

function readLocale(): UiLocale {
  if (typeof window === "undefined") return "zh";
  return window.localStorage.getItem(UI_LOCALE_STORAGE_KEY) === "en"
    ? "en"
    : "zh";
}

export function useUiLocale(): [UiLocale, (l: UiLocale) => void] {
  const [locale, setLocaleState] = useState<UiLocale>("zh");

  useEffect(() => {
    setLocaleState(readLocale());
    const onStorage = (e: StorageEvent) => {
      if (e.key === UI_LOCALE_STORAGE_KEY) {
        setLocaleState(readLocale());
      }
    };
    const onCustom = () => setLocaleState(readLocale());
    window.addEventListener("storage", onStorage);
    window.addEventListener("bouldering-locale", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("bouldering-locale", onCustom);
    };
  }, []);

  const setLocale = useCallback((l: UiLocale) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, l);
    setLocaleState(l);
    window.dispatchEvent(new Event("bouldering-locale"));
  }, []);

  return [locale, setLocale];
}
