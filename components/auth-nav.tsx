"use client";

import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import type { UiLocale } from "@/lib/strings";
import { STRINGS } from "@/lib/strings";

type Props = {
  uiLocale: UiLocale;
  compact?: boolean;
};

export function AuthNav({ uiLocale, compact = false }: Props) {
  const t = STRINGS[uiLocale];
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <span className="crux-mono text-[10px] text-[var(--crux-text-muted)]">
        …
      </span>
    );
  }

  if (user) {
    const label =
      user.displayName?.trim() ||
      user.email.split("@")[0] ||
      (uiLocale === "zh" ? "账户" : "Account");
    return (
      <div className={`flex items-center gap-2 ${compact ? "" : "flex-wrap"}`}>
        <span
          className="max-w-[8rem] truncate text-xs font-extrabold text-[var(--crux-accent)]"
          title={user.email}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          className="crux-mono border-2 border-[var(--crux-border-subtle)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--crux-text-muted)] transition hover:border-[var(--crux-accent)] hover:text-[var(--crux-accent)]"
        >
          {t.authLogout}
        </button>
      </div>
    );
  }

  const linkClass =
    "crux-mono border-2 border-transparent px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--crux-text-muted)] transition hover:border-[var(--crux-accent)] hover:text-[var(--crux-accent)]";

  return (
    <div className="flex items-center gap-1">
      <Link href="/auth/login" className={linkClass}>
        {t.authLogin}
      </Link>
      <Link
        href="/auth/register"
        className={`crux-mono border-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
          compact
            ? "border-[var(--crux-accent)] bg-[var(--crux-accent)] text-[var(--crux-on-accent)]"
            : "border-[var(--crux-border)] bg-[var(--crux-accent)] text-[var(--crux-on-accent)] shadow-[2px_2px_0_var(--crux-border)]"
        }`}
      >
        {t.authRegister}
      </Link>
    </div>
  );
}
