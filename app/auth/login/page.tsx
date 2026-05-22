"use client";

import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { SiteNav } from "@/components/site-nav";
import { useAuth } from "@/lib/use-auth";
import { useUiLocale } from "@/lib/use-ui-locale";
import { STRINGS } from "@/lib/strings";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const [uiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/analyze");
  }, [loading, user, router]);

  return (
    <main className="crux-page">
      <div className="crux-container-narrow">
        <SiteNav uiLocale={uiLocale} />
        <header className="mb-8 border-2 border-[var(--crux-border)] border-l-[6px] border-l-[var(--crux-accent)] bg-[var(--crux-surface)] p-6 shadow-[4px_4px_0_var(--crux-border)]">
          <p className="spa-label mb-2">{t.brand}</p>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--crux-text)] sm:text-3xl">
            {t.authLoginTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--crux-text-muted)]">
            {t.authLoginSubtitle}
          </p>
        </header>

        <AuthForm mode="login" uiLocale={uiLocale} configured={configured} />

        <p className="mt-6 text-center text-sm text-[var(--crux-text-muted)]">
          {t.authNoAccount}{" "}
          <Link
            href="/auth/register"
            className="font-bold text-[var(--crux-accent)] hover:underline"
          >
            {t.authRegister}
          </Link>
        </p>
      </div>
    </main>
  );
}
