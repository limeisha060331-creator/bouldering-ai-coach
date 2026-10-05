import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth-form";
import { SiteNav } from "@/components/site-nav";
import { useAuth } from "@/lib/use-auth";
import { useUiLocale } from "@/lib/use-ui-locale";
import { STRINGS } from "@lib/strings";

export function LoginPage() {
  const [uiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];
  const { user, loading, configured } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/analyze", { replace: true });
  }, [loading, user, navigate]);

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
            to="/auth/register"
            className="font-bold text-[var(--crux-accent)] hover:underline"
          >
            {t.authRegister}
          </Link>
        </p>
      </div>
    </main>
  );
}
