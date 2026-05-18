"use client";

type Props = {
  src: string;
  fileName?: string;
  className?: string;
};

export function VideoThumbnail({ src, fileName, className = "" }: Props) {
  return (
    <div
      className={`relative inline-block overflow-hidden rounded-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] ${className}`}
    >
      <video
        src={src}
        muted
        playsInline
        className="h-28 w-44 object-cover sm:h-32 sm:w-52"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        {fileName && (
          <p className="truncate text-[10px] text-orange-200/90">{fileName}</p>
        )}
      </div>
    </div>
  );
}
