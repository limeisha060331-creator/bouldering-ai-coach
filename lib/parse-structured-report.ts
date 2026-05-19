import type { StructuredReport, ImprovementBlock } from "./types";

const LINE_TIMESTAMP =
  /^(?:[-*•]\s*)?(?:\[)?(\d{1,2}):(\d{2})(?:\])?(?:\s*[-–—]\s*|\s+)/;

function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").trim();
}

function isMetaLine(line: string): boolean {
  return (
    LINE_TIMESTAMP.test(line) ||
    /(?:动作)?评分[：:]/.test(line) ||
    /(?:金句|教练金句|关键建议)[：:]/.test(line) ||
    /^\d{1,3}\s*\/\s*100/.test(line)
  );
}

type SectionKey = "dimension" | "improvement" | "overall";

function detectSection(line: string): SectionKey | null {
  const t = stripMd(line);
  if (/核心维度评估/.test(t)) return "dimension";
  if (/最终改进方案|针对性专项练习|改进方案/.test(t)) return "improvement";
  if (/^整体建议/.test(t) || t === "整体建议") return "overall";
  return null;
}

const NUMBERED_BLOCK =
  /^\s*(\d+)[.、．]\s*\*\*(.+?)\*\*[：:]?\s*(.*)$|^\s*(\d+)[.、．]\s*(.+?)[：:]\s*(.*)$/;

function parseImprovementBlocks(lines: string[]): {
  intro: string;
  blocks: ImprovementBlock[];
} {
  const introLines: string[] = [];
  const blocks: ImprovementBlock[] = [];
  let current: ImprovementBlock | null = null;

  function flush() {
    if (current) {
      blocks.push(current);
      current = null;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const numMatch = line.match(NUMBERED_BLOCK);
    if (numMatch) {
      flush();
      const title = stripMd(numMatch[2] || numMatch[5] || "");
      const tail = (numMatch[3] || numMatch[6] || "").trim();
      current = { title, practice: undefined, strength: undefined, lines: [] };
      if (tail) current.lines.push(stripMd(tail));
      continue;
    }

    const practiceMatch = line.match(
      /^\s*[*-]?\s*\*\*练习[：:]\*\*\s*(.*)$|^\s*[*-]?\s*练习[：:]\s*(.*)$/i
    );
    const strengthMatch = line.match(
      /^\s*[*-]?\s*\*\*力量训练[：:]\*\*\s*(.*)$|^\s*[*-]?\s*力量训练[：:]\s*(.*)$/i
    );

    if (practiceMatch) {
      if (!current) {
        introLines.push(stripMd(line));
        continue;
      }
      const val = stripMd(practiceMatch[1] || practiceMatch[2] || "");
      current.practice = current.practice
        ? `${current.practice}\n${val}`
        : val;
      continue;
    }

    if (strengthMatch) {
      if (!current) {
        introLines.push(stripMd(line));
        continue;
      }
      const val = stripMd(strengthMatch[1] || strengthMatch[2] || "");
      current.strength = current.strength
        ? `${current.strength}\n${val}`
        : val;
      continue;
    }

    const bullet = line.replace(/^\s*[*-]\s*/, "").trim();
    const cleaned = stripMd(bullet);

    if (current) {
      current.lines.push(cleaned);
    } else {
      introLines.push(cleaned);
    }
  }

  flush();
  return { intro: introLines.join("\n").trim(), blocks };
}

function parseDimensionBullets(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const bullet = t.replace(/^\s*[*-]\s*/, "").trim();
    const cleaned = stripMd(bullet);
    if (
      cleaned &&
      !/^核心维度/.test(cleaned) &&
      cleaned.length > 2
    ) {
      items.push(cleaned);
    }
  }
  return items;
}

/** 从 AI 全文中提取「核心维度 / 改进方案 / 整体建议」结构化块 */
export function parseStructuredReport(raw: string): StructuredReport {
  const lines = raw.split("\n");
  let mode: SectionKey | "none" = "none";
  const dimensionLines: string[] = [];
  const improvementLines: string[] = [];
  const overallLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isMetaLine(trimmed)) continue;

    const section = detectSection(trimmed);
    if (section) {
      mode = section;
      const rest = stripMd(
        trimmed.replace(/.*?(核心维度评估|最终改进方案|针对性专项|改进方案|整体建议)[^：:]*[：:]?/i, "")
      );
      if (rest && rest.length > 4) {
        if (mode === "dimension") dimensionLines.push(rest);
        else if (mode === "improvement") improvementLines.push(rest);
        else if (mode === "overall") overallLines.push(rest);
      }
      continue;
    }

    if (mode === "dimension") dimensionLines.push(trimmed);
    else if (mode === "improvement") improvementLines.push(trimmed);
    else if (mode === "overall") overallLines.push(trimmed);
  }

  const dimensionText = dimensionLines.join("\n").trim();
  const { intro: improvementIntro, blocks: improvementBlocks } =
    parseImprovementBlocks(improvementLines);
  const overallAdvice = overallLines.map(stripMd).join("\n").trim() || null;

  const dimensionBullets = parseDimensionBullets(dimensionText);
  const dimensionSummary =
    dimensionBullets.length > 0
      ? null
      : dimensionText || null;

  const hasStructuredContent =
    dimensionBullets.length > 0 ||
    Boolean(dimensionSummary) ||
    improvementBlocks.length > 0 ||
    Boolean(improvementIntro) ||
    Boolean(overallAdvice);

  return {
    dimensionSummary,
    dimensionBullets,
    improvementIntro: improvementIntro || null,
    improvementBlocks,
    overallAdvice,
    hasStructuredContent,
  };
}
