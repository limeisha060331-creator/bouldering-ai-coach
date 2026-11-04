#!/usr/bin/env node
/**
 * 给 live 评测准备关键帧：读语料 manifest，用 ffmpeg 均匀抽帧后落盘。
 *
 *   npm run frames:extract
 *   npm run frames:extract -- --only case-001 --count 16
 *
 * 需要 PATH 中有 ffmpeg / ffprobe（或设置 FFMPEG_PATH / FFPROBE_PATH）。
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "evals", "private", "corpus", "manifest.json");
const outRoot = path.join(root, "evals", "private", "frames");

const argv = process.argv.slice(2);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = argValue("--only")
  ? new Set(argValue("--only").split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const limit = argValue("--limit") ? Number(argValue("--limit")) : null;
const count = Math.max(1, Number(argValue("--count") ?? 16));

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";

function run(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8" });
  if (result.error) {
    throw new Error(
      `无法执行 ${bin}：${result.error.message}。请安装 ffmpeg 或设置 FFMPEG_PATH/FFPROBE_PATH。`
    );
  }
  if (result.status !== 0) {
    throw new Error(`${bin} 退出码 ${result.status}：${result.stderr?.trim()}`);
  }
  return result.stdout;
}

function probeDuration(file) {
  const out = run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const value = Number(out.trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`读不到时长：${file}`);
  }
  return value;
}

/** 与 lib/frame-extraction.ts 的 planFrameTimestamps 保持一致 */
function planTimestamps(durationSec, total) {
  const start = Math.min(0.4, durationSec * 0.02);
  const end = Math.max(start, durationSec * 0.98);
  if (total === 1) return [start];
  const step = (end - start) / (total - 1);
  return Array.from({ length: total }, (_, i) =>
    Math.round((start + step * i) * 100) / 100
  );
}

if (!fs.existsSync(manifestPath)) {
  console.error("缺少 evals/private/corpus/manifest.json，先跑 npm run corpus:fetch");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
let items = manifest.items ?? [];
if (only) items = items.filter((item) => only.has(item.id));
if (limit != null && Number.isFinite(limit)) items = items.slice(0, limit);
if (items.length === 0) {
  console.error("筛选后没有可抽帧的语料");
  process.exit(1);
}

for (const item of items) {
  const videoPath = path.resolve(root, item.localPath);
  if (!fs.existsSync(videoPath)) {
    console.error(`跳过 ${item.id}：找不到 ${item.localPath}`);
    continue;
  }

  const dir = path.join(outRoot, item.id);
  fs.mkdirSync(dir, { recursive: true });

  const durationSec = item.durationSec || probeDuration(videoPath);
  const timestamps = planTimestamps(durationSec, count);
  const frames = [];

  timestamps.forEach((seconds, index) => {
    const file = `frame-${String(index + 1).padStart(2, "0")}.jpg`;
    run(ffmpeg, [
      "-y",
      "-ss",
      String(seconds),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(768,iw)':-2",
      "-q:v",
      "4",
      path.join(dir, file),
    ]);
    frames.push({ seconds, file });
  });

  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify({ durationSec, frames }, null, 2),
    "utf8"
  );
  console.log(`${item.id}: ${frames.length} 帧 → ${path.relative(root, dir)}`);
}

console.log("\n完成。现在可以跑 npm run eval:live");
