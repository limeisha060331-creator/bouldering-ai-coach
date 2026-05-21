"use client";

import type { DayStat } from "@/lib/climbing-stats";

type Props = {
  days: DayStat[];
  locale?: "zh" | "en";
};

const W = 640;
const H = 220;
const PAD = { t: 16, r: 16, b: 28, l: 44 };

function linePath(values: number[], max: number, innerW: number, innerH: number): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = PAD.l + i * step;
      const y = PAD.t + innerH - (max > 0 ? (v / max) * innerH : 0);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ProgressCharts({ days, locale = "zh" }: Props) {
  const zh = locale === "zh";
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  if (days.length === 0) {
    return (
      <p className="text-sm text-[var(--crux-text-muted)]">
        {zh
          ? "暂无记录。完成一次视频分析并填写爬升高度后，这里会显示进步曲线。"
          : "No sessions yet. Complete an analysis with ascent height to see trends."}
      </p>
    );
  }

  const ascentVals = days.map((d) => d.ascentM);
  const gradeVals = days.map((d) => d.maxGrade ?? 0);
  const maxAscent = Math.max(...ascentVals, 1);
  const maxGrade = Math.max(...gradeVals, 10);

  const ascentPath = linePath(ascentVals, maxAscent, innerW, innerH);
  const gradePath = linePath(gradeVals, maxGrade, innerW, innerH);

  return (
    <div className="space-y-10">
      <div>
        <p className="crux-label mb-3">
          {zh ? "每日总爬升（米）" : "Daily ascent (m)"}
        </p>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full border-2 border-[var(--crux-border)] bg-[var(--crux-surface)]"
          role="img"
          aria-label={zh ? "爬升距离折线图" : "Ascent line chart"}
        >
          <line
            x1={PAD.l}
            y1={PAD.t + innerH}
            x2={W - PAD.r}
            y2={PAD.t + innerH}
            stroke="var(--crux-border-subtle)"
            strokeWidth="1"
          />
          <path
            d={ascentPath}
            fill="none"
            stroke="var(--crux-orange-panel)"
            strokeWidth="3"
          />
          {days.map((d, i) => {
            const step = days.length > 1 ? innerW / (days.length - 1) : 0;
            const x = PAD.l + i * step;
            const y = PAD.t + innerH - (d.ascentM / maxAscent) * innerH;
            return (
              <g key={d.date}>
                <circle cx={x} cy={y} r="4" fill="var(--crux-orange-panel)" />
                <text
                  x={x}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-[var(--crux-text-muted)] text-[9px]"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div>
        <p className="crux-label mb-3">
          {zh ? "当日最高难度（V 级）" : "Max grade per day (V)"}
        </p>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full border-2 border-[var(--crux-border)] bg-[var(--crux-surface)]"
          role="img"
          aria-label={zh ? "难度折线图" : "Grade line chart"}
        >
          <line
            x1={PAD.l}
            y1={PAD.t + innerH}
            x2={W - PAD.r}
            y2={PAD.t + innerH}
            stroke="var(--crux-border-subtle)"
            strokeWidth="1"
          />
          <path
            d={gradePath}
            fill="none"
            stroke="var(--crux-text)"
            strokeWidth="3"
          />
          {days.map((d, i) => {
            const step = days.length > 1 ? innerW / (days.length - 1) : 0;
            const x = PAD.l + i * step;
            const g = d.maxGrade ?? 0;
            const y = PAD.t + innerH - (g / maxGrade) * innerH;
            return (
              <g key={`g-${d.date}`}>
                <circle cx={x} cy={y} r="4" fill="var(--crux-text)" />
                <text
                  x={x}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-[var(--crux-text-muted)] text-[9px]"
                >
                  {d.maxGrade != null ? `V${d.maxGrade}` : "—"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
