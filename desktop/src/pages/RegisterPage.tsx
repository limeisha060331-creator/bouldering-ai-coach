import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth-form";
import { CruxHeader } from "@/components/crux-header";
import { useAuth } from "@/lib/use-auth";
import { useUiLocale } from "@/lib/use-ui-locale";
import { STRINGS } from "@lib/strings";

export function RegisterPage() {
  const [uiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];
  const { user, loading, configured } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/analyze", { replace: true });
  }, [loading, user, navigate]);

  return (
    <main className="crux-page">
      <CruxHeader />

      <div className="mx-auto w-full max-w-[32rem] px-[clamp(1rem,3vw,3rem)] py-10">
        <h1 className="h1 !text-[2.25rem]">{t.authRegisterTitle}</h1>
        <p className="lede">{t.authRegisterSubtitle}</p>

        <div className="mt-7">
          <AuthForm mode="register" uiLocale={uiLocale} configured={configured} />
        </div>

        <p className="mt-6 text-sm text-[var(--crux-text-muted)]">
          {t.authHasAccount}{" "}
          <Link
            to="/auth/login"
            className="font-extrabold text-[var(--crux-text)] underline decoration-[var(--crux-accent)] decoration-2 underline-offset-4"
          >
            {t.authLogin}
          </Link>
        </p>
      </div>
    </main>
  );
}
