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
      className={`relative inline-block max-w-full overflow-hidden border-2 border-[var(--crux-border)] bg-[var(--crux-bg)] ${className}`}
    >
      <video
        src={src}
        muted
        playsInline
        className="h-32 w-full max-w-[13rem] object-cover sm:h-36 sm:max-w-[15rem]"
      />
      {label && (
        <div className="flex items-center gap-1.5 border-t-2 border-[var(--crux-border-subtle)] bg-[var(--crux-surface)] px-3 py-1.5">
          <IconFilm className="h-3.5 w-3.5 text-[var(--crux-accent)]" />
          <p className="mono min-w-0 flex-1 truncate !text-[var(--crux-text-secondary)]">
            {label}
          </p>
        </div>
      )}
    </div>
  );
}
