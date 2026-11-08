"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PulseButton } from "@/components/pulse-button";
import { notifyAuthChange } from "@/lib/use-auth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { UiLocale } from "@/lib/strings";
import { STRINGS } from "@/lib/strings";

type Mode = "register" | "login";

type Props = {
  mode: Mode;
  uiLocale: UiLocale;
  configured: boolean;
};

function authErrorMessage(
  message: string,
  isRegister: boolean,
  zh: boolean
): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return zh ? "邮箱或密码不正确" : "Incorrect email or password";
  }
  if (m.includes("email not confirmed")) {
    return zh
      ? "邮箱尚未验证，请先点开验证邮件里的链接"
      : "Confirm your email first, then log in.";
  }
  if (m.includes("user already registered")) {
    return zh ? "该邮箱已注册，请直接登录" : "This email is already registered.";
  }
  if (m.includes("password should be at least")) {
    return zh ? "密码至少 8 位" : "Password must be at least 8 characters.";
  }
  if (m.includes("unable to validate email")) {
    return zh ? "请输入有效的邮箱地址" : "Enter a valid email address.";
  }
  if (m.includes("signups not allowed")) {
    return zh ? "当前项目未开放注册" : "Sign-ups are disabled for this project.";
  }
  return message || (isRegister ? (zh ? "注册失败" : "Sign-up failed") : zh ? "登录失败" : "Login failed");
}

export function AuthForm({ mode, uiLocale, configured }: Props) {
  const router = useRouter();
  const t = STRINGS[uiLocale];
  const zh = uiLocale === "zh";
  const isRegister = mode === "register";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) return;
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();

      if (isRegister) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName.trim() || undefined,
            },
            emailRedirectTo: `${window.location.origin}/auth/login`,
          },
        });
        if (signUpError) {
          setError(authErrorMessage(signUpError.message, true, zh));
          return;
        }
        if (!data.session) {
          setNotice(
            zh
              ? "注册成功。请查收邮箱并点开验证链接，然后回来登录。"
              : "Account created. Check your inbox, confirm the link, then log in."
          );
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(authErrorMessage(signInError.message, false, zh));
          return;
        }
      }

      notifyAuthChange();
      router.push("/analyze");
      router.refresh();
    } catch {
      setError(
        zh
          ? "无法连接账户服务，请检查网络后重试"
          : "Could not reach the account service. Check your connection."
      );
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

        {notice && (
          <p
            role="status"
            className="text-sm font-semibold leading-relaxed text-[var(--crux-accent)]"
          >
            {notice}
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
