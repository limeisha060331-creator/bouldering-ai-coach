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

  const navItems = [
    { href: "/", label: uiLocale === "zh" ? "首页" : "Home" },
    { href: "/analyze", label: uiLocale === "zh" ? "分析" : "Analyze" },
    { href: "/progress", label: uiLocale === "zh" ? "进步" : "Progress" },
    { href: "/favorites", label: uiLocale === "zh" ? "收藏" : "Saved" },
  ];

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <header
      data-variant={variant}
      className="no-print border-b-2 border-[var(--crux-border)] bg-[var(--crux-bg)]"
    >
      <div className="relative flex h-14 w-full items-center justify-between gap-6 px-[clamp(1rem,3vw,3rem)]">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[1.1875rem] font-black tracking-[-0.03em] text-[var(--crux-text)]"
        >
          <span className="crux-mark" aria-hidden />
          <span className="flex items-baseline gap-2">
            CRUX
            <span className="text-[0.8125rem] font-medium tracking-normal text-[var(--crux-text-secondary)]">
              {uiLocale === "zh" ? "抱石" : "Bouldering"}
            </span>
          </span>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={
                isActive(item.href)
                  ? "text-[0.8125rem] font-extrabold text-[var(--crux-text)] underline decoration-[var(--crux-accent)] decoration-[3px] underline-offset-[7px]"
                  : "text-[0.8125rem] font-semibold text-[var(--crux-text-secondary)] transition hover:text-[var(--crux-text)]"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 sm:flex">
          <AuthNav uiLocale={uiLocale} compact />
          {variant !== "landing" && <ThemeToggle compact />}
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          {variant !== "landing" && <ThemeToggle compact />}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center border-2 border-[var(--crux-border)]"
            aria-label="菜单"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <IconX className="h-4 w-4" /> : <IconMenu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col border-t-2 border-[var(--crux-border)] px-4 py-2 sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex items-center justify-between border-b border-[var(--crux-hair)] py-3 text-sm ${
                isActive(item.href)
                  ? "font-extrabold text-[var(--crux-text)]"
                  : "font-semibold text-[var(--crux-text-secondary)]"
              }`}
              onClick={() => setOpen(false)}
            >
              {item.label}
              {isActive(item.href) && (
                <span className="h-3 w-1 bg-[var(--crux-accent)]" />
              )}
            </Link>
          ))}
          <div className="flex items-center justify-between py-3">
            <AuthNav uiLocale={uiLocale} />
          </div>
        </nav>
      )}
    </header>
  );
}
