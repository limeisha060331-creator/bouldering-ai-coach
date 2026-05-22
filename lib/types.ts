export interface AnalysisSegment {
  timestamp: string;
  seconds: number;
  content: string;
}

export interface ImprovementBlock {
  title: string;
  practice?: string;
  strength?: string;
  lines: string[];
}

export interface StructuredReport {
  dimensionSummary: string | null;
  dimensionBullets: string[];
  improvementIntro: string | null;
  improvementBlocks: ImprovementBlock[];
  overallAdvice: string | null;
  hasStructuredContent: boolean;
}

export interface ParsedAnalysis {
  raw: string;
  score: number | null;
  highlight: string | null;
  /** AI 输出「难度：Vx」时解析 */
  grade?: BoulderGrade;
  segments: AnalysisSegment[];
  /** @deprecated 改用 structured */
  summary: string;
  structured: StructuredReport;
}

export interface SegmentBookmarkItem {
  analysisId: string;
  fileName: string;
  createdAt: string;
  segmentIndex: number;
  timestamp: string;
  seconds: number;
  content: string;
}

export type AnalysisDepth = "light" | "deep";
export type AnalysisLocale = "zh" | "en";

/** 抱石难度 V0–V10 */
export type BoulderGrade =
  | "V0"
  | "V1"
  | "V2"
  | "V3"
  | "V4"
  | "V5"
  | "V6"
  | "V7"
  | "V8"
  | "V9"
  | "V10";

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
  /** 该次攀爬估算/记录的完攀高度（米），计入总爬升 */
  ascentMeters?: number;
  /** 线路难度；AI 未能判定时由用户选择 */
  grade?: BoulderGrade;
  /** 用户备注 */
  sessionNote?: string;
  /** 登录用户 ID（可选，用于日后云端同步） */
  userId?: string;
}
