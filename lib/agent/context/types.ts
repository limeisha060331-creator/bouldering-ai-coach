import type { BoulderGrade } from "../../bouldering-grade";
import type { MemoryHit, MemoryProfile } from "../memory/types";
import type { ToolResult } from "../sandbox/types";

export type ContextAngle = "front" | "side" | "unknown";

export type FactKind = "kinematic" | "observation" | "constraint";

export type SessionFact = {
  id: string;
  kind: FactKind;
  atSec: number;
  bodyPart?: string;
  detail: string;
  confidence: number;
  /** 事实必须能追到某次工具调用，不能由模型口述 */
  sourceCallId: string;
};

export type SessionState = {
  sessionId: string;
  userId: string;
  grade: BoulderGrade | null;
  angle: ContextAngle;
  startedAt: string;
  status: "active" | "completed" | "failed";
  facts: SessionFact[];
  openQuestions: string[];
};

export type SectionId =
  | "policy"
  | "profile"
  | "session"
  | "memory"
  | "tools"
  | "task";

export type ContextBudget = {
  total: number;
  policy: number;
  profile: number;
  session: number;
  memory: number;
  tools: number;
  task: number;
};

export type ContextSection = {
  id: SectionId;
  title: string;
  content: string;
  tokens: number;
  truncated: boolean;
};

export type DroppedItem = {
  section: SectionId;
  id: string;
  reason: "budget" | "ttl" | "incomparable";
};

export type ContextBundle = {
  sections: ContextSection[];
  budget: number;
  totalTokens: number;
  dropped: DroppedItem[];
  /** 同样的输入必须得到同样的 digest，用于回放比对 */
  digest: string;
};

export type ContextInput = {
  policy: string;
  profile?: MemoryProfile | null;
  session: SessionState;
  memories?: MemoryHit[];
  tools?: ToolResult[];
  task: string;
};
