"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnalysisView } from "@/components/analysis-view";
import { ShareCardButton } from "@/components/share-card";
import { IconArrowLeft, IconLoader } from "@/components/icons";
import { getAnalysisRecord } from "@/lib/analysis-db";
import type { AnalysisRecord } from "@/lib/types";

export default function AnalysisDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [record, setRecord] = useState<
    (AnalysisRecord & { videoBlob?: Blob }) | null
  >(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

  if (loading) {
    return (
      <main className="spa-page flex min-h-screen items-center justify-center">
        <p className="flex items-center gap-2 text-sm text-[var(--spa-text-muted)]">
          <IconLoader className="h-4 w-4" />
          加载中
        </p>
      </main>
    );
  }

  if (notFound || !record) {
    return (
      <main className="spa-page flex min-h-screen flex-col items-center justify-center gap-5 px-5">
        <p className="text-sm text-[var(--spa-text-secondary)]">
          找不到这条分析记录
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--spa-text)] underline-offset-4 hover:underline"
        >
          <IconArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
      </main>
    );
  }

  return (
    <main className="spa-page">
      <div className="spa-container">
        <header className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--spa-text-muted)] transition hover:text-[var(--spa-text-secondary)]"
            >
              <IconArrowLeft className="h-3.5 w-3.5" />
              返回
            </Link>
            <h1 className="mt-4 text-xl font-medium tracking-tight text-[var(--spa-text)] sm:text-2xl">
              {record.fileName}
            </h1>
            <p className="mt-1.5 text-xs text-[var(--spa-text-muted)]">
              {new Date(record.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <ShareCardButton
            score={record.score}
            highlight={record.highlight}
            fileName={record.fileName}
          />
        </header>

        <article className="spa-panel p-6 sm:p-8">
          <AnalysisView
            analysis={record.analysis}
            videoUrl={videoUrl}
            segments={record.segments}
          />
        </article>
      </div>
    </main>
  );
}
