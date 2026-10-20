"use client";

import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { CruxHeader } from "@/components/crux-header";
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
      <CruxHeader />

      <div className="mx-auto w-full max-w-[32rem] px-[clamp(1rem,3vw,3rem)] py-10">
        <h1 className="h1 !text-[2.25rem]">{t.authLoginTitle}</h1>
        <p className="lede">{t.authLoginSubtitle}</p>

        <div className="mt-7">
          <AuthForm mode="login" uiLocale={uiLocale} configured={configured} />
        </div>

        <p className="mt-6 text-sm text-[var(--crux-text-muted)]">
          {t.authNoAccount}{" "}
          <Link
            href="/auth/register"
            className="font-extrabold text-[var(--crux-text)] underline decoration-[var(--crux-accent)] decoration-2 underline-offset-4"
          >
            {t.authRegister}
          </Link>
        </p>
      </div>
    </main>
  );
}
