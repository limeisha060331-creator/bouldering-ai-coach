"use client";

import { IconFilm } from "@/components/icons";
import { isOpaqueFileName } from "@/lib/record-display";

type Props = {
  src: string;
  fileName?: string;
  className?: string;
};

export function VideoThumbnail({ src, fileName, className = "" }: Props) {
  const label =
    fileName && !isOpaqueFileName(fileName)
      ? fileName.replace(/\.[^.]+$/, "")
      : null;

  return (
    <div
      className={`relative inline-block overflow-hidden rounded-xl border-2 border-[var(--crux-border)] bg-[var(--spa-elevated)] shadow-[4px_4px_0_var(--crux-border)] ${className}`}
    >
      <video
        src={src}
        muted
        playsInline
        className="h-32 w-full max-w-[13rem] object-cover sm:h-36 sm:max-w-[15rem]"
      />
      {label && (
        <div className="flex items-center gap-1.5 border-t-2 border-[var(--crux-border-subtle)] bg-[var(--spa-surface)] px-3 py-2">
          <IconFilm className="h-3.5 w-3.5 text-[var(--crux-accent)]" />
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--spa-text-secondary)]">
            {label}
          </p>
        </div>
      )}
    </div>
  );
}
