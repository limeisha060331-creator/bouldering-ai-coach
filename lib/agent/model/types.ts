import type { AnalyzeFrame } from "../../frame-extraction";
import type { DeepSeekUsage } from "../../deepseek-analysis";
import type { ToolAttachment } from "../sandbox/types";

export type ToolCatalogEntry = {
  name: string;
  description: string;
  /** 由 zod 转出的 JSON Schema；模型据此生成 args */
  inputSchema: unknown;
};

export type AgentModelAction =
  | {
      type: "tool";
      tool: string;
      args: Record<string, unknown>;
      reason?: string;
    }
  | {
      type: "final";
      report: unknown;
      /** 原始输出；校验时优先用它，保留模型实际写的 JSON */
      raw?: string;
    };

export type AgentTranscriptEntry =
  | { role: "assistant"; text: string }
  | {
      role: "user";
      text: string;
      attachments?: ToolAttachment[];
    };

export type AgentModelRequest = {
  system: string;
  contextText: string;
  task: string;
  frames: AnalyzeFrame[];
  tools: ToolCatalogEntry[];
  transcript: AgentTranscriptEntry[];
  /** 第几次模型调用，从 1 开始 */
  attempt: number;
  feedbackText: string | null;
  signal?: AbortSignal;
};

export type AgentModelTurn = {
  actions: AgentModelAction[];
  raw: string;
  usage: DeepSeekUsage | null;
  latencyMs: number;
};

export type AgentModel = {
  next(request: AgentModelRequest): Promise<AgentModelTurn>;
};
