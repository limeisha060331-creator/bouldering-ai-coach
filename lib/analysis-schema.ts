import { z } from "zod";
import type { BoulderGrade, ParsedAnalysis, StructuredReport } from "./types";

/**
 * v2 输出契约。
 *
 * v1 用自由文本 + 正则，结果是一半信息靠猜：有没有分、分在哪一行、时间戳写没写。
 * 真实基线 10 条视频全部缺总分和 5 维分，不是模型不会写，是 Prompt 没要求。
 * 所以这里把「下游要消费的东西」直接变成 schema 必填项。
 *
 * 兼容策略：解析器先试契约，失败回落 v1 的正则路径，
 * 这样历史记录和桌面端旧任务不会因为一次 Prompt 升级而读不出来。
 */

export const CONTRACT_GRADES = [
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
] as const;

const timestampSchema = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, "时间戳必须是 MM:SS");

export const analysisContractSchema = z.object({
  grade: z.enum([...CONTRACT_GRADES]).nullable(),
  score: z.number().min(0).max(100),
  dimensionScores: z.object({
    hips: z.number().min(1).max(5),
    power: z.number().min(1).max(5),
    feet: z.number().min(1).max(5),
    sequence: z.number().min(1).max(5),
    completion: z.number().min(1).max(5),
  }),
  highlight: z.string().min(2).nullable().optional(),
  segments: z
    .array(
      z.object({
        t: timestampSchema,
        evidence: z.string().min(4),
        fix: z.string().min(2).optional(),
      })
    )
    .min(1),
  dimensionSummary: z.array(z.string().min(2)).optional(),
  improvements: z
    .array(
      z.object({
        title: z.string().min(2),
        practice: z.string().min(2).optional(),
        strength: z.string().min(2).optional(),
      })
    )
    .optional(),
  overallAdvice: z.string().min(2).nullable().optional(),
});

export type AnalysisContract = z.infer<typeof analysisContractSchema>;

function extractJsonCandidate(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1).trim();
}

/**
 * 只解析、不抛错：返回 null 表示这段输出不是 v2 契约，
 * 调用方应回落到 v1 文本解析。
 */
export function parseAnalysisContract(raw: string): AnalysisContract | null {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) return null;

  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    return null;
  }

  const result = analysisContractSchema.safeParse(value);
  return result.success ? result.data : null;
}

function toSeconds(timestamp: string): number {
  const [min, sec] = timestamp.split(":");
  return parseInt(min, 10) * 60 + parseInt(sec, 10);
}

function toStructured(contract: AnalysisContract): StructuredReport {
  const improvementBlocks = (contract.improvements ?? []).map((item) => ({
    title: item.title,
    practice: item.practice,
    strength: item.strength,
    lines: [],
  }));
  const dimensionBullets = contract.dimensionSummary ?? [];
  const overallAdvice = contract.overallAdvice ?? null;

  return {
    dimensionSummary: null,
    dimensionBullets,
    improvementIntro: null,
    improvementBlocks,
    overallAdvice,
    hasStructuredContent:
      dimensionBullets.length > 0 ||
      improvementBlocks.length > 0 ||
      Boolean(overallAdvice),
  };
}

/**
 * 把契约转成 UI 已经在用的 ParsedAnalysis。
 *
 * segments 的 content 拼成「看到了什么 + 下一次怎么做」，
 * 这样旧组件不用改渲染逻辑，也能直接吃到 v2 的证据链。
 */
export function parsedFromContract(
  raw: string,
  contract: AnalysisContract
): ParsedAnalysis {
  const segments = contract.segments.map((segment) => ({
    timestamp: segment.t.padStart(5, "0"),
    seconds: toSeconds(segment.t),
    content: segment.fix
      ? `${segment.evidence} 改进：${segment.fix}`
      : segment.evidence,
  }));

  return {
    raw,
    score: Math.round(contract.score),
    highlight: contract.highlight ?? segments[0]?.content.slice(0, 80) ?? null,
    grade: (contract.grade ?? undefined) as BoulderGrade | undefined,
    segments,
    summary: contract.overallAdvice ?? "",
    structured: toStructured(contract),
  };
}

/** 给定视频时长，把越界或倒序的时间轴修正成可直接定位的形式 */
export function sanitizeSegments(
  parsed: ParsedAnalysis,
  durationSec: number
): ParsedAnalysis {
  const limit = durationSec + 2;
  const segments = parsed.segments
    .filter((segment) => segment.seconds >= 0 && segment.seconds <= limit)
    .sort((a, b) => a.seconds - b.seconds);
  return { ...parsed, segments };
}
