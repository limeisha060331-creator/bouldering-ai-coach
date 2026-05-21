import { parseGradeFromText } from "./bouldering-grade";
import type { AnalysisSegment, BoulderGrade, ParsedAnalysis } from "./types";
import { parseStructuredReport } from "./parse-structured-report";

const LINE_TIMESTAMP =
  /^(?:[-*•]\s*)?(?:\[)?(\d{1,2}):(\d{2})(?:\])?(?:\s*[-–—]\s*|\s+)(.+)$/;

function toSeconds(min: string, sec: string): number {
  return parseInt(min, 10) * 60 + parseInt(sec, 10);
}

export function parseAnalysis(raw: string): ParsedAnalysis {
  const lines = raw.split("\n");
  const segments: AnalysisSegment[] = [];
  const otherLines: string[] = [];

  let score: number | null = null;
  let highlight: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const scoreMatch =
      trimmed.match(/(?:动作)?评分[：:]\s*(\d{1,3})\s*(?:\/\s*100)?/i) ||
      trimmed.match(/(\d{1,3})\s*\/\s*100/) ||
      trimmed.match(/(?:score|rating)[：:\s]+(\d{1,3})\s*(?:\/\s*100)?/i);
    if (scoreMatch && score === null) {
      score = Math.min(100, parseInt(scoreMatch[1], 10));
      continue;
    }

    const highlightMatch = trimmed.match(
      /(?:金句|关键建议|教练金句)[：:]\s*(.+)/i
    ) || trimmed.match(
      /(?:coach\s*line|coach\s*note|highlight)[：:\s]+(.+)/i
    );
    if (highlightMatch) {
      highlight = highlightMatch[1].trim();
      continue;
    }

    if (/^难度[：:]/i.test(trimmed)) {
      continue;
    }

    const tsMatch = trimmed.match(LINE_TIMESTAMP);
    if (tsMatch) {
      const [, min, sec, content] = tsMatch;
      segments.push({
        timestamp: `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
        seconds: toSeconds(min, sec),
        content: content.trim(),
      });
      continue;
    }

    otherLines.push(trimmed);
  }

  if (!highlight && segments.length > 0) {
    highlight = segments[0].content.slice(0, 80);
  }

  const structured = parseStructuredReport(raw);
  const grade = parseGradeFromText(raw);

  return {
    raw,
    score,
    highlight,
    segments,
    summary: otherLines.join("\n"),
    structured,
    grade: grade ?? undefined,
  };
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
