import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AnalysisView } from "@/components/analysis-view";
import { CruxHeader } from "@/components/crux-header";
import { IconArrowLeft, IconLoader } from "@/components/icons";
import { getAnalysisRecord, patchAnalysisRecord } from "@lib/analysis-db";
import { STRINGS } from "@lib/strings";
import { useUiLocale } from "@/lib/use-ui-locale";
import { gradeTapeColor } from "@lib/grade-tape";
import type { AnalysisRecord } from "@lib/types";

export function AnalysisPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const id = params.id as string;
  const [uiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];
  const zh = uiLocale === "zh";

  const segParam = searchParams.get("seg");
  const tParam = searchParams.get("t");
  const initialSegmentIndex =
    segParam != null && segParam !== "" ? parseInt(segParam, 10) : null;
  const initialSeekSeconds =
    tParam != null && tParam !== "" ? parseFloat(tParam) : null;

  const [record, setRecord] = useState<
    (AnalysisRecord & { videoBlob?: Blob }) | null
  >(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>([]);

  useEffect(() => {
    let url: string | null = null;

    async function load() {
      try {
        const data = await getAnalysisRecord(id);
        if (!data) {
          setNotFound(true);
          return;
        }
        setRecord(data);
        setBookmarks(data.bookmarkedSegmentIndices ?? []);
        if (data.videoBlob && data.videoBlob.size > 0) {
          url = URL.createObjectURL(data.videoBlob);
          setVideoUrl(url);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const persistBookmarks = useCallback(
    async (indices: number[]) => {
      setBookmarks(indices);
      if (!record) return;
      try {
        await patchAnalysisRecord(id, { bookmarkedSegmentIndices: indices });
        setRecord((prev) =>
          prev ? { ...prev, bookmarkedSegmentIndices: indices } : prev
        );
      } catch {
        /* ignore */
      }
    },
    [id, record]
  );

  if (loading) {
    return (
      <main className="crux-page">
        <CruxHeader />
        <div className="shell flex flex-1 items-center justify-center">
          <p className="mono flex items-center gap-2">
            <IconLoader className="h-4 w-4" />
            {t.detailLoading}
          </p>
        </div>
      </main>
    );
  }

  if (notFound || !record) {
    return (
      <main className="crux-page">
        <CruxHeader />
        <div className="shell flex flex-1 flex-col items-center justify-center gap-5">
          <p className="text-sm text-[var(--crux-text-secondary)]">
            {t.detailNotFound}
          </p>
          <Link to="/analyze" className="btn">
            <IconArrowLeft className="h-4 w-4" />
            {t.detailBack}
          </Link>
        </div>
      </main>
    );
  }

  const recordForView: AnalysisRecord = {
    id: record.id,
    createdAt: record.createdAt,
    fileName: record.fileName,
    thumbnail: record.thumbnail,
    analysis: record.analysis,
    score: record.score,
    highlight: record.highlight,
    segments: record.segments,
    promptVersion: record.promptVersion,
    depth: record.depth,
    locale: record.locale,
    bookmarkedSegmentIndices: bookmarks,
    grade: record.grade,
    ascentMeters: record.ascentMeters,
    sessionNote: record.sessionNote,
  };

  return (
    <main className="crux-page">
      <CruxHeader />

      <div className="shell">
        <Link
          to="/analyze"
          className="mono inline-flex items-center gap-1.5 transition hover:text-[var(--crux-text)]"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          {zh ? "返回分析" : "Back to analyze"}
        </Link>

        <header className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-[var(--crux-border)] pb-5">
          <div className="flex items-end gap-3">
            <span className="text-[3.5rem] font-black leading-[0.8] tracking-[-0.055em]">
              {record.grade ?? "—"}
            </span>
            <span className="pb-1.5 text-xl font-extrabold tracking-tight">
              {zh ? "抱石分析报告" : "Bouldering report"}
            </span>
            <span
              className="mb-2 h-8 w-2"
              style={{ background: gradeTapeColor(record.grade) }}
              aria-hidden
            />
          </div>
          <p className="mono max-w-[34ch] truncate">
            {record.fileName}
            {record.ascentMeters != null
              ? ` ，${record.ascentMeters} ${zh ? "米" : "m"}`
              : ""}
          </p>
        </header>

        <div className="mt-6">
          <AnalysisView
            analysis={record.analysis}
            videoUrl={videoUrl}
            segments={record.segments}
            record={recordForView}
            uiLocale={uiLocale}
            bookmarkedIndices={bookmarks}
            onBookmarkChange={persistBookmarks}
            initialSeekSeconds={
              Number.isFinite(initialSeekSeconds!) ? initialSeekSeconds : null
            }
            initialSegmentIndex={
              initialSegmentIndex != null && !Number.isNaN(initialSegmentIndex)
                ? initialSegmentIndex
                : null
            }
          />
        </div>
      </div>
    </main>
  );
}
