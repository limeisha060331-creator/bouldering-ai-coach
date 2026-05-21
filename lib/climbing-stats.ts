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
