export const BOULDER_GRADES = [
  "V0",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
] as const;

export type BoulderGrade = (typeof BOULDER_GRADES)[number];

/** 从 AI 正文或文件名中尝试解析 V 级 */
export function parseGradeFromText(text: string): BoulderGrade | null {
  const m = text.match(/\bV(10|[0-9])\b/i);
  if (!m) return null;
  const g = `V${m[1]}` as BoulderGrade;
  return BOULDER_GRADES.includes(g) ? g : null;
}

export function gradeToNumber(grade: BoulderGrade | string | undefined): number | null {
  if (!grade) return null;
  const m = String(grade).match(/^V(10|[0-9])$/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}
