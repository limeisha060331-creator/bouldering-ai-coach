"use client";

import { useRef, useState } from "react";
import { IconClock } from "@/components/icons";
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
    <div className="flex flex-col gap-8">
      {videoUrl && (
        <div className="overflow-hidden rounded-xl border border-[var(--spa-border)] bg-[var(--spa-elevated)]">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="max-h-64 w-full object-contain sm:max-h-80"
          />
        </div>
      )}

      {parsed.score != null && (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-full border border-[var(--spa-border)] bg-[var(--spa-elevated)]">
            <span className="text-2xl font-light tabular-nums tracking-tight text-[var(--spa-text)]">
              {parsed.score}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[var(--spa-text-muted)]">
              / 100
            </span>
          </div>
          {parsed.highlight && (
            <blockquote className="flex-1 border-l border-[var(--spa-border)] pl-5 text-sm leading-relaxed text-[var(--spa-text-secondary)]">
              {parsed.highlight}
            </blockquote>
          )}
        </div>
      )}

      {segments.length > 0 && (
        <section>
          <h3 className="spa-label mb-4">逐帧分析</h3>
          <ul className="flex flex-col gap-2">
            {segments.map((seg, i) => (
              <li key={`${seg.timestamp}-${i}`}>
                <button
                  type="button"
                  onClick={() => seekTo(seg.seconds, i)}
                  className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
                    activeIndex === i
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)]"
                      : "border-[var(--spa-border-subtle)] bg-[var(--spa-elevated)] hover:border-[var(--spa-border)]"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium tabular-nums text-[var(--spa-text-secondary)]">
                    <IconClock className="h-3.5 w-3.5" />
                    {seg.timestamp}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-[var(--spa-text)]">
                    {seg.content}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {parsed.summary && (
        <section>
          <h3 className="spa-label mb-3">总结</h3>
          <p className="text-sm leading-relaxed text-[var(--spa-text-secondary)]">
            {parsed.summary}
          </p>
        </section>
      )}

      {segments.length === 0 && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--spa-text-secondary)]">
          {analysis}
        </p>
      )}
    </div>
  );
}
