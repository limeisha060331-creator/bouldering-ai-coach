import { z } from "zod";
import { BOULDER_GRADES, type BoulderGrade } from "../../bouldering-grade";

export const memoryAngleSchema = z.enum(["front", "side", "unknown"]);
export type MemoryAngle = z.infer<typeof memoryAngleSchema>;

export const memoryLightingSchema = z.enum(["good", "poor", "unknown"]);
export type MemoryLighting = z.infer<typeof memoryLightingSchema>;

export const memoryIssueSchema = z.object({
  bodyPart: z.string().min(1),
  detail: z.string().min(2),
  atSec: z.number().min(0),
  confidence: z.number().min(0).max(1),
});
export type MemoryIssue = z.infer<typeof memoryIssueSchema>;

const isoDate = z.string().min(10);

export const memoryEpisodeSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  at: isoDate,
  grade: z.enum([...BOULDER_GRADES]),
  angle: memoryAngleSchema,
  lighting: memoryLightingSchema,
  issues: z.array(memoryIssueSchema).min(1),
  plan: z.array(z.string()).optional(),
  sourceSessionId: z.string().min(1),
});

export type MemoryEpisode = z.infer<typeof memoryEpisodeSchema>;

export const memoryEpisodeInputSchema = memoryEpisodeSchema.omit({ id: true });
export type MemoryEpisodeInput = z.infer<typeof memoryEpisodeInputSchema>;

export const memoryProfileInputSchema = z.object({
  level: z.enum([...BOULDER_GRADES]),
  goals: z.array(z.string()).max(6),
  injuries: z.array(z.string()).max(6),
  language: z.enum(["zh", "en"]),
  tone: z.enum(["direct", "encouraging"]),
});

export type MemoryProfileInput = z.infer<typeof memoryProfileInputSchema>;

export const memoryProfileSchema = memoryProfileInputSchema.extend({
  userId: z.string().min(1),
  updatedAt: isoDate,
});

export type MemoryProfile = z.infer<typeof memoryProfileSchema>;

export const memoryPreferenceSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  term: z.string().min(2),
  replacement: z.string().min(2),
  evidenceCount: z.number().int().min(0),
  confirmed: z.boolean(),
  updatedAt: isoDate,
});

export type MemoryPreference = z.infer<typeof memoryPreferenceSchema>;

export type MemoryWriteCode =
  | "OK"
  | "INVALID"
  | "LOW_CONFIDENCE"
  | "DUPLICATE_SESSION"
  | "PROFILE_REQUIRES_USER_STATED"
  | "NEED_MORE_EVIDENCE";

export type MemoryWriteDecision = {
  written: boolean;
  code: MemoryWriteCode;
  message: string;
  id?: string;
};

export type MemoryHit = {
  episode: MemoryEpisode;
  score: number;
  /** 为什么这条可比，写进上下文让模型能引用 */
  reason: string;
};

export type MemoryQuery = {
  grade: BoulderGrade;
  angle: MemoryAngle;
  lighting: MemoryLighting;
  limit?: number;
  maxAgeDays?: number;
};
