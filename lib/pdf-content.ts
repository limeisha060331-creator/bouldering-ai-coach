import type { AnalysisRecord, ImprovementBlock, StructuredReport } from "./types";
import { parseAnalysis } from "./parse-analysis";

export const PDF_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://bouldering-ai-coach.vercel.app";

function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").trim();
}

/** 摘取 1～2 句，控制长度 */
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

type DimensionGroup = { label: string; points: string[] };

/** 把扁平 bullet 列表合并为「标题 + 子要点」结构（与网站展示一致） */
function buildDimensionGroups(bullets: string[]): DimensionGroup[] {
  const groups: DimensionGroup[] = [];
  let current: DimensionGroup | null = null;

  const flush = () => {
    if (current && (current.label || current.points.length > 0)) {
      groups.push(current);
    }
    current = null;
  };

  for (const raw of bullets) {
    const line = stripMd(raw.replace(/^\s*[-*•]\s*/, "").trim());
    if (!line || /^核心维度/.test(line)) continue;

    const withBody = line.match(
      /^(\d+)[.、．)\]]\s*(.+?)[：:]\s*(.+)$/
    );
    const titleOnly = line.match(/^(\d+)[.、．)\]]\s*(.+?)[：:]\s*$/);
    const titleNoColon = line.match(/^(\d+)[.、．)\]]\s*(.+)$/);

    if (withBody) {
      flush();
      current = {
        label: withBody[2].trim(),
        points: [withBody[3].trim()],
      };
      continue;
    }

    if (titleOnly) {
      flush();
      current = { label: titleOnly[2].trim(), points: [] };
      continue;
    }

    if (titleNoColon) {
      const rest = titleNoColon[2].trim();
      const colonAt =
        rest.indexOf("：") >= 0 ? rest.indexOf("：") : rest.indexOf(":");
      if (colonAt > 0 && colonAt < 40) {
        flush();
        current = {
          label: rest.slice(0, colonAt).trim(),
          points: [rest.slice(colonAt + 1).trim()].filter(Boolean),
        };
        continue;
      }
    }

    if (current) {
      current.points.push(line);
    } else {
      flush();
      current = { label: "", points: [line] };
    }
  }

  flush();
  return groups;
}

export type PdfDimensionItem = { label: string; text: string };

export function summarizeDimensions(
  structured: StructuredReport
): PdfDimensionItem[] {
  const groups = buildDimensionGroups(structured.dimensionBullets);
  const items: PdfDimensionItem[] = [];

  for (const g of groups.slice(0, 4)) {
    const label = g.label.trim();
    const bodySource = g.points.length > 0 ? g.points.join(" ") : label;
    const text = summarizeParagraph(bodySource, label ? 118 : 130);

    if (label) {
      items.push({ label, text });
    } else {
      items.push({ label: "", text });
    }
  }

  if (items.length === 0 && structured.dimensionSummary) {
    const chunks = structured.dimensionSummary
      .split(/\n+/)
      .map((s) => stripMd(s.trim()))
      .filter(Boolean);
    for (const chunk of chunks.slice(0, 4)) {
      const m = chunk.match(/^(\d+)[.、．)\]]\s*(.+?)[：:]\s*(.+)$/);
      if (m) {
        items.push({
          label: m[2].trim(),
          text: summarizeParagraph(m[3], 118),
        });
      } else {
        items.push({ label: "", text: summarizeParagraph(chunk, 130) });
      }
    }
  }

  return items;
}

export type PdfImprovementItem = { title: string; text: string };

function summarizeOneImprovement(b: ImprovementBlock): PdfImprovementItem {
  const title = b.title.replace(/^\d+[.、．)\]]\s*/, "").trim();

  if (b.practice && b.strength) {
    return {
      title,
      text: `练习：${summarizeParagraph(b.practice, 58)}；力量：${summarizeParagraph(b.strength, 48)}`,
    };
  }
  if (b.practice) {
    return { title, text: `练习：${summarizeParagraph(b.practice, 105)}` };
  }
  if (b.strength) {
    return { title, text: `力量：${summarizeParagraph(b.strength, 105)}` };
  }
  const line = b.lines.find((l) => l.trim().length > 8);
  if (line) {
    return { title, text: summarizeParagraph(line, 105) };
  }
  return { title, text: summarizeParagraph(title, 80) };
}

export function summarizeImprovements(
  structured: StructuredReport
): PdfImprovementItem[] {
  const blocks = structured.improvementBlocks.slice(0, 3);
  if (blocks.length > 0) {
    return blocks.map(summarizeOneImprovement);
  }
  if (structured.improvementIntro) {
    return [
      {
        title: "改进方向",
        text: summarizeParagraph(structured.improvementIntro, 110),
      },
    ];
  }
  return [];
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
    timeLabel: formatPdfVideoTime(record.createdAt),
    gradeLine: gradeParts.length > 0 ? gradeParts.join(" · ") : null,
    score: record.score ?? parsed.score,
    highlight: record.highlight
      ? summarizeParagraph(record.highlight, 140)
      : parsed.highlight
        ? summarizeParagraph(parsed.highlight, 140)
        : null,
    dimensions: summarizeDimensions(structured),
    improvements: summarizeImprovements(structured),
    overall: structured.overallAdvice
      ? summarizeParagraph(structured.overallAdvice, 110)
      : null,
  };
}
