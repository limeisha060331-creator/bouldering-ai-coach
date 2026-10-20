"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconChevronDown,
  IconClock,
  IconDownload,
  IconFileText,
  IconFilm,
  IconStar,
} from "@/components/icons";
import { StructuredReportView } from "@/components/structured-report";
import { AnalysisPdfTemplate } from "@/components/analysis-pdf-template";
import type { AnalysisRecord, AnalysisSegment } from "@/lib/types";
import { parseAnalysis } from "@/lib/parse-analysis";
import { analysisToMarkdown, downloadTextFile } from "@/lib/export-analysis";
import { downloadAnalysisPdf } from "@/lib/generate-analysis-pdf";
import { listAnalysisRecords } from "@/lib/analysis-db";
import { STRINGS, type UiLocale } from "@/lib/strings";
import { gradeTapeColor, gradeTapeName } from "@/lib/grade-tape";
import { formatRecordDate } from "@/lib/record-display";

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
  const [pdfVideoIndex, setPdfVideoIndex] = useState<number | null>(null);
  const [sameGrade, setSameGrade] = useState<AnalysisRecord[]>([]);
  const t = STRINGS[uiLocale];
  const parsed = parseAnalysis(analysis);
  const segments = presetSegments?.length ? presetSegments : parsed.segments;
  const pinned = new Set(bookmarkedIndices);
  const structured = parsed.structured;
  const zh = uiLocale === "zh";

  useEffect(() => {
    if (initialSegmentIndex != null && segments[initialSegmentIndex]) {
      setActiveIndex(initialSegmentIndex);
    }
  }, [initialSegmentIndex, segments]);

  useEffect(() => {
    void listAnalysisRecords().then((list) => {
      const i = list.findIndex((r) => r.id === record.id);
      setPdfVideoIndex(i >= 0 ? i + 1 : null);
      setSameGrade(
        list
          .filter(
            (r) =>
              r.id !== record.id &&
              r.grade != null &&
              record.grade != null &&
              r.grade === record.grade
          )
          .slice(0, 3)
      );
    });
  }, [record.id, record.grade]);

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
    const safe = record.fileName
      .replace(/[^\w\u4e00-\u9fa5.-]+/g, "_")
      .slice(0, 60);
    downloadTextFile(
      `${safe || "analysis"}.md`,
      md,
      "text/markdown;charset=utf-8"
    );
  }

  async function exportPdf() {
    if (!pdfRef.current) return;
    setPdfBusy(true);
    try {
      await downloadAnalysisPdf(pdfRef.current, record.fileName);
    } catch (e) {
      console.error("[pdf]", e);
      const detail = e instanceof Error ? e.message : "";
      alert(
        zh
          ? `PDF 生成失败${detail ? `：${detail}` : "，请用 Chrome/Edge 桌面浏览器重试"}`
          : `PDF export failed${detail ? `: ${detail}` : ". Try Chrome/Edge on desktop."}`
      );
    } finally {
      setPdfBusy(false);
    }
  }

  const metaRows: Array<[string, string]> = [
    [
      zh ? "难度" : "Grade",
      record.grade
        ? `${record.grade}（${gradeTapeName(record.grade)}）`
        : "—",
    ],
    [
      zh ? "爬升" : "Ascent",
      record.ascentMeters != null
        ? `${record.ascentMeters} ${zh ? "米" : "m"}`
        : "—",
    ],
    [zh ? "分析深度" : "Depth", record.depth === "deep" ? (zh ? "深度" : "Deep") : (zh ? "轻量" : "Light")],
    [zh ? "反馈语言" : "Output", record.locale === "en" ? "English" : "中文"],
  ];

  if (record.promptVersion) {
    metaRows.push([zh ? "提示词版本" : "Prompt", record.promptVersion]);
  }

  return (
    <div>
      <AnalysisPdfTemplate
        ref={pdfRef}
        record={{ ...record, segments }}
        videoIndex={pdfVideoIndex}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{formatRecordDate(record.createdAt, "full")}</span>
          {record.sessionNote && (
            <>
              <span aria-hidden>—</span>
              <span className="max-w-[42ch] truncate">{record.sessionNote}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportPdf}
            disabled={pdfBusy}
            className="btn btn--sm"
          >
            <IconDownload className="h-3.5 w-3.5" />
            {pdfBusy ? (zh ? "生成中…" : "Exporting…") : t.downloadPdf}
          </button>
          <button type="button" onClick={exportMd} className="btn btn--sm">
            <IconFileText className="h-3.5 w-3.5" />
            {t.exportMarkdown}
          </button>
        </div>
      </div>

      <div className="result-grid">
        {/* ---------- 左：视频 + 分数 + 数据 ---------- */}
        <div>
          {videoUrl ? (
            <div className="border-2 border-[var(--crux-border)] bg-[#12100d]">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="aspect-video w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 border-2 border-[var(--crux-border-subtle)] bg-[var(--crux-surface)] px-6 text-center">
              <IconFilm className="h-5 w-5 text-[var(--crux-text-muted)]" />
              <p className="mono max-w-[30ch] leading-relaxed">
                {zh
                  ? "这段视频没有存在本机。换设备后只同步了报告文字。"
                  : "No local copy of this video — only the report was synced."}
              </p>
            </div>
          )}

          {parsed.score != null && (
            <div className="mt-6 flex items-start gap-6">
              <div className="flex-none">
                <div className="flex items-baseline gap-1">
                  <span className="num text-[4rem] font-black leading-[0.9] tracking-[-0.05em]">
                    {parsed.score}
                  </span>
                  <span className="mono">/ 100</span>
                </div>
                <span className="mono mt-1 block">
                  {zh ? "动作完成度" : "Movement score"}
                </span>
              </div>
              {parsed.highlight && (
                <p className="max-w-[46ch] border-l-4 border-[var(--crux-border)] pl-4 text-sm leading-[1.7] text-[var(--crux-text-secondary)]">
                  {parsed.highlight}
                </p>
              )}
            </div>
          )}

          <div className="panel-flat mt-6">
            <div className="panel-head">
              <span className="t">{zh ? "这条线的数据" : "Route data"}</span>
              <span
                className="h-3 w-1"
                style={{ background: gradeTapeColor(record.grade) }}
                aria-hidden
              />
            </div>
            <div className="panel-body !py-2">
              <dl className="m-0">
                {metaRows.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-4 border-b border-[var(--crux-hair)] py-2 text-xs last:border-b-0"
                  >
                    <dt className="text-[var(--crux-text-muted)]">{k}</dt>
                    <dd className="m-0 font-bold num">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>

        {/* ---------- 右：时间轴 + 结构化报告 ---------- */}
        <div className="min-w-0">
          {segments.length > 0 && (
            <section aria-labelledby="timeline-title">
              <div className="mb-1 flex items-baseline gap-2">
                <h3 id="timeline-title" className="h2 !text-[0.9375rem]">
                  {t.analysisTimeline}
                </h3>
                <span className="mono">
                  {videoUrl
                    ? zh
                      ? "点一行，视频跳到那一刻"
                      : "Tap a line to seek"
                    : zh
                      ? "按时间点看动作"
                      : "By timestamp"}
                </span>
              </div>
              <ul className="timeline">
                {segments.map((seg, i) => (
                  <li
                    key={`${seg.timestamp}-${i}`}
                    data-active={activeIndex === i}
                    data-pinned={pinned.has(i)}
                  >
                    <button
                      type="button"
                      onClick={() => seekTo(seg.seconds, i)}
                      className="seek"
                    >
                      <span className="ts inline-flex items-center gap-1.5">
                        <IconClock className="h-3 w-3" />
                        {seg.timestamp}
                      </span>
                      <p>{seg.content}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(i)}
                      className="pin"
                      aria-pressed={pinned.has(i)}
                      title={pinned.has(i) ? t.unpinSegment : t.pinSegment}
                    >
                      <IconStar className="h-4 w-4" filled={pinned.has(i)} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {structured.hasStructuredContent ? (
            <div className="mt-7">
              <StructuredReportView structured={structured} uiLocale={uiLocale} />
            </div>
          ) : (
            parsed.highlight && (
              <p className="note-box mt-6">{parsed.highlight}</p>
            )
          )}

          {sameGrade.length > 0 && (
            <section className="mt-7">
              <h3 className="h2 !text-[0.9375rem]">
                {zh
                  ? `同难度（${record.grade}）的前几次`
                  : `Other ${record.grade} sessions`}
              </h3>
              <ul className="mt-2 border-t-2 border-[var(--crux-border)]">
                {sameGrade.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-baseline gap-3 border-b border-[var(--crux-hair)] py-2.5 text-xs"
                  >
                    <span className="mono">{formatRecordDate(r.createdAt)}</span>
                    <span className="ml-auto font-extrabold num">
                      {r.score ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-7">
            <button
              type="button"
              onClick={() => setShowFullRaw((v) => !v)}
              className="inline-flex items-center gap-2 text-xs font-bold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              <IconFileText className="h-3.5 w-3.5" />
              {showFullRaw ? t.hideFullText : t.showFullText}
              <IconChevronDown
                className={`h-3.5 w-3.5 transition ${showFullRaw ? "rotate-180" : ""}`}
              />
            </button>
            {showFullRaw && (
              <pre className="mt-3 max-h-72 overflow-auto border-2 border-[var(--crux-border-subtle)] bg-[var(--crux-surface)] p-4 text-[0.7rem] leading-relaxed whitespace-pre-wrap text-[var(--crux-text-secondary)]">
                {analysis}
              </pre>
            )}
          </section>

          {segments.length === 0 && !structured.hasStructuredContent && (
            <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-[var(--crux-text-secondary)]">
              {analysis}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
