"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CruxHeader } from "@/components/crux-header";
import { IconClock, IconLoader, IconStar } from "@/components/icons";
import { LoginRequired } from "@/components/login-required";
import { segmentBookmarksFrom } from "@/lib/bookmarks";
import { listAnalysisRecords } from "@/lib/analysis-store";
import { STRINGS } from "@/lib/strings";
import { useAuth } from "@/lib/use-auth";
import { useUiLocale } from "@/lib/use-ui-locale";
import type { SegmentBookmarkItem } from "@/lib/types";

export default function FavoritesPage() {
  const [uiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];
  const zh = uiLocale === "zh";
  const [items, setItems] = useState<SegmentBookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records = await listAnalysisRecords();
      setItems(segmentBookmarksFrom(records));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // 数据请求完成后才 setState；React Compiler 规则把异步加载误判为同步更新
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (authLoading) {
    return (
      <main className="crux-page">
        <CruxHeader />
        <div className="shell-narrow flex flex-1 items-center justify-center">
          <p className="mono flex items-center gap-2">
            <IconLoader className="h-4 w-4" />
            {t.detailLoading}
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="crux-page">
        <CruxHeader />
        <div className="shell-narrow">
          <LoginRequired />
        </div>
      </main>
    );
  }

  return (
    <main className="crux-page">
      <CruxHeader />

      <div className="shell-narrow">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border-2 border-[var(--crux-border)] text-[var(--crux-accent)]">
              <IconStar className="h-4 w-4" filled />
            </span>
            <h1 className="h1 !text-[2rem]">{t.favoritesTitle}</h1>
          </div>
          <p className="lede">
            {zh
              ? "点一条可以跳回对应的分析，并定位到那一刻。"
              : "Tap an item to open the analysis at that moment."}
          </p>
        </header>

        {loading ? (
          <p className="mono flex items-center gap-2">
            <IconLoader className="h-4 w-4" />
            {t.detailLoading}
          </p>
        ) : items.length === 0 ? (
          <div className="empty">
            <p className="t">{t.favoritesEmpty}</p>
            <p className="h">{t.favoritesEmptyHint}</p>
            <Link href="/analyze" className="btn btn--sm mt-5">
              {zh ? "去上传分析" : "Upload a clip"}
            </Link>
          </div>
        ) : (
          <ul className="border-t-2 border-[var(--crux-border)]">
            {items.map((item) => (
              <li key={`${item.analysisId}-${item.segmentIndex}`}>
                <Link
                  href={`/analysis/${item.analysisId}?seg=${item.segmentIndex}&t=${item.seconds}`}
                  className="group block border-b border-[var(--crux-hair)] py-4 transition hover:bg-[var(--crux-surface)]"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-extrabold text-[var(--crux-text)]">
                      {item.fileName}
                    </span>
                    <span className="mono inline-flex items-center gap-1 !text-[var(--crux-accent)]">
                      <IconClock className="h-3 w-3" />
                      {item.timestamp}
                    </span>
                    <span className="mono ml-auto">
                      {t.favoritesSavedAt}{" "}
                      {new Date(item.createdAt).toLocaleString(
                        zh ? "zh-CN" : "en-US",
                        { month: "numeric", day: "numeric" }
                      )}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 max-w-[70ch] text-sm leading-relaxed text-[var(--crux-text-secondary)]">
                    {item.content}
                  </p>
                  <span className="mt-2 inline-block text-xs font-extrabold underline decoration-[var(--crux-accent)] decoration-2 underline-offset-4">
                    {t.favoritesGoAnalysis}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
