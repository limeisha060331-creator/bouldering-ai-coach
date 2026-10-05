import { Link } from "react-router-dom";
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

  return (
    <header className="no-print border-b-2 border-[var(--crux-border)] bg-[var(--crux-surface)]">
      <div
        className={`flex h-12 items-center justify-between sm:h-14 ${
          variant === "landing" ? "w-full px-4 sm:px-6" : "crux-container"
        }`}
      >
        <Link
          to="/"
          className="text-sm font-black tracking-tight text-[var(--crux-text)] sm:text-base"
        >
          CRUX 抱石
        </Link>

        <div className="hidden items-center gap-3 sm:flex">
          <AuthNav uiLocale={uiLocale} compact />
          <ThemeToggle compact />
          <nav className="flex items-center gap-5">
            <Link
              to="/"
              className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              首页
            </Link>
            <Link
              to="/analyze"
              className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              分析
            </Link>
            <Link
              to="/progress"
              className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              进步
            </Link>
            <Link
              to="/favorites"
              className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              收藏
            </Link>
            <Link
              to="/settings"
              className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              设置
            </Link>
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
            {open ? (
              <IconX className="h-4 w-4" />
            ) : (
              <IconMenu className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-4 py-3 sm:hidden">
          {[
            { to: "/", label: "首页" },
            { to: "/analyze", label: "分析" },
            { to: "/progress", label: "进步" },
            { to: "/favorites", label: "收藏" },
            { to: "/settings", label: "设置" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block py-2 text-xs font-semibold"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          {variant === "landing" && (
            <Link
              to="/analyze"
              className="mt-3 block bg-[var(--crux-orange-panel)] px-4 py-3 text-center text-sm font-bold text-[var(--crux-on-accent)]"
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
