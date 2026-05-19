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
      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--spa-accent)] px-5 py-3.5 text-sm font-medium tracking-wide text-white transition hover:bg-[var(--spa-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
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
