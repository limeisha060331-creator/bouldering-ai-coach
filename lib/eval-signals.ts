import type { ParsedAnalysis } from "./types";

/**
 * 不依赖人工标注的信号。
 *
 * 这一层的所有指标都能从「模型输出 + 视频时长」直接算出来，
 * 所以真视频一跑就能得到可对外引用的数字。需要人打分的维度分 MAE
 * 和关键线索覆盖率不在这里，必须等人工金标。
 */

export const GENERIC_PHRASES = [
  "注意重心",
  "多练习",
  "加强核心",
  "保持专注",
  "放松",
  "多爬",
  "要自信",
  "找准节奏",
  "整体不错",
  "继续努力",
  "需要加强",
  "要更稳",
] as const;

type SegmentLike = { content: string };

export function normalizeSegmentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\-—]/g, "")
    .trim();
}

export function countGenericSegments(segments: SegmentLike[]): number {
  return segments.filter((segment) =>
    GENERIC_PHRASES.some((phrase) => segment.content.includes(phrase))
  ).length;
}

export function computeDuplicateSegmentRate(segments: SegmentLike[]): number {
  if (segments.length === 0) return 0;
  const normalized = segments.map((segment) =>
    normalizeSegmentText(segment.content)
  );
  return (segments.length - new Set(normalized).size) / segments.length;
}

export function meanSegmentChars(segments: SegmentLike[]): number {
  if (segments.length === 0) return 0;
  return (
    segments.reduce((sum, segment) => sum + segment.content.length, 0) /
    segments.length
  );
}

export type TimestampCheck = {
  inRangeCount: number;
  segmentCount: number;
  inRangeRate: number;
  monotonic: boolean;
};

/**
 * 时间戳要落在 0 到「时长 + 2 秒」之间。
 * 容差 2 秒是给模型描述收尾动作留的余量，写在 docs/quality/eval-rubric.md。
 */
export function checkTimestamps(
  parsed: ParsedAnalysis,
  durationSec: number
): TimestampCheck {
  const segments = parsed.segments;
  const inRangeCount = segments.filter(
    (segment) =>
      segment.seconds >= 0 && segment.seconds <= durationSec + 2
  ).length;
  return {
    inRangeCount,
    segmentCount: segments.length,
    inRangeRate: segments.length === 0 ? 0 : inRangeCount / segments.length,
    monotonic: segments.every(
      (segment, index) =>
        index === 0 || segment.seconds >= segments[index - 1].seconds
    ),
  };
}
