import type { AnalysisRecord, StructuredReport } from "./types";
import { parseAnalysis } from "./parse-analysis";

export const PDF_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://bouldering-ai-coach.vercel.app";

/** 压缩为一句摘要，避免 PDF 照搬长文 */
export function summarizeLine(text: string, maxLen = 58): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const sentence = t.match(/^[^。！？.!?\n]+[。！？.!?]?/)?.[0] ?? t;
  if (sentence.length <= maxLen) return sentence;
  return `${sentence.slice(0, maxLen - 1)}…`;
}

function parseNumberedBlock(raw: string): { label: string; body: string } | null {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  const m = oneLine.match(/^(\d+)[.、)\]]\s*([^：:]+)[：:]\s*(.+)$/);
  if (m) return { label: m[2].trim(), body: m[3].trim() };
  const m2 = oneLine.match(/^(\d+)[.、)\]]\s*(.+)$/);
  if (m2) {
    const rest = m2[2].trim();
    const colon = rest.indexOf("：") >= 0 ? rest.indexOf("：") : rest.indexOf(":");
    if (colon > 0) {
      return {
        label: rest.slice(0, colon).trim(),
        body: rest.slice(colon + 1).trim(),
      };
    }
    return { label: rest, body: "" };
  }
  return null;
}

export type PdfDimensionItem = { label?: string; text: string };
export type PdfImprovementItem = { title: string; text: string };

export function summarizeDimensions(
  structured: StructuredReport
): PdfDimensionItem[] {
  const items: PdfDimensionItem[] = [];

  for (const raw of structured.dimensionBullets) {
    const parsed = parseNumberedBlock(raw);
    if (parsed) {
      const text = parsed.body
        ? summarizeLine(parsed.body, 56)
        : summarizeLine(parsed.label, 56);
      items.push({ label: parsed.label, text });
    } else {
      items.push({ text: summarizeLine(raw, 58) });
    }
    if (items.length >= 3) break;
  }

  if (items.length === 0 && structured.dimensionSummary) {
    const chunks = structured.dimensionSummary
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const chunk of chunks) {
      const parsed = parseNumberedBlock(chunk);
      if (parsed) {
        items.push({
          label: parsed.label,
          text: summarizeLine(parsed.body || parsed.label, 68),
        });
      } else {
        items.push({ text: summarizeLine(chunk, 58) });
      }
      if (items.length >= 3) break;
    }
  }

  return items;
}

export function summarizeImprovements(
  structured: StructuredReport
): PdfImprovementItem[] {
  return structured.improvementBlocks.slice(0, 2).map((b) => {
    const source =
      b.practice?.trim() ||
      b.strength?.trim() ||
      b.lines.find((l) => l.trim())?.trim() ||
      b.title;
    return {
      title: b.title.replace(/^\d+[.、)\]]\s*/, "").trim(),
      text: summarizeLine(source, 64),
    };
  });
}

export function formatPdfVideoTime(createdAt: string): string {
  const d = new Date(createdAt);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${mo}/${day} ${h}:${mi}`;
}

export type PdfContent = {
  videoLabel: string;
  timeLabel: string;
  gradeLine: string | null;
  score: number | null;
  highlight: string | null;
  dimensions: PdfDimensionItem[];
  improvements: PdfImprovementItem[];
};

export function buildPdfContent(
  record: AnalysisRecord,
  videoIndex: number | null
): PdfContent {
  const parsed = parseAnalysis(record.analysis);
  const structured = parsed.structured;

  const idx =
    videoIndex != null && videoIndex > 0
      ? videoIndex
      : null;

  const gradeParts: string[] = [];
  if (record.grade) gradeParts.push(record.grade);
  if (record.ascentMeters != null && record.ascentMeters > 0) {
    gradeParts.push(`${record.ascentMeters}m`);
  }

  return {
    videoLabel: idx != null ? `视频 ${String(idx).padStart(2, "0")}` : "视频 —",
    timeLabel: formatPdfVideoTime(record.createdAt),
    gradeLine: gradeParts.length > 0 ? gradeParts.join(" · ") : null,
    score: record.score ?? parsed.score,
    highlight: record.highlight
      ? summarizeLine(record.highlight, 96)
      : null,
    dimensions: summarizeDimensions(structured),
    improvements: summarizeImprovements(structured),
  };
}
