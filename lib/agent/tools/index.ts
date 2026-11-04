import type { AnalyzeFrame } from "../../frame-extraction";
import type { AnalysisLocale } from "../../types";
import type { PoseEvidence } from "../../pose-types";
import type { MemoryStore } from "../memory";
import type { ErasedTool } from "../sandbox/types";
import { createFrameExtractTool } from "./frame-extract";
import { createMemoryRecallTool } from "./memory-recall";
import { createPoseAnalyzeTool } from "./pose-analyze";

export * from "./pose-analyze";
export * from "./frame-extract";
export * from "./memory-recall";

export function createWebAgentTools(args: {
  frames: AnalyzeFrame[];
  pose: PoseEvidence | null;
  memory: MemoryStore | null;
  userId: string;
  grade?: string | null;
  locale: AnalysisLocale;
}): ErasedTool[] {
  return [
    createPoseAnalyzeTool(args.pose, { locale: args.locale }),
    createFrameExtractTool(args.frames, { locale: args.locale }),
    createMemoryRecallTool({
      memory: args.memory,
      userId: args.userId,
      defaultGrade: args.grade,
    }),
  ];
}
