import type { ZodType } from "zod";

export type SandboxMode = "record" | "replay" | "off";

export type SandboxErrorCode =
  | "E_TOOL_UNKNOWN"
  | "E_ARGS_INVALID"
  | "E_QUOTA_EXCEEDED"
  | "E_STEP_LIMIT"
  | "E_TIMEOUT"
  | "E_OUTPUT_LIMIT"
  | "E_EXIT_NONZERO"
  | "E_SAFETY_BLOCKED"
  | "E_REPLAY_MISS"
  | "E_INTERNAL";

export type SandboxLimits = {
  /** 一次运行最多允许的工具调用次数 */
  maxSteps: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  /** 单个工具 stdout/stderr 各允许的最大字节数 */
  maxOutputBytes: number;
};

export const DEFAULT_LIMITS: SandboxLimits = {
  maxSteps: 24,
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  maxOutputBytes: 1_000_000,
};

export type CommandPlan = {
  file: string;
  args: string[];
};

export type ToolContext = {
  callId: string;
  workspace: string;
  signal: AbortSignal;
  env: Readonly<Record<string, string>>;
};

export type ToolResult = {
  callId: string;
  tool: string;
  argsHash: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  replay: boolean;
  /** command 工具的 stdout 解析结果，或 handler 工具的返回值 */
  data?: unknown;
  error?: {
    code: SandboxErrorCode;
    message: string;
    path?: string;
  };
};

export type ToolDefinition<TInput> = {
  name: string;
  description: string;
  input: ZodType<TInput>;
  timeoutMs?: number;
  maxCallsPerRun?: number;
} & (
  | {
      kind: "command";
      command: (input: TInput) => CommandPlan;
      parse?: (stdout: string) => unknown;
    }
  | {
      kind: "handler";
      handler: (input: TInput, ctx: ToolContext) => Promise<unknown> | unknown;
    }
);

type ErasedBase = {
  name: string;
  description: string;
  input: ZodType<unknown>;
  timeoutMs?: number;
  maxCallsPerRun?: number;
};

export type ErasedTool =
  | (ErasedBase & {
      kind: "command";
      plan: (input: unknown) => CommandPlan;
      parse?: (stdout: string) => unknown;
    })
  | (ErasedBase & {
      kind: "handler";
      invoke: (input: unknown, ctx: ToolContext) => Promise<unknown>;
    });

/**
 * 注册时保留入参类型，运行时统一擦除成 unknown。
 * 入参一定先过 zod，工具内部不需要再判空。
 */
export function defineTool<TInput>(
  definition: ToolDefinition<TInput>
): ErasedTool {
  const base: ErasedBase = {
    name: definition.name,
    description: definition.description,
    input: definition.input as unknown as ZodType<unknown>,
    timeoutMs: definition.timeoutMs,
    maxCallsPerRun: definition.maxCallsPerRun,
  };

  if (definition.kind === "command") {
    return {
      ...base,
      kind: "command",
      plan: (input) => definition.command(input as TInput),
      parse: definition.parse,
    };
  }

  return {
    ...base,
    kind: "handler",
    invoke: (input, ctx) =>
      Promise.resolve(definition.handler(input as TInput, ctx)),
  };
}

export type SandboxTraceEvent = {
  seq: number;
  at: string;
  callId: string;
  tool: string;
  argsHash: string;
  ok: boolean;
  errorCode?: SandboxErrorCode;
  durationMs: number;
  replay: boolean;
};

export type SandboxSummary = {
  calls: number;
  ok: number;
  failed: number;
  blocked: number;
  timedOut: number;
  replay: number;
  totalDurationMs: number;
};
