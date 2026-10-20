import type { DayStat } from "@lib/climbing-stats";

type Props = {
  days: DayStat[];
  locale?: "zh" | "en";
};

const W = 860;
const H = 200;
const PAD = { t: 14, r: 16, b: 30, l: 46 };

function linePath(
  values: number[],
  max: number,
  innerW: number,
  innerH: number
): string {
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
      <div className="empty">
        <p className="t">{zh ? "还没有记录" : "No sessions yet"}</p>
        <p className="h">
          {zh
            ? "完成一次视频分析，并在登记表里填上爬升高度，这里就会开始画曲线。"
            : "Complete an analysis with ascent height to see trends."}
        </p>
      </div>
    );
  }

  const ascentVals = days.map((d) => d.ascentM);
  const gradeVals = days.map((d) => d.maxGrade ?? 0);
  const maxAscent = Math.max(...ascentVals, 1);
  const maxGrade = Math.max(...gradeVals, 1);

  const ascentPath = linePath(ascentVals, maxAscent, innerW, innerH);
  const gradePath = linePath(gradeVals, maxGrade, innerW, innerH);

  const labelClass = "fill-[var(--crux-text-muted)] text-[9px]";

  function yTicks(max: number) {
    return [0, 0.5, 1].map((f) => ({
      y: PAD.t + innerH - f * innerH,
      value: f * max,
    }));
  }

  return (
    <div className="space-y-9">
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="h2 !text-[0.9375rem]">
            {zh ? "每日总爬升" : "Daily ascent"}
          </h2>
          <span className="mono">{zh ? "米" : "m"}</span>
        </div>
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
            stroke="var(--crux-border)"
            strokeWidth="1"
          />
          {yTicks(maxAscent).map((tk, i) => (
            <g key={`t-${i}`}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={tk.y}
                y2={tk.y}
                stroke="var(--crux-hair)"
                strokeWidth="1"
              />
              <text
                x={PAD.l - 10}
                y={tk.y + 3}
                textAnchor="end"
                className={labelClass}
              >
                {Math.round(tk.value * 10) / 10}
              </text>
            </g>
          ))}
          <path
            d={ascentPath}
            fill="none"
            stroke="var(--crux-accent)"
            strokeWidth="2.5"
          />
          {days.map((d, i) => {
            const step = days.length > 1 ? innerW / (days.length - 1) : 0;
            const x = PAD.l + i * step;
            const y = PAD.t + innerH - (d.ascentM / maxAscent) * innerH;
            return (
              <g key={d.date}>
                <circle cx={x} cy={y} r="3.5" fill="var(--crux-accent)" />
                <text x={x} y={H - 8} textAnchor="middle" className={labelClass}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="h2 !text-[0.9375rem]">
            {zh ? "当日最高难度" : "Max grade per day"}
          </h2>
          <span className="mono">V</span>
        </div>
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
            stroke="var(--crux-border)"
            strokeWidth="1"
          />
          {yTicks(maxGrade).map((tk, i) => (
            <g key={`gt-${i}`}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={tk.y}
                y2={tk.y}
                stroke="var(--crux-hair)"
                strokeWidth="1"
              />
              <text
                x={PAD.l - 10}
                y={tk.y + 3}
                textAnchor="end"
                className={labelClass}
              >
                V{Math.round(tk.value)}
              </text>
            </g>
          ))}
          <path
            d={gradePath}
            fill="none"
            stroke="var(--crux-text)"
            strokeWidth="2.5"
          />
          {days.map((d, i) => {
            const step = days.length > 1 ? innerW / (days.length - 1) : 0;
            const x = PAD.l + i * step;
            const g = d.maxGrade ?? 0;
            const y = PAD.t + innerH - (g / maxGrade) * innerH;
            return (
              <g key={`g-${d.date}`}>
                <circle cx={x} cy={y} r="3.5" fill="var(--crux-text)" />
                <text x={x} y={H - 8} textAnchor="middle" className={labelClass}>
                  {d.maxGrade != null ? `V${d.maxGrade}` : "—"}
                </text>
              </g>
            );
          })}
        </svg>
      </section>
    </div>
  );
}
