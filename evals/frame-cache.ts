import fs from "node:fs";
import path from "node:path";
import {
  formatFrameTimestamp,
  type AnalyzeFrame,
} from "../lib/frame-extraction";

/**
 * live 评测用的关键帧缓存。
 *
 * 抽帧需要视频解码，Node 侧交给 ffmpeg（见 scripts/extract-frames.mjs）。
 * 抽出后落盘，评测只读缓存，避免每条用例重复解码。
 */

export const FRAME_CACHE_ROOT = ["evals", "private", "frames"];

type FrameMeta = {
  durationSec: number;
  frames: { seconds: number; file: string }[];
};

export type CachedFrameSet = {
  durationSec: number;
  frames: AnalyzeFrame[];
};

export function frameCacheDir(root: string, caseId: string): string {
  return path.join(root, ...FRAME_CACHE_ROOT, caseId);
}

export function hasCachedFrames(root: string, caseId: string): boolean {
  return fs.existsSync(path.join(frameCacheDir(root, caseId), "meta.json"));
}

export function loadCachedFrames(
  root: string,
  caseId: string
): CachedFrameSet {
  const dir = frameCacheDir(root, caseId);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error(
      `缺少 ${caseId} 的关键帧缓存。先运行 npm run frames:extract（需要 ffmpeg）。`
    );
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as FrameMeta;
  if (!Array.isArray(meta.frames) || meta.frames.length === 0) {
    throw new Error(`${caseId} 的 meta.json 没有帧记录`);
  }

  const frames = meta.frames.map((entry) => {
    const file = path.join(dir, entry.file);
    const base64 = fs.readFileSync(file).toString("base64");
    return {
      seconds: entry.seconds,
      timestamp: formatFrameTimestamp(entry.seconds),
      dataUrl: `data:image/jpeg;base64,${base64}`,
    };
  });

  return { durationSec: meta.durationSec, frames };
}
