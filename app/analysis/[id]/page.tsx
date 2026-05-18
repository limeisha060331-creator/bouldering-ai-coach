"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnalysisView } from "@/components/analysis-view";
import { ShareCardButton } from "@/components/share-card";
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
      <main className="gym-bg flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-zinc-500">加载分析中…</p>
      </main>
    );
  }

  if (notFound || !record) {
    return (
      <main className="gym-bg flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-zinc-400">找不到这条分析记录</p>
        <Link
          href="/"
          className="text-orange-400 underline-offset-4 hover:underline"
        >
          返回首页
        </Link>
      </main>
    );
  }

  return (
    <main className="gym-bg min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-xs text-zinc-500 transition hover:text-orange-400"
            >
              ← 返回首页
            </Link>
            <h1 className="mt-2 text-xl font-bold text-zinc-100 sm:text-2xl">
              {record.fileName}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              {new Date(record.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <ShareCardButton
            score={record.score}
            highlight={record.highlight}
            fileName={record.fileName}
          />
        </header>

        <article className="gym-panel rounded-2xl p-5 sm:p-6">
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
