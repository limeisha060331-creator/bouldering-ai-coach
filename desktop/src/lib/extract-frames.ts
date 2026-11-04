/**
 * 桌面端与网页端共用同一份抽帧实现。
 * 这里只做转发，避免两套时间点算法漂移。
 */
export {
  DEFAULT_FRAME_COUNT,
  JPEG_QUALITY,
  MAX_FRAME_COUNT,
  MAX_FRAME_DATA_URL_CHARS,
  MAX_FRAME_WIDTH,
  captureFrameDataUrl,
  extractFrames,
  extractFramesWithMeta,
  formatFrameTimestamp,
  planFrameTimestamps,
} from "@lib/frame-extraction";

export type {
  AnalyzeFrame,
  ExtractFramesOptions,
  ExtractFramesResult,
  FrameExtractionDeps,
} from "@lib/frame-extraction";
