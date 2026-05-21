"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CountUp } from "@/components/count-up";
import { CruxHeader } from "@/components/crux-header";
import { listAnalysisRecords } from "@/lib/analysis-db";
import { sumAscentMeters } from "@/lib/climbing-stats";
import type { AnalysisRecord } from "@/lib/types";

function shortFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.length > 20 ? `${base.slice(0, 18)}…` : base;
}

function sessionSubtitle(r: AnalysisRecord): string {
  const date = new Date(r.createdAt).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
  const grade = r.grade ?? "未标难度";
  const label = r.sessionNote?.trim() || shortFileName(r.fileName);
  const ascent =
    r.ascentMeters != null && r.ascentMeters > 0
      ? `${r.ascentMeters % 1 === 0 ? r.ascentMeters : r.ascentMeters.toFixed(1)}m 爬升`
      : null;
  return [date, grade, label, ascent].filter(Boolean).join(" · ");
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

  return (
    <div className="crux-page flex min-h-screen flex-col">
      <CruxHeader variant="landing" />

      <div className="crux-container flex flex-1 flex-col px-0 py-0 lg:max-w-none lg:grid lg:grid-cols-12 lg:gap-0">
        <aside className="crux-fade-up order-2 border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] lg:order-1 lg:col-span-2 lg:border-r-0 lg:border-t-0">
          <div className="border-b-2 border-[var(--crux-border)] p-4">
            <p className="text-[10px] text-[var(--crux-text-muted)]">训练记录</p>
            <p className="mt-2 text-sm font-black leading-tight tracking-tight">
              历史视频
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
                    <span className="text-lg font-black">
                      视频 {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug opacity-90">
                      {sessionSubtitle(r)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section className="relative order-1 min-h-[48vh] overflow-hidden border-2 border-[var(--crux-border)] sm:min-h-[52vh] lg:order-2 lg:col-span-7 lg:min-h-[calc(100vh-3.5rem)] lg:border-x-0 lg:border-t-0">
          <div className="absolute inset-0 flex items-center justify-center bg-[#141414]">
            <Image
              src="/hero-climb.jpg"
              alt="抱石攀岩"
              width={1920}
              height={1280}
              priority
              quality={92}
              className="crux-hero-img h-auto max-h-full w-full object-contain object-center contrast-[1.06] saturate-[0.95]"
              sizes="(max-width: 1024px) 100vw, 58vw"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25" />
          </div>

          <div className="relative z-10 flex h-full min-h-[52vh] flex-col justify-between p-4 sm:p-6 lg:min-h-[calc(100vh-3.5rem)]">
            <div className="crux-fade-up pt-2" style={{ animationDelay: "0.2s" }}>
              <p className="text-[10px] font-medium text-white/75">累计爬升</p>
              <p className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                <CountUp
                  end={totalAscentM}
                  decimals={totalAscentM % 1 === 0 ? 0 : 1}
                  durationMs={1800}
                />
                <span className="ml-2 text-2xl sm:text-3xl">米</span>
              </p>
              <p className="mt-2 text-[10px] text-white/60">
                来自各次分析中填写的爬升高度
              </p>
            </div>

            <div
              className="crux-fade-up max-w-md"
              style={{ animationDelay: "0.35s" }}
            >
              <p className="text-sm leading-relaxed text-white/85">
                上传攀爬视频，获取带时间戳的专业动作反馈，并记录难度与爬升。
              </p>
            </div>
          </div>
        </section>

        <aside className="crux-panel-orange order-3 flex flex-col justify-between bg-[var(--crux-orange-panel)] p-6 sm:p-8 lg:col-span-3 lg:min-h-[calc(100vh-3.5rem)]">
          <div className="flex flex-1 flex-col justify-center py-4">
            <h1 className="text-[2.75rem] font-black leading-[0.88] tracking-tight text-[var(--crux-text)] sm:text-6xl lg:text-[4.25rem]">
              CRUX 抱石
              <br />
              动作解析
            </h1>
            <p className="mt-5 max-w-xs text-sm font-medium leading-relaxed text-[var(--crux-text)]/85">
              简洁、专业的攀爬视频分析平台
            </p>
          </div>

          <div className="space-y-3">
            <Link
              href="/analyze"
              className="crux-cta group flex w-full items-center justify-between border-2 border-[var(--crux-border)] bg-[var(--crux-text)] px-5 py-4 text-sm font-black text-[var(--crux-surface)]"
            >
              <span>上传视频分析</span>
              <span className="text-xs transition group-hover:translate-x-1">
                →
              </span>
            </Link>
            <Link
              href="/progress"
              className="flex w-full items-center justify-center border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-5 py-3 text-xs font-black text-[var(--crux-text)]"
            >
              查看进步曲线
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
