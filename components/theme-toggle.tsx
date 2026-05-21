"use client";

import { IconMoon, IconSun } from "@/components/icons";
import { useTheme } from "@/lib/use-theme";

type Props = {
  /** 顶栏紧凑样式 */
  compact?: boolean;
  className?: string;
};

export function ThemeToggle({ compact = false, className = "" }: Props) {
  const [theme, , toggle] = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        compact
          ? `inline-flex h-9 w-9 items-center justify-center border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] text-[var(--crux-text)] transition hover:border-[var(--crux-accent)] hover:text-[var(--crux-accent)] ${className}`
          : `crux-mono inline-flex items-center gap-1.5 border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--crux-text)] transition hover:border-[var(--crux-accent)] hover:text-[var(--crux-accent)] ${className}`
      }
      aria-label={isDark ? "切换到白天模式" : "切换到黑夜模式"}
      title={isDark ? "白天模式" : "黑夜模式"}
    >
      {isDark ? (
        <IconSun className="h-4 w-4" />
      ) : (
        <IconMoon className="h-4 w-4" />
      )}
      {!compact && (
        <span className="hidden sm:inline">{isDark ? "白天" : "黑夜"}</span>
      )}
    </button>
  );
}
