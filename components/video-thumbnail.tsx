"use client";

import { IconFilm } from "@/components/icons";

type Props = {
  src: string;
  fileName?: string;
  className?: string;
};

export function VideoThumbnail({ src, fileName, className = "" }: Props) {
  return (
    <div
      className={`relative inline-block overflow-hidden rounded-xl border border-[var(--spa-border)] bg-[var(--spa-elevated)] shadow-[var(--spa-shadow)] ${className}`}
    >
      <video
        src={src}
        muted
        playsInline
        className="h-32 w-full max-w-[13rem] object-cover sm:h-36 sm:max-w-[15rem]"
      />
      {fileName && (
        <div className="flex items-center gap-1.5 border-t border-[var(--spa-border-subtle)] bg-[var(--spa-surface)] px-3 py-2">
          <IconFilm className="h-3.5 w-3.5 text-[var(--spa-text-muted)]" />
          <p className="min-w-0 flex-1 truncate text-xs text-[var(--spa-text-secondary)]">
            {fileName}
          </p>
        </div>
      )}
    </div>
  );
}
