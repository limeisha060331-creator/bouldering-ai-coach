"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { IconClock, IconLoader, IconStar } from "@/components/icons";
import { listAllSegmentBookmarks } from "@/lib/bookmarks";
import { STRINGS } from "@/lib/strings";
import { useUiLocale } from "@/lib/use-ui-locale";
import type { SegmentBookmarkItem } from "@/lib/types";

export default function FavoritesPage() {
  const [uiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];
  const [items, setItems] = useState<SegmentBookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAllSegmentBookmarks();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <main className="crux-page">
      <div className="crux-container-narrow">
        <SiteNav uiLocale={uiLocale} />
        <header className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <IconStar className="h-5 w-5 text-[var(--crux-accent)]" filled />
            <h1 className="text-xl font-black uppercase text-[var(--crux-text)] sm:text-2xl">
              {t.favoritesTitle}
            </h1>
          </div>
          <p className="text-sm text-[var(--spa-text-muted)]">
            {uiLocale === "zh"
              ? "点击条目可跳转到对应视频分析并定位到该时间点。"
              : "Tap an item to open the analysis and jump to that moment."}
          </p>
        </header>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--spa-text-muted)]">
            <IconLoader className="h-4 w-4" />
            {t.detailLoading}
          </p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--spa-border)] bg-[var(--spa-elevated)] px-6 py-14 text-center">
            <p className="text-sm font-medium text-[var(--spa-text-secondary)]">
              {t.favoritesEmpty}
            </p>
            <p className="mt-2 text-xs text-[var(--spa-text-muted)]">
              {t.favoritesEmptyHint}
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-[var(--spa-text)] underline-offset-4 hover:underline"
            >
              {uiLocale === "zh" ? "去上传分析" : "Upload a clip"}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={`${item.analysisId}-${item.segmentIndex}`}>
                <Link
                  href={`/analysis/${item.analysisId}?seg=${item.segmentIndex}&t=${item.seconds}`}
                  className="spa-panel block rounded-xl p-4 transition hover:border-[var(--spa-text-muted)]/40 hover:shadow-[var(--spa-shadow-lg)]"
                >
                  <p className="truncate text-sm font-medium text-[var(--spa-text)]">
                    {item.fileName}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--spa-text-muted)]">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <IconClock className="h-3.5 w-3.5" />
                      {item.timestamp}
                    </span>
                    <span>
                      {t.favoritesSavedAt}:{" "}
                      {new Date(item.createdAt).toLocaleString(
                        uiLocale === "zh" ? "zh-CN" : "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </span>
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--spa-text-secondary)]">
                    {item.content}
                  </p>
                  <span className="mt-3 inline-block text-xs font-medium text-[var(--spa-text)]">
                    {t.favoritesGoAnalysis} →
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
