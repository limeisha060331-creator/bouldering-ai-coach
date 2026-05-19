"use client";

import { useRef, useState } from "react";
import {
  IconChevronDown,
  IconClock,
  IconDownload,
  IconFileText,
  IconPrinter,
  IconStar,
} from "@/components/icons";
import type { AnalysisRecord, AnalysisSegment } from "@/lib/types";
import { parseAnalysis } from "@/lib/parse-analysis";
import { analysisToMarkdown, downloadTextFile } from "@/lib/export-analysis";
import { STRINGS, type UiLocale } from "@/lib/strings";

type Props = {
  analysis: string;
  videoUrl?: string | null;
  segments?: AnalysisSegment[];
  /** 用于导出与元信息 */
  record: AnalysisRecord;
  uiLocale: UiLocale;
  bookmarkedIndices: number[];
  onBookmarkChange: (indices: number[]) => void;
};

export function AnalysisView({
  analysis,
  videoUrl,
  segments: presetSegments,
  record,
  uiLocale,
  bookmarkedIndices,
  onBookmarkChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showFullRaw, setShowFullRaw] = useState(false);
  const t = STRINGS[uiLocale];
  const parsed = parseAnalysis(analysis);
  const segments = presetSegments?.length ? presetSegments : parsed.segments;
  const pinned = new Set(bookmarkedIndices);

  function seekTo(seconds: number, index: number) {
    setActiveIndex(index);
    const v = videoRef.current;
    if (v) {
      v.currentTime = seconds;
      v.play().catch(() => {});
    }
  }

  function togglePin(index: number) {
    const next = new Set(pinned);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onBookmarkChange([...next].sort((a, b) => a - b));
  }

  function exportMd() {
    const md = analysisToMarkdown({ ...record, segments });
    const safe = record.fileName.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").slice(0, 60);
    downloadTextFile(`${safe || "analysis"}.md`, md, "text/markdown;charset=utf-8");
  }

  function printPage() {
    window.print();
  }

  return (
    <div className="flex flex-col gap-8 print:gap-4">
      {videoUrl && (
        <div className="no-print overflow-hidden rounded-xl border border-[var(--spa-border)] bg-[var(--spa-elevated)]">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="max-h-64 w-full object-contain sm:max-h-80"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-[var(--spa-text-muted)] no-print">
        {record.promptVersion && (
          <span>
            {t.metaPromptVer}: {record.promptVersion}
          </span>
        )}
        {record.depth && (
          <span>
            {t.metaDepth}: {record.depth}
          </span>
        )}
        {record.locale && (
          <span>
            {t.metaAiLang}: {record.locale}
          </span>
        )}
      </div>

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

      <div className="no-print flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportMd}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--spa-border)] bg-[var(--spa-surface)] px-3 py-2 text-xs font-medium text-[var(--spa-text)] transition hover:bg-[var(--spa-elevated)]"
        >
          <IconDownload className="h-3.5 w-3.5" />
          {t.exportMarkdown}
        </button>
        <button
          type="button"
          onClick={printPage}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--spa-border)] bg-[var(--spa-surface)] px-3 py-2 text-xs font-medium text-[var(--spa-text)] transition hover:bg-[var(--spa-elevated)]"
        >
          <IconPrinter className="h-3.5 w-3.5" />
          {t.printOrSavePdf}
        </button>
      </div>

      {segments.length > 0 && (
        <section>
          <h3 className="spa-label mb-4">{t.analysisTimeline}</h3>
          <ul className="flex flex-col gap-2">
            {segments.map((seg, i) => (
              <li key={`${seg.timestamp}-${i}`} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => togglePin(i)}
                  className="mt-3 shrink-0 rounded-lg border border-[var(--spa-border-subtle)] p-2 text-[var(--spa-text-muted)] transition hover:border-[var(--spa-border)] hover:text-[var(--spa-text)]"
                  aria-pressed={pinned.has(i)}
                  title={pinned.has(i) ? t.unpinSegment : t.pinSegment}
                >
                  <IconStar className="h-4 w-4" filled={pinned.has(i)} />
                </button>
                <button
                  type="button"
                  onClick={() => seekTo(seg.seconds, i)}
                  className={`min-w-0 flex-1 rounded-xl border px-4 py-3.5 text-left transition ${
                    activeIndex === i
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)]"
                      : "border-[var(--spa-border-subtle)] bg-[var(--spa-elevated)] hover:border-[var(--spa-border)]"
                  } ${pinned.has(i) ? "ring-1 ring-[var(--spa-text-muted)]/30" : ""}`}
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
          <h3 className="spa-label mb-3">{t.analysisSummary}</h3>
          <p className="text-sm leading-relaxed text-[var(--spa-text-secondary)]">
            {parsed.summary}
          </p>
        </section>
      )}

      <section className="no-print">
        <button
          type="button"
          onClick={() => setShowFullRaw((v) => !v)}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--spa-text)]"
        >
          <IconFileText className="h-4 w-4" />
          {showFullRaw ? t.hideFullText : t.showFullText}
          <IconChevronDown
            className={`h-4 w-4 transition ${showFullRaw ? "rotate-180" : ""}`}
          />
        </button>
        {showFullRaw && (
          <pre className="max-h-[28rem] overflow-auto rounded-xl border border-[var(--spa-border)] bg-[var(--spa-elevated)] p-4 text-xs leading-relaxed text-[var(--spa-text-secondary)] whitespace-pre-wrap">
            {analysis}
          </pre>
        )}
      </section>

      {/* 打印时仍输出全文 */}
      <section className="hidden print:block">
        <h3 className="spa-label mb-2">{t.analysisFullText}</h3>
        <pre className="whitespace-pre-wrap text-xs text-black">{analysis}</pre>
      </section>

      {segments.length === 0 && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--spa-text-secondary)]">
          {analysis}
        </p>
      )}
    </div>
  );
}
