"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconChevronDown,
  IconClock,
  IconDownload,
  IconFileText,
  IconStar,
} from "@/components/icons";
import { StructuredReportView } from "@/components/structured-report";
import { AnalysisPdfTemplate } from "@/components/analysis-pdf-template";
import type { AnalysisRecord, AnalysisSegment } from "@/lib/types";
import { parseAnalysis } from "@/lib/parse-analysis";
import { analysisToMarkdown, downloadTextFile } from "@/lib/export-analysis";
import { downloadAnalysisPdf } from "@/lib/generate-analysis-pdf";
import { STRINGS, type UiLocale } from "@/lib/strings";

type Props = {
  analysis: string;
  videoUrl?: string | null;
  segments?: AnalysisSegment[];
  record: AnalysisRecord;
  uiLocale: UiLocale;
  bookmarkedIndices: number[];
  onBookmarkChange: (indices: number[]) => void;
  initialSeekSeconds?: number | null;
  initialSegmentIndex?: number | null;
};

export function AnalysisView({
  analysis,
  videoUrl,
  segments: presetSegments,
  record,
  uiLocale,
  bookmarkedIndices,
  onBookmarkChange,
  initialSeekSeconds,
  initialSegmentIndex,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showFullRaw, setShowFullRaw] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const t = STRINGS[uiLocale];
  const parsed = parseAnalysis(analysis);
  const segments = presetSegments?.length ? presetSegments : parsed.segments;
  const pinned = new Set(bookmarkedIndices);
  const structured = parsed.structured;

  useEffect(() => {
    if (initialSegmentIndex != null && segments[initialSegmentIndex]) {
      setActiveIndex(initialSegmentIndex);
    }
  }, [initialSegmentIndex, segments]);

  useEffect(() => {
    const sec =
      initialSeekSeconds ??
      (initialSegmentIndex != null
        ? segments[initialSegmentIndex]?.seconds
        : null);
    if (sec == null || !videoRef.current) return;
    const v = videoRef.current;
    const onReady = () => {
      v.currentTime = sec;
      v.play().catch(() => {});
    };
    if (v.readyState >= 1) onReady();
    else v.addEventListener("loadedmetadata", onReady, { once: true });
  }, [initialSeekSeconds, initialSegmentIndex, segments, videoUrl]);

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

  async function exportPdf() {
    if (!pdfRef.current) return;
    setPdfBusy(true);
    try {
      await downloadAnalysisPdf(pdfRef.current, record.fileName);
    } catch {
      alert(uiLocale === "zh" ? "PDF 生成失败，请重试" : "PDF export failed");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <AnalysisPdfTemplate ref={pdfRef} record={{ ...record, segments }} />

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

      <div className="flex flex-wrap gap-3 text-xs text-[var(--spa-text-muted)]">
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportPdf}
          disabled={pdfBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--spa-text)] bg-[var(--spa-text)] px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <IconDownload className="h-3.5 w-3.5" />
          {pdfBusy ? (uiLocale === "zh" ? "生成中…" : "Exporting…") : t.downloadPdf}
        </button>
        <button
          type="button"
          onClick={exportMd}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--spa-border)] bg-[var(--spa-surface)] px-3 py-2 text-xs font-medium text-[var(--spa-text)] transition hover:bg-[var(--spa-elevated)]"
        >
          <IconFileText className="h-3.5 w-3.5" />
          {t.exportMarkdown}
        </button>
      </div>

      {structured.hasStructuredContent ? (
        <StructuredReportView structured={structured} uiLocale={uiLocale} />
      ) : (
        parsed.highlight && (
          <p className="rounded-xl border border-[var(--spa-border-subtle)] bg-[var(--spa-elevated)] p-4 text-sm leading-relaxed text-[var(--spa-text-secondary)]">
            {parsed.highlight}
          </p>
        )
      )}

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

      <section>
        <button
          type="button"
          onClick={() => setShowFullRaw((v) => !v)}
          className="inline-flex items-center gap-2 text-xs font-medium text-[var(--spa-text-muted)] transition hover:text-[var(--spa-text-secondary)]"
        >
          <IconFileText className="h-3.5 w-3.5" />
          {showFullRaw ? t.hideFullText : t.showFullText}
          <IconChevronDown
            className={`h-3.5 w-3.5 transition ${showFullRaw ? "rotate-180" : ""}`}
          />
        </button>
        {showFullRaw && (
          <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-[var(--spa-border-subtle)] bg-[var(--spa-elevated)] p-4 text-[11px] leading-relaxed text-[var(--spa-text-muted)] whitespace-pre-wrap">
            {analysis}
          </pre>
        )}
      </section>

      {segments.length === 0 && !structured.hasStructuredContent && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--spa-text-secondary)]">
          {analysis}
        </p>
      )}
    </div>
  );
}
