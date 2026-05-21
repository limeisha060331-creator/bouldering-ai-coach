"use client";

import { IconLoader } from "@/components/icons";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  children: React.ReactNode;
};

export function PulseButton({
  loading,
  children,
  className = "",
  disabled,
  ...props
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`flex w-full items-center justify-center gap-2 border-2 border-[var(--crux-border)] bg-[var(--crux-orange-panel)] px-5 py-3.5 text-sm font-black uppercase tracking-wider text-[var(--crux-text)] shadow-[4px_4px_0_var(--crux-border)] transition hover:translate-y-[-1px] hover:shadow-[6px_6px_0_var(--crux-border)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <IconLoader className="h-4 w-4 text-white/90" />
          <span>分析中，请稍候</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
