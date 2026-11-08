"use client";

import { useCallback, useEffect, useState } from "react";
import { CruxHeader } from "@/components/crux-header";
import { IconLoader } from "@/components/icons";
import { LoginRequired } from "@/components/login-required";
import { ProgressCharts } from "@/components/progress-charts";
import { buildProgressByDay, sumAscentMeters } from "@/lib/climbing-stats";
import { listAnalysisRecords } from "@/lib/analysis-store";
import type { DayStat } from "@/lib/climbing-stats";
import { useAuth } from "@/lib/use-auth";
import { useUiLocale } from "@/lib/use-ui-locale";

export default function ProgressPage() {
  const [uiLocale] = useUiLocale();
  const zh = uiLocale === "zh";
  const [days, setDays] = useState<DayStat[]>([]);
  const [totalM, setTotalM] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) {
      setDays([]);
      setTotalM(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records = await listAnalysisRecords();
      setTotalM(sumAscentMeters(records));
      setDays(buildProgressByDay(records));
    } catch {
      setDays([]);
      setTotalM(0);
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
            {zh ? "加载中…" : "Loading…"}
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
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b-2 border-[var(--crux-border)] pb-6">
          <div>
            <h1 className="h1">{zh ? "训练趋势" : "Training trends"}</h1>
            <p className="lede">
              {zh
                ? "按天汇总爬升距离和最高 V 级。数据来自你在分析页填的登记表。"
                : "Daily ascent and max V-grade from your session logs."}
            </p>
          </div>
          <div>
            <span className="mono block">
              {zh ? "累计爬升" : "Total ascent"}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="num text-[3rem] font-black leading-none tracking-[-0.04em]">
                {loading ? "—" : totalM.toFixed(1)}
              </span>
              <span className="text-sm font-bold">
                {zh ? "米" : "m"}
              </span>
            </div>
          </div>
        </header>

        <div className="mt-8">
          {loading ? (
            <p className="mono flex items-center gap-2">
              <IconLoader className="h-4 w-4" />
              {zh ? "加载中…" : "Loading…"}
            </p>
          ) : (
            <ProgressCharts days={days} locale={uiLocale} />
          )}
        </div>
      </div>
    </main>
  );
}
