"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBookmarkNav, IconMountain } from "@/components/icons";
import type { UiLocale } from "@/lib/strings";

type Props = {
  uiLocale: UiLocale;
};

export function SiteNav({ uiLocale }: Props) {
  const path = usePathname();
  const zh = uiLocale === "zh";

  const linkClass = (href: string) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
      path === href
        ? "bg-[var(--spa-focus)] text-[var(--spa-text)]"
        : "text-[var(--spa-text-muted)] hover:bg-[var(--spa-elevated)] hover:text-[var(--spa-text-secondary)]"
    }`;

  return (
    <nav className="no-print mb-6 flex items-center justify-between">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--spa-text)]"
      >
        <IconMountain className="h-4 w-4 text-[var(--spa-text-secondary)]" />
        {zh ? "抱石分析" : "Boulder Coach"}
      </Link>
      <div className="flex gap-1">
        <Link href="/" className={linkClass("/")}>
          {zh ? "首页" : "Home"}
        </Link>
        <Link href="/favorites" className={linkClass("/favorites")}>
          <IconBookmarkNav className="h-3.5 w-3.5" />
          {zh ? "收藏夹" : "Saved"}
        </Link>
      </div>
    </nav>
  );
}
