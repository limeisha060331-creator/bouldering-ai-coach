import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useUiLocale } from "@/lib/use-ui-locale";
import { IconMenu, IconX } from "@ui/icons";
import { AuthNav } from "@/components/auth-nav";
import { ThemeToggle } from "@ui/theme-toggle";

type Props = {
  variant?: "landing" | "app";
};

export function CruxHeader({ variant = "app" }: Props) {
  const [uiLocale] = useUiLocale();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const navItems = [
    { to: "/", label: uiLocale === "zh" ? "首页" : "Home" },
    { to: "/analyze", label: uiLocale === "zh" ? "分析" : "Analyze" },
    { to: "/progress", label: uiLocale === "zh" ? "进步" : "Progress" },
    { to: "/favorites", label: uiLocale === "zh" ? "收藏" : "Saved" },
    { to: "/settings", label: uiLocale === "zh" ? "设置" : "Settings" },
  ];

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <header
      data-variant={variant}
      className="no-print border-b-2 border-[var(--crux-border)] bg-[var(--crux-bg)]"
    >
      <div className="flex h-14 w-full items-center justify-between gap-6 px-[clamp(1rem,3vw,3rem)]">
        <Link
          to="/"
          className="flex items-baseline gap-2 text-[1.1875rem] font-black tracking-[-0.03em] text-[var(--crux-text)]"
        >
          CRUX
          <span className="text-[0.8125rem] font-medium tracking-normal text-[var(--crux-text-secondary)]">
            {uiLocale === "zh" ? "抱石" : "Bouldering"}
          </span>
        </Link>

        <div className="hidden items-center gap-6 sm:flex">
          <nav className="flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? "page" : undefined}
                className={
                  isActive(item.to)
                    ? "text-[0.8125rem] font-extrabold text-[var(--crux-text)] underline decoration-[var(--crux-accent)] decoration-[3px] underline-offset-[7px]"
                    : "text-[0.8125rem] font-semibold text-[var(--crux-text-secondary)] transition hover:text-[var(--crux-text)]"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <AuthNav uiLocale={uiLocale} compact />
          <ThemeToggle compact />
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle compact />
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center border-2 border-[var(--crux-border)]"
            aria-label="菜单"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <IconX className="h-4 w-4" />
            ) : (
              <IconMenu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col border-t-2 border-[var(--crux-border)] px-4 py-2 sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(item.to) ? "page" : undefined}
              className={`flex items-center justify-between border-b border-[var(--crux-hair)] py-3 text-sm ${
                isActive(item.to)
                  ? "font-extrabold text-[var(--crux-text)]"
                  : "font-semibold text-[var(--crux-text-secondary)]"
              }`}
              onClick={() => setOpen(false)}
            >
              {item.label}
              {isActive(item.to) && (
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
