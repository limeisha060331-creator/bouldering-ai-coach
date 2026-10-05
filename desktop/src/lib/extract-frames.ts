import type { AnalyzeFrame } from "@shared/ipc";

/** 默认抽帧数量：足够覆盖一次抱石尝试，又不至于让请求体过大 */
export const DEFAULT_FRAME_COUNT = 16;
/** 单帧最长边（DeepSeek 会把大图压到约 1300×1300，768 已足够清晰且更省 token） */
export const MAX_FRAME_WIDTH = 768;
export const JPEG_QUALITY = 0.72;
export const MAX_FRAME_COUNT = 32;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 均匀分布取帧时间点，避开开头与结尾的黑帧。
 * 纯函数，便于单测。
 */
export function planFrameTimestamps(
  durationSec: number,
  count: number = DEFAULT_FRAME_COUNT
): number[] {
  const duration =
    Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (duration <= 0) return [];

  const total = Math.max(1, Math.min(Math.floor(count) || 1, MAX_FRAME_COUNT));
  const start = Math.min(0.4, duration * 0.02);
  const end = Math.max(start, duration * 0.98);

  if (total === 1) return [round2(start)];

  const step = (end - start) / (total - 1);
  return Array.from({ length: total }, (_, i) => round2(start + step * i));
}

export function formatFrameTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 便于单测注入假实现（jsdom 没有真实解码器与 canvas） */
export type FrameExtractionDeps = {
  createVideo?: () => HTMLVideoElement;
  createCanvas?: () => HTMLCanvasElement;
  createObjectUrl?: (file: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
};

export type ExtractFramesOptions = FrameExtractionDeps & {
  count?: number;
  maxWidth?: number;
  onProgress?: (done: number, total: number) => void;
};

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("无法读取视频，请换一个文件"));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("error", fail);
  });
}

/**
 * 取视频时长。
 * MediaRecorder 录出来的 WebM 常常没有时长元数据（duration 为 Infinity），
 * 这时用一次超大 seek 逼浏览器解析出真实时长。
 */
async function resolveDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let timer = 0;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("durationchange", done);
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("durationchange", done);
    video.addEventListener("seeked", done);
    try {
      video.currentTime = 1e101;
    } catch {
      done();
      return;
    }
    timer = window.setTimeout(done, 2000);
  });

  const resolved = video.duration;
  return Number.isFinite(resolved) && resolved > 0 ? resolved : 0;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("视频跳转失败，请换一个文件"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = time;
  });
}

/** 把当前画面按比例缩放后编码成 JPEG data URL */
export function captureFrameDataUrl(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxWidth: number = MAX_FRAME_WIDTH,
  quality: number = JPEG_QUALITY
): string {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const scale = Math.min(1, maxWidth / width);
  const targetW = Math.max(2, Math.round(width * scale));
  const targetH = Math.max(2, Math.round(height * scale));

  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布上下文，抽帧失败");
  }
  ctx.drawImage(video, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * 从视频文件本地抽帧：DeepSeek 官方 API 不接受视频，只能提交关键帧。
 * 每帧都带 `[MM:SS]` 时间戳，模型因此仍能给出时间轴级别的点评。
 */
export async function extractFrames(
  file: File | Blob,
  options: ExtractFramesOptions = {}
): Promise<AnalyzeFrame[]> {
  const {
    count = DEFAULT_FRAME_COUNT,
    maxWidth = MAX_FRAME_WIDTH,
    onProgress,
    createVideo = () => document.createElement("video"),
    createCanvas = () => document.createElement("canvas"),
    createObjectUrl = (blob: Blob) => URL.createObjectURL(blob),
    revokeObjectUrl = (url: string) => URL.revokeObjectURL(url),
  } = options;

  const video = createVideo();
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const url = createObjectUrl(file);
  const canvas = createCanvas();

  try {
    video.src = url;
    await waitForMetadata(video);

    const duration = await resolveDuration(video);
    if (duration <= 0) {
      throw new Error("无法获取视频时长，请换一个文件");
    }

    const timestamps = planFrameTimestamps(duration, count);
    const frames: AnalyzeFrame[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const seconds = timestamps[i];
      await seekTo(video, seconds);
      frames.push({
        seconds,
        timestamp: formatFrameTimestamp(seconds),
        dataUrl: captureFrameDataUrl(video, canvas, maxWidth),
      });
      onProgress?.(i + 1, timestamps.length);
    }

    return frames;
  } finally {
    revokeObjectUrl(url);
  }
}
