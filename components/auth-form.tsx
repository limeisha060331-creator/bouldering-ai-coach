"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PulseButton } from "@/components/pulse-button";
import { notifyAuthChange } from "@/lib/use-auth";
import type { UiLocale } from "@/lib/strings";
import { STRINGS } from "@/lib/strings";

type Mode = "register" | "login";

type Props = {
  mode: Mode;
  uiLocale: UiLocale;
  configured: boolean;
};

export function AuthForm({ mode, uiLocale, configured }: Props) {
  const router = useRouter();
  const t = STRINGS[uiLocale];
  const isRegister = mode === "register";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(
        isRegister ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isRegister
              ? { email, password, displayName: displayName || undefined }
              : { email, password }
          ),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? t.authGenericError);
        return;
      }
      notifyAuthChange();
      router.push("/analyze");
      router.refresh();
    } catch {
      setError(t.authGenericError);
    } finally {
      setLoading(false);
    }
  }

  if (!configured) {
    return (
      <div className="spa-panel border-[var(--crux-accent)] p-6">
        <p className="text-sm font-bold text-[var(--crux-text)]">
          {t.authNotConfiguredTitle}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--crux-text-muted)]">
          {t.authNotConfiguredBody}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="spa-panel p-6 sm:p-8">
      <div className="space-y-4">
        {isRegister && (
          <div>
            <label className="spa-label mb-2 block">{t.authDisplayName}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              placeholder={t.authDisplayNamePlaceholder}
              className="w-full border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-3 py-2 text-sm"
            />
          </div>
        )}
        <div>
          <label className="spa-label mb-2 block">{t.authEmail}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="spa-label mb-2 block">{t.authPassword}</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="w-full border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-3 py-2 text-sm"
          />
          {isRegister && (
            <p className="mt-1 text-[10px] text-[var(--crux-text-muted)]">
              {t.authPasswordHint}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border-2 border-[var(--crux-border)] bg-[var(--crux-elevated)] px-3 py-2 text-sm text-[var(--crux-text-secondary)]"
        >
          {error}
        </p>
      )}

      <div className="mt-6">
        <PulseButton type="submit" loading={loading} disabled={loading}>
          {isRegister ? t.authRegisterSubmit : t.authLoginSubmit}
        </PulseButton>
      </div>
    </form>
  );
}
