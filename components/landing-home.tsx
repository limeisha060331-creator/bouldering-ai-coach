"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CountUp } from "@/components/count-up";
import { CruxHeader } from "@/components/crux-header";
import { listAnalysisRecords } from "@/lib/analysis-store";
import {
  averageScore,
  bestGradeLabel,
  countThisMonth,
  scoreBarValue,
  sumAscentMeters,
} from "@/lib/climbing-stats";
import { formatRecordDate } from "@/lib/record-display";
import { gradeTapeColor } from "@/lib/grade-tape";
import type { AnalysisRecord } from "@/lib/types";

const TICKER_TERMS = [
  "FLAG",
  "FOOT CUT",
  "HESITATION",
  "BARN DOOR",
  "BETA",
  "ONE MORE GO",
];

function formatMeters(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

export function LandingHome() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRecords(await listAnalysisRecords());
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 初始记录来自异步云端读取，不是同步 setState 级联渲染。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const totalAscentM = useMemo(() => sumAscentMeters(records), [records]);
  const recent = records.slice(0, 4);
  const chartRecords = records.slice(0, 8).reverse();
  const monthTotal = countThisMonth(records);
  const avg = averageScore(records);
  const top = bestGradeLabel(records);
  const latest = records[0];
  const latestNote = records.find((r) => r.sessionNote?.trim())?.sessionNote;

  const latestChip = loading
    ? "读取中…"
    : latest
      ? `${latest.grade ?? "未标"} · ${
          typeof latest.score === "number" ? `${latest.score} 分` : "—"
        }`
      : "等待第一条记录";
  const latestBar = latest ? scoreBarValue(latest) : 0;
  const ascentBar =
    totalAscentM > 0 ? Math.min(100, Math.max(6, totalAscentM / 2)) : 0;
  const secondaryHref = latest ? `/analysis/${latest.id}` : "/progress";

  return (
    <div className="landing-neon">
      <CruxHeader variant="landing" />

      <section className="neon-hero" aria-labelledby="neon-hero-title">
        <div className="neon-hero__media" aria-hidden>
          <Image
            src="/hero-climb.jpg"
            alt=""
            fill
            priority
            quality={92}
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="neon-hero__img"
          />
          <span className="neon-hero__veil" />
        </div>

        <span className="neon-hero__ghost" aria-hidden>
          BETA
        </span>

        <div className="neon-hud" aria-hidden>
          <span className="neon-focus" />
          <span className="neon-focus-dot" />
          <span className="neon-scan">AI VISION / POSE TRACKING</span>

          <div className="neon-chip neon-chip--a">
            <span className="neon-chip__k">最新分析 / LATEST</span>
            <strong>{latestChip}</strong>
            <span className="neon-chip__bar">
              <i style={{ width: `${latestBar}%` }} />
            </span>
          </div>

          <div className="neon-chip neon-chip--b">
            <span className="neon-chip__k">累计爬升 / TOTAL ASCENT</span>
            <strong>{formatMeters(totalAscentM)} 米</strong>
            <span className="neon-chip__bar">
              <i style={{ width: `${ascentBar}%` }} />
            </span>
          </div>
        </div>

        <div className="neon-hero__content">
          <p className="neon-kicker">
            <i aria-hidden />
            CRUX / AI CLIMB ANALYSIS
          </p>

          <h1 id="neon-hero-title" className="neon-title">
            下一次，
            <br />
            别掉在
            <br />
            <span className="neon-title__accent">同一步</span>。
          </h1>

          <p className="neon-sub">
            逐秒拆解你的抱石动作。
            <b>哪里发力、哪里脱脚、下一步怎么练</b>，一次说清。
          </p>

          <div className="neon-actions">
            <Link href="/analyze" className="neon-btn">
              上传视频，开练 <span aria-hidden>↗</span>
            </Link>
            <Link href={secondaryHref} className="neon-link">
              {latest ? "看最近一次分析" : "查看训练趋势"}
            </Link>
          </div>
        </div>

        <div className="neon-stats">
          <div className="neon-stat">
            <span className="neon-stat__v">
              <CountUp
                end={totalAscentM}
                decimals={totalAscentM % 1 === 0 ? 0 : 1}
                durationMs={1400}
              />
              <small>M</small>
            </span>
            <span className="neon-stat__l">
              累计爬升 <span>/ ASCENT</span>
            </span>
          </div>
          <div className="neon-stat">
            <span className="neon-stat__v">
              {records.length}
              <small>RUNS</small>
            </span>
            <span className="neon-stat__l">
              已完成分析 <span>/ ANALYSES</span>
            </span>
          </div>
          <div className="neon-stat">
            <span className="neon-stat__v">{top ?? "—"}</span>
            <span className="neon-stat__l">
              最高难度 <span>/ BEST GRADE</span>
            </span>
          </div>
        </div>

        <div className="neon-ticker" aria-hidden>
          <div className="neon-ticker__track">
            {[...TICKER_TERMS, ...TICKER_TERMS].map((term, index) => (
              <span key={`${term}-${index}`}>
                {term}
                <i>✦</i>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="training-log" className="neon-log" aria-labelledby="log-title">
        <div className="neon-log__inner">
          <header className="neon-log__head">
            <div>
              <p className="neon-kicker neon-kicker--plain">
                <i aria-hidden />
                TRAINING LOG
              </p>
              <h2 id="log-title" className="neon-log__title">
                最近线路
              </h2>
            </div>
            <Link href="/progress" className="neon-log__all">
              全部记录 ↗
            </Link>
          </header>

          {loading ? (
            <div className="neon-empty">
              <span className="neon-empty__num">···</span>
              <div>
                <p className="neon-empty__h">正在读取本机记录</p>
                <p className="neon-empty__p">稍等一下，训练数据就在这台设备里。</p>
              </div>
            </div>
          ) : recent.length === 0 ? (
            <div className="neon-empty">
              <span className="neon-empty__num">00</span>
              <div>
                <p className="neon-empty__h">还没有记录</p>
                <p className="neon-empty__p">
                  上传第一段视频，分析完就会出现在这里。难度、得分和爬升一起记下来。
                </p>
              </div>
              <Link href="/analyze" className="neon-empty__cta">
                上传第一个视频 <span aria-hidden>↗</span>
              </Link>
            </div>
          ) : (
            <div className="neon-cards">
              {recent.map((record) => (
                <Link
                  key={record.id}
                  href={`/analysis/${record.id}`}
                  className="neon-card"
                >
                  <span
                    className="neon-card__tape"
                    style={{ background: gradeTapeColor(record.grade) }}
                    aria-hidden
                  />
                  <div className="neon-card__top">
                    <span className="neon-card__grade">
                      {record.grade ?? "未标"}
                    </span>
                    <span className="neon-card__date">
                      {formatRecordDate(record.createdAt)}
                    </span>
                  </div>
                  <div className="neon-card__score">
                    {typeof record.score === "number" ? (
                      <>
                        <b>{record.score}</b>
                        <span>分</span>
                      </>
                    ) : (
                      <span className="neon-card__dash">—</span>
                    )}
                  </div>
                  <div className="neon-card__meta">
                    <span>
                      {record.depth === "deep" ? "深度分析" : "快速分析"}
                    </span>
                    {record.ascentMeters != null &&
                      record.ascentMeters > 0 && (
                        <span>{formatMeters(record.ascentMeters)} m</span>
                      )}
                  </div>
                  <span className="neon-card__arrow" aria-hidden>
                    ↗
                  </span>
                </Link>
              ))}
            </div>
          )}

          <div className="neon-panels">
            <div className="neon-panel">
              <div className="neon-panel__head">
                <span>本月概览</span>
                <span>THIS MONTH</span>
              </div>
              <div className="neon-kpis">
                <div>
                  <span>本月分析</span>
                  <strong>
                    {monthTotal}
                    <small>次</small>
                  </strong>
                </div>
                <div>
                  <span>平均得分</span>
                  <strong>
                    {avg ?? "—"}
                    {avg != null && <small>分</small>}
                  </strong>
                </div>
                <div>
                  <span>最高难度</span>
                  <strong>{top ?? "—"}</strong>
                </div>
              </div>
            </div>

            <div className="neon-panel neon-panel--chart">
              <div className="neon-panel__head">
                <span>最近得分</span>
                <span>
                  {chartRecords.length > 0
                    ? `${formatRecordDate(chartRecords[0].createdAt)} – ${
                        formatRecordDate(
                          chartRecords[chartRecords.length - 1].createdAt
                        )
                      }`
                    : "SCORE TREND"}
                </span>
              </div>
              {chartRecords.length > 0 ? (
                <>
                  <div
                    className="neon-bars"
                    role="img"
                    aria-label="最近几次分析的得分"
                  >
                    {chartRecords.map((record, index) => (
                      <i
                        key={record.id}
                        style={{ height: `${scoreBarValue(record)}%` }}
                        data-now={index === chartRecords.length - 1}
                      />
                    ))}
                  </div>
                  <div className="neon-bar-labels" aria-hidden>
                    {chartRecords.map((record) => (
                      <span key={record.id}>
                        {new Date(record.createdAt).toLocaleDateString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="neon-panel__empty">
                  完成两次分析后，这里会出现得分走势。
                </p>
              )}
            </div>

            <div className="neon-panel neon-panel--note">
              <div className="neon-panel__head">
                <span>最近一次备注</span>
                <span>仅自己可见</span>
              </div>
              <p className="neon-note">
                {latestNote?.trim() ||
                  "还没有备注。分析前写一句「这次想解决什么」，下次就能对上。"}
              </p>
              <Link href="/analyze" className="neon-panel__link">
                去写一条备注 ↗
              </Link>
            </div>
          </div>

          <p className="neon-log__foot">
            记录保存在你的账号里，换设备登录后自动同步。
          </p>
        </div>
      </section>
    </div>
  );
}
