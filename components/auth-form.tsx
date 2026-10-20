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
      <div className="panel relative p-6">
        <span
          className="tape-mark"
          style={{ background: "var(--crux-accent)" }}
          aria-hidden
        />
        <p className="text-sm font-extrabold text-[var(--crux-text)]">
          {t.authNotConfiguredTitle}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--crux-text-muted)]">
          {t.authNotConfiguredBody}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel relative">
      <span
        className="tape-mark"
        style={{ background: "var(--tape-yellow)" }}
        aria-hidden
      />
      <div className="space-y-4 p-6">
        {isRegister && (
          <div>
            <label htmlFor="auth-name" className="field-label">
              {t.authDisplayName}
            </label>
            <input
              id="auth-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              placeholder={t.authDisplayNamePlaceholder}
              className="input font-normal"
            />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className="field-label">
            {t.authEmail}
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="input font-normal"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="field-label">
            {t.authPassword}
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="input font-normal"
          />
          {isRegister && <p className="field-hint">{t.authPasswordHint}</p>}
        </div>

        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}

        <div className="pt-2">
          <PulseButton type="submit" loading={loading} disabled={loading}>
            {isRegister ? t.authRegisterSubmit : t.authLoginSubmit}
          </PulseButton>
        </div>
      </div>
    </form>
  );
}
