import type { AnalysisRecord, StructuredReport } from "./types";
import { parseAnalysis } from "./parse-analysis";

export const PDF_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://bouldering-ai-coach.vercel.app";

/** 摘取 1～2 句，控制长度，用于填满单页 PDF */
export function summarizeParagraph(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";

  const sentences: string[] = [];
  const re = /[^。！？.!?\n]+[。！？.!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    sentences.push(m[0].trim());
    if (sentences.join("").length >= maxLen) break;
  }

  let out = sentences.join("");
  if (!out) out = t;
  if (out.length <= maxLen) return out;
  return `${out.slice(0, maxLen - 1)}…`;
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
  const maxItems = 4;
  const lineMax = 108;

  for (const raw of structured.dimensionBullets) {
    const parsed = parseNumberedBlock(raw);
    if (parsed) {
      const text = parsed.body
        ? summarizeParagraph(parsed.body, lineMax)
        : summarizeParagraph(parsed.label, lineMax);
      items.push({ label: parsed.label, text });
    } else {
      items.push({ text: summarizeParagraph(raw, lineMax) });
    }
    if (items.length >= maxItems) break;
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
          text: summarizeParagraph(parsed.body || parsed.label, lineMax),
        });
      } else {
        items.push({ text: summarizeParagraph(chunk, lineMax) });
      }
      if (items.length >= maxItems) break;
    }
  }

  return items;
}

export function summarizeImprovements(
  structured: StructuredReport
): PdfImprovementItem[] {
  return structured.improvementBlocks.slice(0, 3).map((b) => {
    const parts = [
      b.practice?.trim(),
      b.strength?.trim(),
      ...b.lines.map((l) => l.trim()).filter(Boolean),
    ].filter(Boolean) as string[];
    const source = parts.join(" ") || b.title;
    return {
      title: b.title.replace(/^\d+[.、)\]]\s*/, "").trim(),
      text: summarizeParagraph(source, 100),
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
  gradeLine: string | null;
  score: number | null;
  highlight: string | null;
  dimensions: PdfDimensionItem[];
  improvements: PdfImprovementItem[];
  overall: string | null;
};

export function buildPdfContent(
  record: AnalysisRecord,
  videoIndex: number | null
): PdfContent {
  const parsed = parseAnalysis(record.analysis);
  const structured = parsed.structured;

  const idx =
    videoIndex != null && videoIndex > 0 ? videoIndex : null;

  const gradeParts: string[] = [];
  if (record.grade) gradeParts.push(record.grade);
  if (record.ascentMeters != null && record.ascentMeters > 0) {
    gradeParts.push(`爬升 ${record.ascentMeters}m`);
  }

  return {
    videoLabel: idx != null ? `视频 ${String(idx).padStart(2, "0")}` : "视频 —",
    gradeLine: gradeParts.length > 0 ? gradeParts.join(" · ") : null,
    score: record.score ?? parsed.score,
    highlight: record.highlight
      ? summarizeParagraph(record.highlight, 150)
      : parsed.highlight
        ? summarizeParagraph(parsed.highlight, 150)
        : null,
    dimensions: summarizeDimensions(structured),
    improvements: summarizeImprovements(structured),
    overall: structured.overallAdvice
      ? summarizeParagraph(structured.overallAdvice, 130)
      : null,
  };
}
