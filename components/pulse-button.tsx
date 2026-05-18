"use client";

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
      className={`btn-pulse w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-3.5 font-bold tracking-wide text-white transition hover:from-orange-500 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-45 disabled:from-zinc-600 disabled:to-zinc-600 ${className}`}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          分析中，请稍候…
        </span>
      ) : (
        children
      )}
    </button>
  );
}
