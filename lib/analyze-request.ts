import {
  MAX_FRAME_DATA_URL_CHARS,
  type AnalyzeFrame,
} from "./frame-extraction";
import type { AnalysisDepth, AnalysisLocale } from "./types";

/** 单次分析允许的最大帧数，留足 token 与请求体余量 */
export const MAX_REQUEST_FRAMES = 24;
/** 全部帧 data URL 总上限（Vercel 请求体约 4.5MB，留出 JSON 开销） */
export const MAX_TOTAL_DATA_URL_CHARS = 3_200_000;
export { MAX_FRAME_DATA_URL_CHARS };
/** 单段视频最长秒数，超过不再抽帧分析 */
export const MAX_DURATION_SEC = 600;

export type AnalyzeRequest = {
  fileName: string;
  durationSec: number;
  frames: AnalyzeFrame[];
  depth: AnalysisDepth;
  locale: AnalysisLocale;
};

export type ParseAnalyzeRequestResult =
  | { ok: true; value: AnalyzeRequest }
  | { ok: false; error: string };

const DATA_URL_PREFIX = /^data:image\/(jpeg|png|webp);base64,/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 校验前端提交的抽帧请求。
 * 纯函数，路由与测试共用，避免两套规则漂移。
 */
export function parseAnalyzeRequest(
  input: unknown
): ParseAnalyzeRequestResult {
  if (!isRecord(input)) {
    return { ok: false, error: "请求体必须是 JSON 对象" };
  }

  const rawFrames = input.frames;
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
    return { ok: false, error: "缺少关键帧，请重新选择视频" };
  }
  if (rawFrames.length > MAX_REQUEST_FRAMES) {
    return {
      ok: false,
      error: `关键帧过多（${rawFrames.length} 张），最多 ${MAX_REQUEST_FRAMES} 张`,
    };
  }

  let totalChars = 0;
  const frames: AnalyzeFrame[] = [];

  for (let index = 0; index < rawFrames.length; index += 1) {
    const raw = rawFrames[index];
    if (!isRecord(raw)) {
      return { ok: false, error: `第 ${index + 1} 帧格式不正确` };
    }

    const seconds = Number(raw.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return { ok: false, error: `第 ${index + 1} 帧时间无效` };
    }

    const timestamp = typeof raw.timestamp === "string" ? raw.timestamp : "";
    if (!/^\d{2}:\d{2}$/.test(timestamp)) {
      return { ok: false, error: `第 ${index + 1} 帧时间戳格式应为 MM:SS` };
    }

    const dataUrl = typeof raw.dataUrl === "string" ? raw.dataUrl : "";
    if (!DATA_URL_PREFIX.test(dataUrl)) {
      return {
        ok: false,
        error: `第 ${index + 1} 帧不是 JPEG/PNG/WebP 图片`,
      };
    }
    if (dataUrl.length > MAX_FRAME_DATA_URL_CHARS) {
      return {
        ok: false,
        error: `第 ${index + 1} 帧过大（${Math.round(dataUrl.length / 1024)}KB）`,
      };
    }

    totalChars += dataUrl.length;
    if (totalChars > MAX_TOTAL_DATA_URL_CHARS) {
      return { ok: false, error: "关键帧总大小超过 3.2MB，请减少帧数" };
    }

    frames.push({ seconds, timestamp, dataUrl });
  }

  const durationSec = Number(input.durationSec);
  if (
    !Number.isFinite(durationSec) ||
    durationSec <= 0 ||
    durationSec > MAX_DURATION_SEC
  ) {
    return {
      ok: false,
      error: `视频时长无效，请上传 ${MAX_DURATION_SEC} 秒以内的片段`,
    };
  }

  const fileName =
    typeof input.fileName === "string" && input.fileName.trim()
      ? input.fileName.trim().slice(0, 200)
      : "climb.mp4";

  const depth: AnalysisDepth =
    input.depth === "light" ? "light" : "deep";
  const locale: AnalysisLocale =
    input.locale === "en" ? "en" : "zh";

  return {
    ok: true,
    value: { fileName, durationSec, frames, depth, locale },
  };
}
