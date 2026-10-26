import { z } from "zod";
import { MODEL_IDS } from "./ai-cost";

export const DIMENSION_KEYS = [
  "hips",
  "power",
  "feet",
  "sequence",
  "completion",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  hips: "重心与身体位置",
  power: "发力与动作技术",
  feet: "抓握与踩脚",
  sequence: "动作顺序与节奏",
  completion: "完攀与收尾",
};

export const BOULDER_GRADES = [
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

export const dimensionScoresSchema = z.object({
  hips: z.number().min(1).max(5),
  power: z.number().min(1).max(5),
  feet: z.number().min(1).max(5),
  sequence: z.number().min(1).max(5),
  completion: z.number().min(1).max(5),
});

export type DimensionScores = z.infer<typeof dimensionScoresSchema>;

export const evalCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  durationSec: z.number().positive(),
  grade: z.enum([...BOULDER_GRADES]),
  locale: z.enum(["zh", "en"]),
  depth: z.enum(["light", "deep"]),
  model: z.enum([...MODEL_IDS]),
  labels: z.object({
    dimensions: dimensionScoresSchema,
    mustMention: z.array(z.string().min(1)).min(1),
    mustNotClaim: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;

export const evalFixtureSchema = z.object({
  caseId: z.string().min(1),
  label: z.string().min(1),
  synthetic: z.boolean(),
  note: z.string(),
  raw: z.string(),
});

export type EvalFixture = z.infer<typeof evalFixtureSchema>;

export function parseEvalCase(input: unknown): EvalCase {
  return evalCaseSchema.parse(input);
}

export function parseEvalFixture(input: unknown): EvalFixture {
  return evalFixtureSchema.parse(input);
}
