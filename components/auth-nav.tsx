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
    return <span className="mono">…</span>;
  }

  if (user) {
    const label =
      user.displayName?.trim() ||
      user.email.split("@")[0] ||
      (uiLocale === "zh" ? "账户" : "Account");
    return (
      <div className="flex items-center gap-2">
        <span
          className="max-w-[7rem] truncate text-xs font-extrabold text-[var(--crux-text)]"
          title={user.email}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          className="btn btn--sm"
        >
          {t.authLogout}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/auth/login"
        className="text-[0.8125rem] font-semibold text-[var(--crux-text-secondary)] transition hover:text-[var(--crux-text)]"
      >
        {t.authLogin}
      </Link>
      <Link
        href="/auth/register"
        className={`btn ${compact ? "btn--sm" : ""}`}
      >
        {t.authRegister}
      </Link>
    </div>
  );
}
