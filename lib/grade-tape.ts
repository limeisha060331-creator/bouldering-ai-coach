import type { BoulderGrade } from "./bouldering-grade";

/**
 * 岩馆用彩色胶带标线路难度，这里沿用同一套编码：
 * 绿 V0–V2 / 黄 V3–V4 / 橙 V5–V6 / 红 V7+。
 * 胶带色是信息，不是装饰。
 */
export function gradeTapeColor(grade?: string | null): string {
  const raw = String(grade ?? "").trim();
  const n = Number.parseInt(raw.replace(/^v/i, ""), 10);
  if (Number.isNaN(n)) return "var(--crux-border-subtle)";
  if (n <= 2) return "var(--tape-green)";
  if (n <= 4) return "var(--tape-yellow)";
  if (n <= 6) return "var(--tape-orange)";
  return "var(--tape-red)";
}

export function gradeTapeName(grade?: string | null): string {
  const raw = String(grade ?? "").trim();
  const n = Number.parseInt(raw.replace(/^v/i, ""), 10);
  if (Number.isNaN(n)) return "未标难度";
  if (n <= 2) return "绿色带";
  if (n <= 4) return "黄色带";
  if (n <= 6) return "橙色带";
  return "红色带";
}

export function formatGrade(grade: BoulderGrade | string | null | undefined): string {
  return grade ? String(grade) : "—";
}
