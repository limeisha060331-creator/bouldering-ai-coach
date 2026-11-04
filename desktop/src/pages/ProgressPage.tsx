import { useCallback, useEffect, useState } from "react";
import { CruxHeader } from "@/components/crux-header";
import { IconLoader } from "@ui/icons";
import { ProgressCharts } from "@ui/progress-charts";
import {
  loadProgressByDay,
  sumAscentMeters,
  type DayStat,
} from "@lib/climbing-stats";
import { listAnalysisRecords } from "@lib/analysis-db";
import { useUiLocale } from "@lib/use-ui-locale";

export function ProgressPage() {
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
            <span className="mono block">{zh ? "累计爬升" : "Total ascent"}</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="num text-[3rem] font-black leading-none tracking-[-0.04em]">
                {loading ? "—" : totalM.toFixed(1)}
              </span>
              <span className="text-sm font-bold">{zh ? "米" : "m"}</span>
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
