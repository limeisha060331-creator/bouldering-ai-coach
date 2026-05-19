import type { AnalysisRecord } from "./types";

/** 导出为 Markdown（UTF-8） */
export function analysisToMarkdown(record: AnalysisRecord): string {
  const lines: string[] = [];
  lines.push(`# ${record.fileName}`);
  lines.push("");
  lines.push(`- **Date:** ${record.createdAt}`);
  if (record.promptVersion) {
    lines.push(`- **Prompt version:** ${record.promptVersion}`);
  }
  if (record.depth) {
    lines.push(`- **Depth:** ${record.depth}`);
  }
  if (record.locale) {
    lines.push(`- **Analysis locale:** ${record.locale}`);
  }
  if (record.score != null) {
    lines.push(`- **Score:** ${record.score}/100`);
  }
  if (record.highlight) {
    lines.push(`- **Highlight:** ${record.highlight}`);
  }
  lines.push("");
  lines.push("## Full text");
  lines.push("");
  lines.push("```");
  lines.push(record.analysis);
  lines.push("```");
  lines.push("");
  if (record.segments?.length) {
    lines.push("## Timeline");
    lines.push("");
    for (const s of record.segments) {
      lines.push(`- **[${s.timestamp}]** ${s.content}`);
    }
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
