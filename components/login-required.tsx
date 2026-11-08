"use client";

import Link from "next/link";
import { useUiLocale } from "@/lib/use-ui-locale";

export function LoginRequired({
  title,
  body,
}: {
  title?: string;
  body?: string;
}) {
  const [uiLocale] = useUiLocale();
  const zh = uiLocale === "zh";

  return (
    <div className="panel relative mx-auto mt-10 max-w-[34rem] p-7 text-center">
      <span
        className="tape-mark"
        style={{ background: "var(--tape-yellow)" }}
        aria-hidden
      />
      <p className="text-lg font-extrabold text-[var(--crux-text)]">
        {title ?? (zh ? "请先登录" : "Sign in first")}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--crux-text-muted)]">
        {body ??
          (zh
            ? "登录后，分析报告、缩略图和视频都会保存到云端，换设备也能继续看。"
            : "Sign in to save reports, thumbnails, and videos to the cloud and open them on any device.")}
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Link href="/auth/login" className="btn btn--sm">
          {zh ? "登录" : "Log in"}
        </Link>
        <Link href="/auth/register" className="btn btn--sm">
          {zh ? "注册" : "Sign up"}
        </Link>
      </div>
    </div>
  );
}
