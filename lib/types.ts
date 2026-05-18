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

export interface AnalysisRecord {
  id: string;
  createdAt: string;
  fileName: string;
  thumbnail: string;
  analysis: string;
  score: number | null;
  highlight: string | null;
  segments: AnalysisSegment[];
}
