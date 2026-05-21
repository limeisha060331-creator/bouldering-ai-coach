import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { AnalysisRecord } from "./types";
import type { StructuredReport } from "./types";
import { parseAnalysis } from "./parse-analysis";

function safeFileName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").slice(0, 48) || "analysis";
}

/** 将隐藏的 PDF 模板 DOM 导出为 A4 PDF */
export async function downloadAnalysisPdf(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#f5f3ef",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  const imgHeight = (canvas.height * contentWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, "PNG", margin, position, contentWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = margin - (imgHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, contentWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  pdf.save(`${safeFileName(fileName)}-教练报告.pdf`);
}

export function buildPdfSummaryLines(
  record: AnalysisRecord,
  structured: StructuredReport
): {
  title: string;
  score: string | null;
  highlight: string | null;
  dimensionPoints: string[];
  improvementTitles: string[];
  overall: string | null;
  timelineTop: { time: string; text: string }[];
} {
  const parsed = parseAnalysis(record.analysis);
  const segments = record.segments?.length
    ? record.segments
    : parsed.segments;

  const dimensionPoints =
    structured.dimensionBullets.length > 0
      ? structured.dimensionBullets.slice(0, 5)
      : structured.dimensionSummary
        ? structured.dimensionSummary
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 5)
        : [];

  const improvementTitles = structured.improvementBlocks
    .map((b) => b.title)
    .slice(0, 4);

  const timelineTop = segments.slice(0, 4).map((s) => ({
    time: s.timestamp,
    text: s.content.slice(0, 120),
  }));

  return {
    title: record.fileName,
    score: record.score != null ? `${record.score} / 100` : null,
    highlight: record.highlight,
    dimensionPoints,
    improvementTitles,
    overall: structured.overallAdvice
      ? structured.overallAdvice.slice(0, 400)
      : null,
    timelineTop,
  };
}
