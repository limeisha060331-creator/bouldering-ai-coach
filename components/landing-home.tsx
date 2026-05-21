"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CountUp } from "@/components/count-up";
import { CruxHeader } from "@/components/crux-header";

const SESSIONS = [
  { id: "7", grade: "V8", name: "THE NOSE", time: "00:42" },
  { id: "4", grade: "V6", name: "SLAB EXIT", time: "00:28" },
  { id: "12", grade: "V9", name: "ROOF LINE", time: "01:05" },
];

export function LandingHome() {
  const [scrub, setScrub] = useState(34);
  const [activeSession, setActiveSession] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setScrub((s) => (s >= 92 ? 14 : s + 0.4));
    }, 120);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="crux-page flex min-h-screen flex-col">
      <CruxHeader variant="landing" />

      <div className="crux-container flex flex-1 flex-col py-4 lg:grid lg:grid-cols-12 lg:gap-0 lg:py-0">
        {/* Left rail */}
        <aside className="crux-fade-up order-2 border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] lg:order-1 lg:col-span-2 lg:border-r-0 lg:border-t-0">
          <div className="border-b-2 border-[var(--crux-border)] p-4">
            <p className="crux-mono text-[10px] text-[var(--crux-text-muted)]">
              FOUNDRY / PROJECT
            </p>
            <p className="mt-2 text-sm font-black uppercase leading-tight tracking-tight sm:text-base">
              Bouldering
              <br />
              Session_09
            </p>
          </div>
          <ul className="divide-y-2 divide-[var(--crux-border)]">
            {SESSIONS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveSession(i)}
                  className={`crux-session-item w-full px-4 py-3 text-left ${
                    activeSession === i
                      ? "bg-[var(--crux-text)] text-[var(--crux-surface)]"
                      : "bg-transparent text-[var(--crux-text)]"
                  }`}
                >
                  <span className="text-lg font-black">{s.id}.</span>
                  <span className="crux-mono ml-1 text-[10px] opacity-80">
                    {s.grade} // {s.name} // {s.time}s
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Hero */}
        <section className="relative order-1 min-h-[52vh] overflow-hidden border-2 border-[var(--crux-border)] lg:order-2 lg:col-span-7 lg:min-h-[calc(100vh-3.5rem)] lg:border-x-0 lg:border-t-0">
          <div className="absolute inset-0">
            <Image
              src="/hero-climb.png"
              alt="抱石攀岩动态分析"
              fill
              priority
              className="crux-hero-img object-cover object-center grayscale contrast-[1.05]"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
          </div>

          <div className="relative z-10 flex h-full min-h-[52vh] flex-col justify-between p-4 sm:p-6 lg:min-h-[calc(100vh-3.5rem)]">
            <div className="flex flex-wrap gap-8 pt-2">
              <div className="crux-fade-up" style={{ animationDelay: "0.2s" }}>
                <p className="crux-mono text-[10px] text-white/70">MAX TENSION</p>
                <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  <CountUp end={88} suffix="%" durationMs={1600} />
                </p>
              </div>
              <div
                className="crux-fade-up"
                style={{ animationDelay: "0.35s" }}
              >
                <p className="crux-mono text-[10px] text-white/70">HIP MOBILITY</p>
                <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  <CountUp end={1.8} suffix="m" durationMs={1800} decimals={1} />
                </p>
              </div>
            </div>

            <div
              className="crux-fade-up max-w-md"
              style={{ animationDelay: "0.45s" }}
            >
              <h1 className="text-2xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-4xl">
                Bouldering
                <br />
                AI Coach
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
                简洁、专业的攀爬动作分析。上传视频，获取带时间戳的教练级反馈。
              </p>
            </div>

            <div
              className="crux-fade-up rounded-sm border border-white/25 bg-white/10 px-3 py-2 backdrop-blur-md"
              style={{ animationDelay: "0.55s" }}
            >
              <div className="mb-1 flex justify-between crux-mono text-[10px] text-white/80">
                <span>00:14.23</span>
                <span>00:42.00</span>
              </div>
              <div className="relative h-1.5 bg-white/20">
                <div
                  className="absolute left-0 top-0 h-full bg-white transition-[width] duration-150 ease-linear"
                  style={{ width: `${scrub}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Orange CTA panel */}
        <aside className="crux-panel-orange order-3 flex flex-col justify-between bg-[var(--crux-orange-panel)] p-6 sm:p-8 lg:col-span-3 lg:min-h-[calc(100vh-3.5rem)]">
          <div>
            <p className="crux-mono text-[10px] font-bold text-[var(--crux-text)]/70">
              01 / FOOT PLACEMENT
            </p>
            <h2 className="mt-4 text-3xl font-black uppercase leading-[0.9] tracking-tight text-[var(--crux-text)] sm:text-4xl lg:text-[2.5rem]">
              Dynamic
              <br />
              Reaction
            </h2>
            <p className="mt-6 text-sm font-bold uppercase tracking-wide text-[var(--crux-text)]">
              Maximize vertical
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--crux-text)]/90">
              重心与踩点一体化评估。从首页进入工作台，上传你的攀爬片段，AI
              将输出可执行的技术建议。
            </p>
            <p className="crux-mono mt-6 text-[10px] text-[var(--crux-text)]/60">
              02 / BODY POSITION — CENTER OF GRAVITY
            </p>
          </div>

          <div className="mt-10">
            <Link
              href="/analyze"
              className="crux-cta group flex w-full items-center justify-between border-2 border-[var(--crux-border)] bg-[var(--crux-text)] px-5 py-4 text-sm font-black uppercase tracking-wider text-[var(--crux-surface)]"
            >
              <span>上传视频分析</span>
              <span className="crux-mono text-xs transition group-hover:translate-x-1">
                →
              </span>
            </Link>
            <p className="crux-mono mt-4 text-center text-[10px] text-[var(--crux-text)]/70">
              ≤3.5MB · 轻量/深度 · 中文/EN
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
