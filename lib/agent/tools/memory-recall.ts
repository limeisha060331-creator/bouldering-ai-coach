import { z } from "zod";
import { BOULDER_GRADES } from "../../bouldering-grade";
import type { MemoryStore } from "../memory";
import { defineTool } from "../sandbox/types";

/**
 * 只读记忆。写入不暴露给模型：让模型自己决定写什么进长期记忆，
 * 等于把伤病和水平判断交给一个可能幻觉的组件。
 */
export function createMemoryRecallTool(args: {
  memory: MemoryStore | null;
  userId: string;
  defaultGrade?: string | null;
}) {
  return defineTool({
    kind: "handler",
    name: "memory.recall",
    description:
      "查询同一用户、同难度、同机位的历史训练记录。历史只用于对比，不能当作本次视频的证据。",
    input: z.object({
      grade: z.enum([...BOULDER_GRADES]).optional(),
      angle: z.enum(["front", "side", "unknown"]).optional(),
      lighting: z.enum(["good", "poor", "unknown"]).optional(),
      limit: z.number().int().min(1).max(5).optional(),
    }),
    timeoutMs: 3_000,
    maxCallsPerRun: 2,
    handler: async (input) => {
      const grade = input.grade ?? args.defaultGrade;
      if (!args.memory || !args.userId || !grade) {
        return { hits: [], count: 0, note: "没有可用的历史记录" };
      }

      const hits = await args.memory.retrieve(args.userId, {
        grade: grade as (typeof BOULDER_GRADES)[number],
        angle: input.angle ?? "unknown",
        lighting: input.lighting ?? "unknown",
        limit: input.limit ?? 3,
      });

      return {
        count: hits.length,
        hits: hits.map((hit) => ({
          at: hit.episode.at,
          grade: hit.episode.grade,
          angle: hit.episode.angle,
          reason: hit.reason,
          issues: hit.episode.issues.map((issue) => ({
            bodyPart: issue.bodyPart,
            detail: issue.detail,
            atSec: issue.atSec,
            confidence: issue.confidence,
          })),
        })),
      };
    },
  });
}
