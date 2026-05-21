"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AnalysisView } from "@/components/analysis-view";
import { SiteNav } from "@/components/site-nav";
import { IconArrowLeft, IconLoader } from "@/components/icons";
import { getAnalysisRecord, patchAnalysisRecord } from "@/lib/analysis-db";
import { STRINGS } from "@/lib/strings";
import { useUiLocale } from "@/lib/use-ui-locale";
import type { AnalysisRecord } from "@/lib/types";

function AnalysisDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const [uiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];

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
        if (data.videoBlob) {
          url = URL.createObjectURL(data.videoBlob);
          setVideoUrl(url);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    load();
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
      <main className="crux-page flex min-h-screen items-center justify-center">
        <p className="flex items-center gap-2 text-sm text-[var(--spa-text-muted)]">
          <IconLoader className="h-4 w-4" />
          {t.detailLoading}
        </p>
      </main>
    );
  }

  if (notFound || !record) {
    return (
      <main className="crux-page flex min-h-screen flex-col items-center justify-center gap-5 px-5">
        <p className="text-sm text-[var(--spa-text-secondary)]">
          {t.detailNotFound}
        </p>
        <Link
          href="/analyze"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--spa-text)] underline-offset-4 hover:underline"
        >
          <IconArrowLeft className="h-4 w-4" />
          {t.detailBack}
        </Link>
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
      <div className="crux-container-narrow">
        <SiteNav uiLocale={uiLocale} />
        <header className="mb-6">
          <Link
            href="/analyze"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--spa-text-muted)] transition hover:text-[var(--spa-text-secondary)]"
          >
            <IconArrowLeft className="h-3.5 w-3.5" />
            {uiLocale === "zh" ? "返回" : "Back"}
          </Link>
          <h1 className="mt-4 text-xl font-black uppercase tracking-tight text-[var(--crux-text)] sm:text-2xl">
            {record.fileName}
          </h1>
          <p className="mt-1.5 crux-mono text-xs text-[var(--crux-text-muted)]">
            {new Date(record.createdAt).toLocaleString(
              uiLocale === "zh" ? "zh-CN" : "en-US"
            )}
            {record.grade ? ` · ${record.grade}` : ""}
            {record.ascentMeters != null
              ? ` · ${record.ascentMeters}m`
              : ""}
          </p>
          {record.sessionNote && (
            <p className="mt-2 text-sm text-[var(--crux-text-secondary)]">
              {record.sessionNote}
            </p>
          )}
        </header>

        <article className="spa-panel p-6 sm:p-8">
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
        </article>
      </div>
    </main>
  );
}

export default function AnalysisDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="crux-page flex min-h-screen items-center justify-center">
          <p className="text-sm text-[var(--spa-text-muted)]">加载中…</p>
        </main>
      }
    >
      <AnalysisDetailContent />
    </Suspense>
  );
}
