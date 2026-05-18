"use client";

import { useRef, useState } from "react";
import type { AnalysisSegment } from "@/lib/types";
import { parseAnalysis } from "@/lib/parse-analysis";

type Props = {
  analysis: string;
  videoUrl?: string | null;
  segments?: AnalysisSegment[];
};

export function AnalysisView({ analysis, videoUrl, segments: presetSegments }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const parsed = parseAnalysis(analysis);
  const segments = presetSegments?.length ? presetSegments : parsed.segments;

  function seekTo(seconds: number, index: number) {
    setActiveIndex(index);
    const v = videoRef.current;
    if (v) {
      v.currentTime = seconds;
      v.play().catch(() => {});
    }
  }

  return (
    <div className="space-y-6">
      {videoUrl && (
        <div className="overflow-hidden rounded-xl border border-white/10 shadow-lg">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="max-h-64 w-full bg-black object-contain sm:max-h-80"
          />
        </div>
      )}

      {parsed.score != null && (
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-2 border-orange-500/50 bg-orange-500/10">
            <span className="text-2xl font-bold text-orange-400">
              {parsed.score}
            </span>
            <span className="text-[10px] text-zinc-500">/ 100</span>
          </div>
          {parsed.highlight && (
            <blockquote className="flex-1 border-l-2 border-orange-500/60 pl-4 text-sm italic text-zinc-300">
              「{parsed.highlight}」
            </blockquote>
          )}
        </div>
      )}

      {segments.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-400/90">
            逐帧分析 · 点击跳转
          </h3>
          <ul className="space-y-2">
            {segments.map((seg, i) => (
              <li key={`${seg.timestamp}-${i}`}>
                <button
                  type="button"
                  onClick={() => seekTo(seg.seconds, i)}
                  className={`gym-panel w-full rounded-lg px-4 py-3 text-left transition ${
                    activeIndex === i
                      ? "border-orange-500/50 ring-1 ring-orange-500/40"
                      : "hover:border-white/10"
                  }`}
                >
                  <span className="font-mono text-sm font-bold text-orange-400">
                    [{seg.timestamp}]
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-zinc-300">
                    {seg.content}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {parsed.summary && (
        <section className="gym-panel rounded-xl p-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-400">总结</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {parsed.summary}
          </p>
        </section>
      )}

      {segments.length === 0 && (
        <div className="gym-panel rounded-xl p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {analysis}
          </p>
        </div>
      )}
    </div>
  );
}
