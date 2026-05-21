import type { AnalysisRecord } from "./types";

/** 上传后自动生成的十六进制/UUID 文件名，不在 UI 展示 */
export function isOpaqueFileName(name: string): boolean {
  const base = name.replace(/\.[^.]+$/, "").trim();
  if (!base) return true;
  if (/^[a-f0-9-]{20,}$/i.test(base)) return true;
  if (/^[a-f0-9]{12,}$/i.test(base)) return true;
  if (base.length >= 28 && !/[\u4e00-\u9fffA-Za-z]/.test(base)) return true;
  return false;
}

export function formatRecordDate(
  createdAt: string,
  style: "short" | "full" = "short"
): string {
  const d = new Date(createdAt);
  if (style === "full") {
    return d.toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

/** 首页历史列表副标题：日期 · 难度 · 备注/爬升，不含乱码文件名 */
export function formatSessionListMeta(record: AnalysisRecord): string {
  const parts: string[] = [
    formatRecordDate(record.createdAt),
    record.grade ?? "未标难度",
  ];

  const note = record.sessionNote?.trim();
  if (note) {
    parts.push(note);
  } else if (!isOpaqueFileName(record.fileName)) {
    const base = record.fileName.replace(/\.[^.]+$/, "");
    if (base.length <= 24) parts.push(base);
  }

  if (record.ascentMeters != null && record.ascentMeters > 0) {
    const m =
      record.ascentMeters % 1 === 0
        ? record.ascentMeters
        : record.ascentMeters.toFixed(1);
    parts.push(`${m}m 爬升`);
  }

  return parts.join(" · ");
}

/** 分析页/列表主标题 */
export function formatHistoryTitle(
  record: Pick<AnalysisRecord, "fileName" | "sessionNote" | "createdAt" | "grade">,
  index?: number
): string {
  const note = record.sessionNote?.trim();
  if (note) return note;
  if (!isOpaqueFileName(record.fileName)) {
    return record.fileName.replace(/\.[^.]+$/, "");
  }
  if (index != null && index > 0) {
    return `视频 ${String(index).padStart(2, "0")}`;
  }
  return formatRecordDate(record.createdAt, "full");
}
