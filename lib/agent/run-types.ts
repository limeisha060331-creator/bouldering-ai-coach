/**
 * 一次 Agent 运行的可审计记录。
 * 这个类型同时被服务端、任务状态接口和网页记录使用，不能引入 Node 依赖。
 */
export type AgentToolCallRecord = {
  tool: string;
  ok: boolean;
  durationMs: number;
  errorCode?: string;
  replay?: boolean;
};

export type AgentUsageRecord = {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
};

export type AgentRunRecord = {
  version: 1;
  runId: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  model: string;
  attempts: number;
  steps: number;
  toolCalls: AgentToolCallRecord[];
  validation: {
    ok: boolean;
    codes: string[];
    issues: number;
  };
  usage: AgentUsageRecord;
  costUsd: number;
  contextDigest: string;
  memory?: {
    written: boolean;
    code: string;
    message: string;
  };
  failure?: string;
};

export type AgentRunEvent = {
  type: "model" | "tool" | "validation" | "memory" | "done";
  message: string;
  step?: number;
  tool?: string;
  ok?: boolean;
};
