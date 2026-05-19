export interface AnalysisSegment {
  timestamp: string;
  seconds: number;
  content: string;
}

export interface ParsedAnalysis {
  raw: string;
  score: number | null;
  highlight: string | null;
  segments: AnalysisSegment[];
  summary: string;
}

export type AnalysisDepth = "light" | "deep";
export type AnalysisLocale = "zh" | "en";

export interface AnalysisRecord {
  id: string;
  createdAt: string;
  fileName: string;
  thumbnail: string;
  analysis: string;
  score: number | null;
  highlight: string | null;
  segments: AnalysisSegment[];
  /** 与 lib/analyze-prompt.ts 中 PROMPT_VERSION 对齐 */
  promptVersion?: string;
  depth?: AnalysisDepth;
  /** AI 输出语言（与界面语言可不同） */
  locale?: AnalysisLocale;
  /** 逐帧条目的收藏（按 segments 数组下标） */
  bookmarkedSegmentIndices?: number[];
}
