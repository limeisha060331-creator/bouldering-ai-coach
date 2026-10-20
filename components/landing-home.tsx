"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CountUp } from "@/components/count-up";
import { CruxHeader } from "@/components/crux-header";
import { listAnalysisRecords } from "@/lib/analysis-db";
import { sumAscentMeters } from "@/lib/climbing-stats";
import { formatRecordDate } from "@/lib/record-display";
import { gradeToNumber } from "@/lib/bouldering-grade";
import { gradeTapeColor } from "@/lib/grade-tape";
import type { AnalysisRecord } from "@/lib/types";

function monthCount(records: AnalysisRecord[]): number {
  const now = new Date();
  return records.filter((r) => {
    const d = new Date(r.createdAt);
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  }).length;
}

function averageScore(records: AnalysisRecord[]): number | null {
  const scores = records
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function maxGrade(records: AnalysisRecord[]): string | null {
  let best: { n: number; g: string } | null = null;
  for (const r of records) {
    const n = gradeToNumber(r.grade ?? undefined);
    if (n == null) continue;
    if (!best || n > best.n) best = { n, g: `V${n}` };
  }
  return best?.g ?? null;
}

function scoreBar(record: AnalysisRecord): number {
  if (typeof record.score === "number") {
    return Math.max(6, Math.min(100, record.score));
  }
  const g = gradeToNumber(record.grade ?? undefined);
  return g == null ? 6 : Math.max(6, Math.min(100, (g + 1) * 8));
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
  const recent = records.slice(0, 4);
  const chartRecords = records.slice(0, 8).reverse();
  const monthTotal = monthCount(records);
  const avg = averageScore(records);
  const top = maxGrade(records);
  const latestNote = records.find((r) => r.sessionNote?.trim())?.sessionNote;

  return (
    <div className="crux-page">
      <CruxHeader variant="landing" />

      <div className="landing-grid">
        <section className="hero">
          <Image
            src="/hero-climb.jpg"
            alt="岩馆里一只抓住红色岩点的手"
            fill
            priority
            quality={92}
            sizes="(min-width: 1024px) 70vw, 100vw"
            className="hero__img"
          />
          <div className="hero__veil" aria-hidden />

          <div className="hero__in">
            <div>
              <p className="hero__kicker">抱石训练日志</p>
              <h1 className="hero__title">
                CRUX
                <span className="cn">抱石</span>
                <span className="role">动作解析</span>
              </h1>
              <p className="hero__sub">
                上传一段攀爬视频，拿到逐秒的动作点评，和下一次该练的东西。
              </p>
              <div className="hero__cta">
                <Link href="/analyze" className="btn btn--primary">
                  上传视频分析
                </Link>
                <Link href="/progress" className="btn btn--ghost">
                  查看进步曲线
                </Link>
              </div>
            </div>

            <div className="hero__stats">
              <div>
                <span className="v">
                  <CountUp
                    end={totalAscentM}
                    decimals={totalAscentM % 1 === 0 ? 0 : 1}
                    durationMs={1400}
                  />
                  <small>米</small>
                </span>
                <span className="l">累计爬升</span>
              </div>
              <div>
                <span className="v">
                  {records.length}
                  <small>次</small>
                </span>
                <span className="l">已完成分析</span>
              </div>
              <div>
                <span className="v">{top ?? "—"}</span>
                <span className="l">最高难度</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="rail" aria-label="训练记录">
          <div className="rail__head">
            <span className="t">最近线路</span>
            <Link href="/analyze" className="more">
              全部记录
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="empty m-4">
              <p className="t">还没有记录</p>
              <p className="h">
                上传第一段视频，分析完就会出现在这里，难度和得分一起记下来。
              </p>
              <Link href="/analyze" className="btn btn--sm mt-4">
                上传第一个视频
              </Link>
            </div>
          ) : (
            <ul className="route-list">
              {recent.map((r) => (
                <li key={r.id} data-active={activeId === r.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveId(r.id)}
                    onFocus={() => setActiveId(r.id)}
                    onClick={() => router.push(`/analysis/${r.id}`)}
                  >
                    <span
                      className="tape"
                      style={{ background: gradeTapeColor(r.grade) }}
                      aria-hidden
                    />
                    <div className="route-body">
                      <div className="route-top">
                        <span className="badge">
                          <i
                            style={{ background: gradeTapeColor(r.grade) }}
                            aria-hidden
                          />
                          {r.grade ?? "未标"}
                        </span>
                        <span className="route-date">
                          {formatRecordDate(r.createdAt, "full")}
                        </span>
                      </div>
                      <div className="route-meta">
                        {typeof r.score === "number" && (
                          <span>
                            <b>{r.score}</b> 分
                          </span>
                        )}
                        {r.ascentMeters != null && r.ascentMeters > 0 && (
                          <>
                            <i aria-hidden />
                            <span>
                              <b>
                                {r.ascentMeters % 1 === 0
                                  ? r.ascentMeters
                                  : r.ascentMeters.toFixed(1)}
                              </b>{" "}
                              米
                            </span>
                          </>
                        )}
                        <i aria-hidden />
                        <span>{r.depth === "deep" ? "深度分析" : "快速分析"}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="rail__sum">
            <div>
              <span className="k">本月分析</span>
              <span className="v">{monthTotal} 次</span>
            </div>
            <div>
              <span className="k">平均得分</span>
              <span className="v">{avg ?? "—"}</span>
            </div>
            <div>
              <span className="k">最高难度</span>
              <span className="v">{top ?? "—"}</span>
            </div>
          </div>

          {chartRecords.length > 0 && (
            <div className="rail__chart">
              <div className="h">
                <b>
                  最近 {chartRecords.length} 次得分
                </b>
                <span>
                  {chartRecords[0]
                    ? formatRecordDate(chartRecords[0].createdAt)
                    : ""}{" "}
                  –{" "}
                  {chartRecords[chartRecords.length - 1]
                    ? formatRecordDate(
                        chartRecords[chartRecords.length - 1].createdAt
                      )
                    : ""}
                </span>
              </div>
              <div className="bars" role="img" aria-label="最近几次分析的得分">
                {chartRecords.map((r, i) => (
                  <i
                    key={r.id}
                    style={{ height: `${scoreBar(r)}%` }}
                    data-now={i === chartRecords.length - 1}
                  />
                ))}
              </div>
              <div className="bar-labels" aria-hidden>
                {chartRecords.map((r) => (
                  <span key={r.id}>
                    {new Date(r.createdAt).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rail__note">
            <div className="h">
              最近一次备注
              <span>只在本机保存</span>
            </div>
            <p>
              {latestNote?.trim() ||
                "还没有备注。分析前在登记表里写一句「这次想解决什么」，下次能对上。"}
            </p>
          </div>

          <div className="rail__foot">
            记录保存在这台设备的浏览器里，换设备请先登录。
          </div>
        </aside>
      </div>
    </div>
  );
}
