import { Link, useLocation } from "react-router-dom";
import { IconBookmarkNav, IconSettings } from "@/components/icons";
import { AuthNav } from "@/components/auth-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import type { UiLocale } from "@lib/strings";

type Props = {
  uiLocale: UiLocale;
};

export function SiteNav({ uiLocale }: Props) {
  const { pathname } = useLocation();
  const zh = uiLocale === "zh";

  const linkClass = (href: string) =>
    `crux-mono inline-flex items-center gap-1.5 border-2 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider transition ${
      pathname === href
        ? "border-[var(--crux-border)] bg-[var(--crux-accent)] text-[var(--crux-on-accent)] shadow-[3px_3px_0_var(--crux-border)]"
        : "border-transparent text-[var(--crux-text-muted)] hover:border-[var(--crux-accent)] hover:text-[var(--crux-text)]"
    }`;

  return (
    <nav className="no-print mb-8 flex flex-wrap items-center justify-between gap-4 border-b-2 border-[var(--crux-border)] pb-4">
      <Link
        to="/"
        className="text-sm font-black uppercase tracking-tight text-[var(--crux-text)]"
      >
        {zh ? "CRUX 抱石" : "CRUX Boulder"}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <AuthNav uiLocale={uiLocale} compact />
        <ThemeToggle compact />
        <Link to="/" className={linkClass("/")}>
          {zh ? "首页" : "Home"}
        </Link>
        <Link to="/analyze" className={linkClass("/analyze")}>
          {zh ? "分析" : "Analyze"}
        </Link>
        <Link to="/progress" className={linkClass("/progress")}>
          {zh ? "进步" : "Progress"}
        </Link>
        <Link to="/favorites" className={linkClass("/favorites")}>
          <IconBookmarkNav className="h-3.5 w-3.5" />
          {zh ? "收藏" : "Saved"}
        </Link>
        <Link to="/settings" className={linkClass("/settings")}>
          <IconSettings className="h-3.5 w-3.5" />
          {zh ? "设置" : "Settings"}
        </Link>
      </div>
    </nav>
  );
}
