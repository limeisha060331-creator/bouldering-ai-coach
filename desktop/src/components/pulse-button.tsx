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
      className={`btn btn--primary btn--block ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <IconLoader className="h-4 w-4" />
          <span>分析中，请稍候</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
