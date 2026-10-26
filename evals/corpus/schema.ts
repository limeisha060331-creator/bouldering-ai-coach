import { z } from "zod";

/**
 * 真实视频语料的两层数据结构：
 *
 * 1. sources/ —— 已提交进仓库的「来源清单」，只放可公开的元数据：
 *    标题、授权、作者、来源页、远程地址。任何人 clone 之后都能复核。
 * 2. private/corpus/manifest.json —— 本地下载产物，含路径和 sha256，不进仓库。
 *
 * 分开的原因是：授权信息必须可审计，视频文件本身不该进 git。
 */

export const CORPUS_VENUES = [
  "indoor-competition",
  "indoor-gym",
  "outdoor",
] as const;

export type CorpusVenue = (typeof CORPUS_VENUES)[number];

export const corpusSourceItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  venue: z.enum([...CORPUS_VENUES]),
  /** 只有赛事方或视频本身给出了难度时才填，猜错会污染难度一致率 */
  grade: z.enum([
    "V0",
    "V1",
    "V2",
    "V3",
    "V4",
    "V5",
    "V6",
    "V7",
    "V8",
    "V9",
    "V10",
    "V11",
  ]).nullable(),
  tags: z.array(z.string()),
  durationSec: z.number().positive(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: z.enum(["portrait", "landscape"]),
  mimeType: z.string().min(1),
  license: z.string().min(1),
  artist: z.string().min(1),
  sourcePage: z.string().url(),
  downloadUrl: z.string().url(),
});

export type CorpusSourceItem = z.infer<typeof corpusSourceItemSchema>;

export const corpusSourceFileSchema = z.object({
  collection: z.string().min(1),
  createdAt: z.string().min(1),
  note: z.string().min(1),
  items: z.array(corpusSourceItemSchema).min(1),
});

export type CorpusSourceFile = z.infer<typeof corpusSourceFileSchema>;

export const corpusManifestEntrySchema = corpusSourceItemSchema.extend({
  /** 相对仓库根目录的本地路径，例如 evals/private/corpus/gym-rockspot-v3.webm */
  localPath: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytesOnDisk: z.number().int().positive(),
  retrievedAt: z.string().min(1),
  /**
   * 时长来源：现在是托管方在文件元数据里给出的值。
   * 本地没有 ffprobe，所以不冒充「本地探测」。
   */
  durationSource: z.literal("source-metadata"),
});

export type CorpusManifestEntry = z.infer<typeof corpusManifestEntrySchema>;

export const corpusManifestSchema = z.object({
  collection: z.string().min(1),
  generatedAt: z.string().min(1),
  items: z.array(corpusManifestEntrySchema),
});

export type CorpusManifest = z.infer<typeof corpusManifestSchema>;

export function parseCorpusSourceFile(input: unknown): CorpusSourceFile {
  return corpusSourceFileSchema.parse(input);
}

export function parseCorpusManifest(input: unknown): CorpusManifest {
  return corpusManifestSchema.parse(input);
}

export type CorpusCoverage = {
  cases: number;
  totalBytes: number;
  totalSeconds: number;
  byVenue: Record<string, number>;
  byOrientation: Record<string, number>;
  gradedCases: number;
  duration: {
    minSec: number;
    medianSec: number;
    maxSec: number;
  };
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * 覆盖度统计用来回答一个问题：这批样本到底能不能代表真实用户上传，
 * 还是只是「同一个比赛同一台机位」的 11 个近重复。
 */
export function summarizeCoverage(
  items: Pick<
    CorpusManifestEntry,
    "durationSec" | "sizeBytes" | "venue" | "orientation" | "grade"
  >[]
): CorpusCoverage {
  const byVenue: Record<string, number> = {};
  const byOrientation: Record<string, number> = {};
  for (const item of items) {
    byVenue[item.venue] = (byVenue[item.venue] ?? 0) + 1;
    byOrientation[item.orientation] =
      (byOrientation[item.orientation] ?? 0) + 1;
  }

  const durations = items.map((item) => item.durationSec);

  return {
    cases: items.length,
    totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
    totalSeconds: durations.reduce((sum, value) => sum + value, 0),
    byVenue,
    byOrientation,
    gradedCases: items.filter((item) => item.grade != null).length,
    duration: {
      minSec: durations.length === 0 ? 0 : Math.min(...durations),
      medianSec: median(durations),
      maxSec: durations.length === 0 ? 0 : Math.max(...durations),
    },
  };
}
