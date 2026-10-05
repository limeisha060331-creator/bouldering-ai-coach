"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUiLocale } from "@/lib/use-ui-locale";
import { IconMenu, IconX } from "@/components/icons";
import { AuthNav } from "@/components/auth-nav";
import { ThemeToggle } from "@/components/theme-toggle";

type Props = {
  variant?: "landing" | "app";
};

export function CruxHeader({ variant = "app" }: Props) {
  const [uiLocale] = useUiLocale();
  const [open, setOpen] = useState(false);
  const path = usePathname();

  const activeClass =
    "text-[var(--crux-text)] underline decoration-[var(--crux-accent)] decoration-2 underline-offset-4";
  const idleClass =
    "text-[var(--crux-text-muted)] hover:text-[var(--crux-text)]";

  const navItems = [
    { href: "/", label: uiLocale === "zh" ? "首页" : "Home" },
    { href: "/analyze", label: uiLocale === "zh" ? "分析" : "Analyze" },
    { href: "/progress", label: uiLocale === "zh" ? "进步" : "Progress" },
    { href: "/favorites", label: uiLocale === "zh" ? "收藏" : "Saved" },
  ];

  return (
    <header className="no-print border-b-2 border-[var(--crux-border)] bg-[var(--crux-surface)]">
      <div
        className={`flex h-12 items-center justify-between sm:h-14 ${
          variant === "landing"
            ? "w-full px-4 sm:px-6"
            : "crux-container"
        }`}
      >
        <Link
          href="/"
          className="text-sm font-black tracking-tight text-[var(--crux-text)] sm:text-base"
        >
          CRUX 抱石
        </Link>

        <div className="hidden items-center gap-3 sm:flex">
          <AuthNav uiLocale={uiLocale} compact />
          <ThemeToggle compact />
          <nav className="flex items-center gap-5">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={path === item.href ? "page" : undefined}
                className={`text-xs font-semibold transition ${
                  path === item.href ? activeClass : idleClass
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <AuthNav uiLocale={uiLocale} compact />
          <ThemeToggle compact />
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center border-2 border-[var(--crux-border)]"
          aria-label="菜单"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <IconX className="h-4 w-4" /> : <IconMenu className="h-4 w-4" />}
        </button>
        </div>
      </div>

      {open && (
        <nav className="border-t-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-4 py-3 sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
              className={`block py-2 text-xs font-semibold ${
                path === item.href ? activeClass : idleClass
              }`}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {variant === "landing" && (
            <Link
              href="/analyze"
              className="mt-3 block border-2 border-[var(--crux-border)] bg-[var(--crux-text)] px-4 py-3 text-center text-sm font-bold text-[var(--crux-surface)]"
              onClick={() => setOpen(false)}
            >
              上传视频分析
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
