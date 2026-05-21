"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CountUp } from "@/components/count-up";
import { CruxHeader } from "@/components/crux-header";
import { BOULDER_GRADES } from "@/lib/bouldering-grade";
import { sumAscentMeters } from "@/lib/climbing-stats";
import { listAnalysisRecords } from "@/lib/analysis-db";
import type { AnalysisRecord } from "@/lib/types";

function formatDuration(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").slice(0, 12).toUpperCase();
}

export function LandingHome() {
  const router = useRouter();
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await listAnalysisRecords();
    setRecords(list);
    setActiveId((prev) =>
      prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalAscentM = useMemo(() => sumAscentMeters(records), [records]);

  const active = useMemo(
    () => records.find((r) => r.id === activeId) ?? null,
    [records, activeId]
  );

  return (
    <div className="crux-page flex min-h-screen flex-col">
      <CruxHeader variant="landing" />

      <div className="crux-container flex flex-1 flex-col py-4 lg:grid lg:grid-cols-12 lg:gap-0 lg:py-0">
        <aside className="crux-fade-up order-2 border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] lg:order-1 lg:col-span-2 lg:border-r-0 lg:border-t-0">
          <div className="border-b-2 border-[var(--crux-border)] p-4">
            <p className="crux-mono text-[10px] text-[var(--crux-text-muted)]">
              SESSION LOG
            </p>
            <p className="mt-2 text-sm font-black uppercase leading-tight tracking-tight">
              History
            </p>
          </div>
          <ul className="max-h-[40vh] divide-y-2 divide-[var(--crux-border)] overflow-y-auto lg:max-h-[calc(100vh-8rem)]">
            {records.length === 0 ? (
              <li className="px-4 py-6 text-xs text-[var(--crux-text-muted)]">
                暂无分析记录，完成一次分析后会出现在这里。
              </li>
            ) : (
              records.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveId(r.id)}
                    onClick={() => router.push(`/analysis/${r.id}`)}
                    className={`crux-session-item w-full px-4 py-3 text-left ${
                      activeId === r.id
                        ? "bg-[var(--crux-text)] text-[var(--crux-surface)]"
                        : "bg-transparent text-[var(--crux-text)]"
                    }`}
                  >
                    <span className="text-lg font-black">{i + 1}.</span>
                    <span className="crux-mono ml-1 block text-[10px] opacity-90">
                      {r.grade ?? "V?"} // {formatDuration(r.fileName)} //{" "}
                      {(r.ascentMeters ?? 0).toFixed(1)}m
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section className="relative order-1 min-h-[52vh] overflow-hidden border-2 border-[var(--crux-border)] lg:order-2 lg:col-span-7 lg:min-h-[calc(100vh-3.5rem)] lg:border-x-0 lg:border-t-0">
          <div className="absolute inset-0">
            <Image
              src="/hero-climb.jpg"
              alt="室内抱石攀岩"
              fill
              priority
              quality={92}
              className="crux-hero-img object-cover object-[center_40%] contrast-[1.06] saturate-[0.9]"
              sizes="(max-width: 1024px) 100vw, 70vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-black/30" />
          </div>

          <div className="relative z-10 flex h-full min-h-[52vh] flex-col justify-between p-4 sm:p-6 lg:min-h-[calc(100vh-3.5rem)]">
            <div className="crux-fade-up pt-2" style={{ animationDelay: "0.2s" }}>
              <p className="crux-mono text-[10px] text-white/75">
                TOTAL ASCENT
              </p>
              <p className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                <CountUp
                  end={totalAscentM}
                  decimals={totalAscentM % 1 === 0 ? 0 : 1}
                  durationMs={1800}
                />
                <span className="ml-2 text-2xl sm:text-3xl">m</span>
              </p>
              <p className="mt-2 crux-mono text-[10px] text-white/60">
                累计爬升 · 来自各次分析记录
              </p>
            </div>

            <div
              className="crux-fade-up max-w-md"
              style={{ animationDelay: "0.35s" }}
            >
              <h1 className="text-2xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-4xl">
                Bouldering
                <br />
                AI Coach
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
                简洁、专业的攀爬动作分析。上传视频，记录难度与爬升，追踪进步。
              </p>
            </div>
          </div>
        </section>

        <aside className="crux-panel-orange order-3 flex flex-col justify-between bg-[var(--crux-orange-panel)] p-6 sm:p-8 lg:col-span-3 lg:min-h-[calc(100vh-3.5rem)]">
          <div>
            <p className="crux-mono text-[10px] font-bold text-[var(--crux-text)]/70">
              ROUTE GRADE
            </p>
            {active ? (
              <>
                <p className="mt-4 text-5xl font-black tracking-tight text-[var(--crux-text)]">
                  {active.grade ?? "—"}
                </p>
                <p className="mt-2 crux-mono text-[10px] text-[var(--crux-text)]/70">
                  {active.grade
                    ? "已记录难度"
                    : "未标注 · 可在分析页补选 V 级"}
                </p>
                {active.highlight && (
                  <p className="mt-6 text-sm font-bold leading-snug text-[var(--crux-text)]">
                    {active.highlight}
                  </p>
                )}
                {active.sessionNote && (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--crux-text)]/85">
                    {active.sessionNote}
                  </p>
                )}
                <Link
                  href={`/analysis/${active.id}`}
                  className="mt-6 inline-block border-b-2 border-[var(--crux-text)] text-xs font-black uppercase"
                >
                  查看完整报告 →
                </Link>
              </>
            ) : (
              <>
                <p className="mt-4 text-3xl font-black uppercase leading-[0.9] text-[var(--crux-text)]">
                  Set
                  <br />
                  your V
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--crux-text)]/90">
                  新线路请在分析页选择 V0–V10；若视频里能看出难度，AI
                  也会尝试写入报告。
                </p>
                <p className="crux-mono mt-4 text-[10px] text-[var(--crux-text)]/60">
                  {BOULDER_GRADES.join(" · ")}
                </p>
              </>
            )}
          </div>

          <div className="mt-10 space-y-3">
            <Link
              href="/analyze"
              className="crux-cta group flex w-full items-center justify-between border-2 border-[var(--crux-border)] bg-[var(--crux-text)] px-5 py-4 text-sm font-black uppercase tracking-wider text-[var(--crux-surface)]"
            >
              <span>上传视频分析</span>
              <span className="crux-mono text-xs transition group-hover:translate-x-1">
                →
              </span>
            </Link>
            <Link
              href="/progress"
              className="flex w-full items-center justify-center border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-5 py-3 text-xs font-black uppercase tracking-wider text-[var(--crux-text)]"
            >
              查看进步曲线
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
