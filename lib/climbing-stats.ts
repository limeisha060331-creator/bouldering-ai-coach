import { listAnalysisRecords } from "./analysis-db";
import { gradeToNumber } from "./bouldering-grade";
import type { AnalysisRecord } from "./types";

export type DayStat = {
  date: string;
  label: string;
  ascentM: number;
  sessions: number;
  maxGrade: number | null;
  avgGrade: number | null;
};

export function sumAscentMeters(records: AnalysisRecord[]): number {
  return records.reduce((n, r) => n + (r.ascentMeters ?? 0), 0);
}

export function countThisMonth(records: AnalysisRecord[]): number {
  const now = new Date();
  return records.filter((r) => {
    const d = new Date(r.createdAt);
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  }).length;
}

export function averageScore(records: AnalysisRecord[]): number | null {
  const scores = records
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function bestGradeLabel(records: AnalysisRecord[]): string | null {
  let best: { n: number; g: string } | null = null;
  for (const r of records) {
    const n = gradeToNumber(r.grade ?? undefined);
    if (n == null) continue;
    if (!best || n > best.n) best = { n, g: `V${n}` };
  }
  return best?.g ?? null;
}

/** 历史卡片里分数条的百分比；没有分数时用难度估算，保证条形可见 */
export function scoreBarValue(record: AnalysisRecord): number {
  if (typeof record.score === "number") {
    return Math.max(6, Math.min(100, record.score));
  }
  const g = gradeToNumber(record.grade ?? undefined);
  return g == null ? 6 : Math.max(6, Math.min(100, (g + 1) * 8));
}

export async function loadProgressByDay(): Promise<DayStat[]> {
  const records = await listAnalysisRecords();
  const map = new Map<
    string,
    { ascentM: number; sessions: number; grades: number[] }
  >();

  for (const r of records) {
    const d = r.createdAt.slice(0, 10);
    const prev = map.get(d) ?? { ascentM: 0, sessions: 0, grades: [] };
    prev.ascentM += r.ascentMeters ?? 0;
    prev.sessions += 1;
    const gn = gradeToNumber(r.grade);
    if (gn != null) prev.grades.push(gn);
    map.set(d, prev);
  }

  const days = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

  return days.map(([date, v]) => {
    const maxGrade =
      v.grades.length > 0 ? Math.max(...v.grades) : null;
    const avgGrade =
      v.grades.length > 0
        ? Math.round(
            (v.grades.reduce((a, b) => a + b, 0) / v.grades.length) * 10
          ) / 10
        : null;
    const [, m, d] = date.split("-");
    return {
      date,
      label: `${parseInt(m, 10)}/${parseInt(d, 10)}`,
      ascentM: Math.round(v.ascentM * 10) / 10,
      sessions: v.sessions,
      maxGrade,
      avgGrade,
    };
  });
}
