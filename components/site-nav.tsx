"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBookmarkNav } from "@/components/icons";
import type { UiLocale } from "@/lib/strings";

type Props = {
  uiLocale: UiLocale;
};

export function SiteNav({ uiLocale }: Props) {
  const path = usePathname();
  const zh = uiLocale === "zh";

  const linkClass = (href: string) =>
    `crux-mono inline-flex items-center gap-1.5 border-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
      path === href
        ? "border-[var(--crux-border)] bg-[var(--crux-text)] text-[var(--crux-surface)]"
        : "border-transparent text-[var(--crux-text-muted)] hover:border-[var(--crux-border)] hover:text-[var(--crux-text)]"
    }`;

  return (
    <nav className="no-print mb-8 flex flex-wrap items-center justify-between gap-4 border-b-2 border-[var(--crux-border)] pb-4">
      <Link
        href="/"
        className="text-sm font-black uppercase tracking-tight text-[var(--crux-text)]"
      >
        {zh ? "抱石 AI Coach" : "Boulder AI Coach"}
      </Link>
      <div className="flex flex-wrap gap-2">
        <Link href="/" className={linkClass("/")}>
          {zh ? "首页" : "Home"}
        </Link>
        <Link href="/analyze" className={linkClass("/analyze")}>
          {zh ? "分析" : "Analyze"}
        </Link>
        <Link href="/favorites" className={linkClass("/favorites")}>
          <IconBookmarkNav className="h-3.5 w-3.5" />
          {zh ? "收藏" : "Saved"}
        </Link>
      </div>
    </nav>
  );
}
