"use client";

import { useCallback, useEffect, useState } from "react";
import { IconLoader } from "@/components/icons";
import { ProgressCharts } from "@/components/progress-charts";
import { SiteNav } from "@/components/site-nav";
import { loadProgressByDay, sumAscentMeters } from "@/lib/climbing-stats";
import { listAnalysisRecords } from "@/lib/analysis-db";
import type { DayStat } from "@/lib/climbing-stats";
import { useUiLocale } from "@/lib/use-ui-locale";

export default function ProgressPage() {
  const [uiLocale] = useUiLocale();
  const zh = uiLocale === "zh";
  const [days, setDays] = useState<DayStat[]>([]);
  const [totalM, setTotalM] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const records = await listAnalysisRecords();
      setTotalM(sumAscentMeters(records));
      setDays(await loadProgressByDay());
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
        <header className="mb-8 border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] p-6 shadow-[4px_4px_0_var(--crux-border)]">
          <p className="crux-label mb-2">{zh ? "进步" : "Progress"}</p>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--crux-text)] sm:text-3xl">
            {zh ? "训练趋势" : "Training trends"}
          </h1>
          <p className="mt-3 text-sm text-[var(--crux-text-muted)]">
            {zh
              ? "按天汇总爬升距离与最高 V 级，方便对照自己的进步。数据来自你在分析页填写的记录。"
              : "Daily ascent and max V-grade from your session logs."}
          </p>
          {!loading && (
            <p className="mt-4 text-lg font-black text-[var(--crux-orange-panel)]">
              {zh ? "累计爬升 " : "Total "}
              {totalM.toFixed(1)}
              {zh ? " 米" : " m"}
            </p>
          )}
        </header>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--crux-text-muted)]">
            <IconLoader className="h-4 w-4" />
            {zh ? "加载中…" : "Loading…"}
          </p>
        ) : (
          <ProgressCharts days={days} locale={uiLocale} />
        )}
      </div>
    </main>
  );
}
