import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  diffTrees,
  findViolations,
  snapshotTree,
  type AuditResult,
  type TreeSnapshot,
} from "./audit";
import { ToolRecorder } from "./recorder";
import { ToolRegistry } from "./registry";
import {
  checkSafety,
  type EscalationRecord,
  type SafetyVerdict,
} from "./safety";
import { hashArgs, stableStringify } from "./stable-json";
import {
  DEFAULT_LIMITS,
  type ErasedTool,
  type SandboxErrorCode,
  type SandboxLimits,
  type SandboxMode,
  type SandboxSummary,
  type SandboxTraceEvent,
  type ToolContext,
  type ToolResult,
} from "./types";

/**
 * 只透传运行必需的环境变量。
 * API Key、数据库连接串默认一律不进子进程。
 */
const ENV_ALLOWLIST = [
  "PATH",
  "Path",
  "PATHEXT",
  "ComSpec",
  "SystemRoot",
  "SystemDrive",
  "windir",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "LANG",
  "LC_ALL",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
];

export type SandboxOptions = {
  workspace: string;
  tools: ErasedTool[];
  mode?: SandboxMode;
  limits?: Partial<SandboxLimits>;
  /** 显式放行的环境变量，按需开，不要整包 process.env */
  extraEnv?: Record<string, string>;
  recorderFile?: string;
  onEscalation?: (record: EscalationRecord) => void;
};

type RunCommandTool = Extract<ErasedTool, { kind: "command" }>;
type RunHandlerTool = Extract<ErasedTool, { kind: "handler" }>;

export class Sandbox {
  readonly workspace: string;

  private readonly tmpDir: string;
  private readonly registry: ToolRegistry;
  private readonly limits: SandboxLimits;
  private readonly mode: SandboxMode;
  private readonly recorder: ToolRecorder;
  private readonly extraEnv: Record<string, string>;
  private readonly onEscalation?: (record: EscalationRecord) => void;
  private readonly ready: Promise<void>;

  private steps = 0;
  private readonly calls = new Map<string, number>();
  private readonly traceEvents: SandboxTraceEvent[] = [];
  private readonly escalations: EscalationRecord[] = [];

  constructor(options: SandboxOptions) {
    this.workspace = path.resolve(options.workspace);
    this.tmpDir = path.join(this.workspace, ".tmp");
    mkdirSync(this.tmpDir, { recursive: true });

    this.registry = new ToolRegistry(options.tools);
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.mode = options.mode ?? "record";
    this.extraEnv = options.extraEnv ?? {};
    this.onEscalation = options.onEscalation;

    this.recorder = new ToolRecorder(
      options.recorderFile ??
        path.join(this.workspace, ".sandbox", "tool-results.json")
    );
    this.ready = this.recorder.load();
  }

  listTools(): string[] {
    return this.registry.names();
  }

  describeTools(): string {
    return this.registry.describe();
  }

  async run(toolName: string, rawArgs: unknown): Promise<ToolResult> {
    await this.ready;
    const callId = randomUUID();

    if (this.steps >= this.limits.maxSteps) {
      return this.reject(
        callId,
        toolName,
        "",
        "E_STEP_LIMIT",
        `超过单次运行步数上限 ${this.limits.maxSteps}`
      );
    }

    const tool = this.registry.get(toolName);
    if (!tool) {
      return this.reject(
        callId,
        toolName,
        "",
        "E_TOOL_UNKNOWN",
        `工具未注册: ${toolName}`
      );
    }

    this.steps += 1;

    const parsed = tool.input.safeParse(rawArgs);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const issuePath = issue?.path.map(String).join(".");
      return this.reject(
        callId,
        toolName,
        "",
        "E_ARGS_INVALID",
        `${issuePath || "args"}: ${issue?.message ?? "参数不合法"}`,
        issuePath
      );
    }

    const input = parsed.data;
    const argsHash = hashArgs(input);

    const verdict = this.screen(toolName, input);
    if (!verdict.allowed) {
      const record: EscalationRecord = {
        at: new Date().toISOString(),
        tool: toolName,
        code: verdict.code,
        reason: verdict.reason,
        match: verdict.match,
      };
      this.escalations.push(record);
      this.onEscalation?.(record);
      return this.reject(
        callId,
        toolName,
        argsHash,
        "E_SAFETY_BLOCKED",
        `${verdict.reason}（${verdict.match}）`
      );
    }

    const used = this.calls.get(toolName) ?? 0;
    const quota = tool.maxCallsPerRun ?? Number.POSITIVE_INFINITY;
    if (used >= quota) {
      return this.reject(
        callId,
        toolName,
        argsHash,
        "E_QUOTA_EXCEEDED",
        `工具 ${toolName} 单次运行最多调用 ${quota} 次`
      );
    }
    this.calls.set(toolName, used + 1);

    const key = `${tool.name}:${argsHash}`;

    if (this.mode === "replay") {
      const hit = this.recorder.get(key);
      if (!hit) {
        return this.reject(
          callId,
          toolName,
          argsHash,
          "E_REPLAY_MISS",
          `回放缺少录制结果: ${key}`
        );
      }
      const result: ToolResult = { ...hit.result, callId, replay: true };
      this.pushTrace(result);
      return result;
    }

    const result =
      tool.kind === "command"
        ? await this.runCommand(tool, input, callId, argsHash)
        : await this.runHandler(tool, input, callId, argsHash);

    if (this.mode === "record") {
      await this.recorder.set(key, { tool: tool.name, argsHash, result });
    }

    this.pushTrace(result);
    return result;
  }

  trace(): SandboxTraceEvent[] {
    return [...this.traceEvents];
  }

  escalationLog(): EscalationRecord[] {
    return [...this.escalations];
  }

  summary(): SandboxSummary {
    const summary: SandboxSummary = {
      calls: this.traceEvents.length,
      ok: 0,
      failed: 0,
      blocked: 0,
      timedOut: 0,
      replay: 0,
      totalDurationMs: 0,
    };

    for (const event of this.traceEvents) {
      if (event.ok) summary.ok += 1;
      else summary.failed += 1;
      if (event.errorCode === "E_SAFETY_BLOCKED") summary.blocked += 1;
      if (event.errorCode === "E_TIMEOUT") summary.timedOut += 1;
      if (event.replay) summary.replay += 1;
      summary.totalDurationMs += event.durationMs;
    }

    return summary;
  }

  snapshot(root: string = this.workspace): Promise<TreeSnapshot> {
    return snapshotTree(root);
  }

  async audit(
    before: TreeSnapshot,
    options: { root?: string; allow?: string[] } = {}
  ): Promise<AuditResult> {
    const root = options.root ?? this.workspace;
    const after = await snapshotTree(root);
    const diff = diffTrees(before, after);
    return {
      ...diff,
      violations: findViolations(diff, options.allow ?? []),
    };
  }

  private screen(tool: string, input: unknown): SafetyVerdict {
    return checkSafety(`${tool}\n${stableStringify(input)}`);
  }

  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of ENV_ALLOWLIST) {
      const value = process.env[key];
      if (value) env[key] = value;
    }

    env.TEMP = this.tmpDir;
    env.TMP = this.tmpDir;
    env.TMPDIR = this.tmpDir;
    env.SANDBOX = "1";

    return { ...env, ...this.extraEnv };
  }

  private runCommand(
    tool: RunCommandTool,
    input: unknown,
    callId: string,
    argsHash: string
  ): Promise<ToolResult> {
    const plan = tool.plan(input);
    const timeoutMs = Math.min(
      tool.timeoutMs ?? this.limits.defaultTimeoutMs,
      this.limits.maxTimeoutMs
    );
    const started = Date.now();
    const env = this.buildEnv();
    const controller = new AbortController();

    return new Promise<ToolResult>((resolve) => {
      let settled = false;
      let timedOut = false;
      let truncated = false;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const timers: { soft?: NodeJS.Timeout; hard?: NodeJS.Timeout } = {};

      const child: ChildProcess = spawn(plan.file, plan.args, {
        cwd: this.workspace,
        env: { ...env, NODE_ENV: process.env.NODE_ENV ?? "production" },
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        if (timers.soft) clearTimeout(timers.soft);
        if (timers.hard) clearTimeout(timers.hard);

        let error: ToolResult["error"];
        if (timedOut) {
          error = { code: "E_TIMEOUT", message: `工具超时（>${timeoutMs}ms）` };
        } else if (truncated) {
          error = {
            code: "E_OUTPUT_LIMIT",
            message: `输出超过 ${this.limits.maxOutputBytes} 字节`,
          };
        } else if (exitCode !== 0) {
          error = {
            code: "E_EXIT_NONZERO",
            message: `工具退出码 ${exitCode ?? "null"}`,
          };
        }

        const result: ToolResult = {
          callId,
          tool: tool.name,
          argsHash,
          ok: !error,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          exitCode,
          durationMs: Date.now() - started,
          timedOut,
          truncated,
          replay: false,
          error,
        };

        if (result.ok && tool.parse) {
          try {
            result.data = tool.parse(result.stdout);
          } catch (err) {
            result.ok = false;
            result.error = {
              code: "E_INTERNAL",
              message: `输出无法解析: ${(err as Error).message}`,
            };
          }
        }

        resolve(result);
      };

      const kill = () => {
        controller.abort();
        killTree(child);
      };

      const append = (
        chunk: Buffer,
        side: "stdout" | "stderr"
      ) => {
        const used = side === "stdout" ? stdoutBytes : stderrBytes;
        const remaining = this.limits.maxOutputBytes - used;

        if (remaining <= 0) {
          truncated = true;
          kill();
          return;
        }

        const keep = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        if (side === "stdout") {
          stdoutChunks.push(keep);
          stdoutBytes += keep.length;
        } else {
          stderrChunks.push(keep);
          stderrBytes += keep.length;
        }

        if (chunk.length > remaining) {
          truncated = true;
          kill();
        }
      };

      child.stdout?.on("data", (chunk: Buffer) => append(chunk, "stdout"));
      child.stderr?.on("data", (chunk: Buffer) => append(chunk, "stderr"));

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        if (timers.soft) clearTimeout(timers.soft);
        if (timers.hard) clearTimeout(timers.hard);
        resolve({
          callId,
          tool: tool.name,
          argsHash,
          ok: false,
          stdout: "",
          stderr: err.message,
          exitCode: null,
          durationMs: Date.now() - started,
          timedOut: false,
          truncated: false,
          replay: false,
          error: {
            code: "E_INTERNAL",
            message: `工具无法启动: ${err.message}`,
          },
        });
      });

      child.on("close", (code) => finish(code));

      timers.soft = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeoutMs);

      // 某些平台 kill 后 close 事件可能不来，兜底结束等待
      timers.hard = setTimeout(() => finish(null), timeoutMs + 3_000);
    });
  }

  private async runHandler(
    tool: RunHandlerTool,
    input: unknown,
    callId: string,
    argsHash: string
  ): Promise<ToolResult> {
    const timeoutMs = Math.min(
      tool.timeoutMs ?? this.limits.defaultTimeoutMs,
      this.limits.maxTimeoutMs
    );
    const started = Date.now();
    const controller = new AbortController();
    const ctx: ToolContext = {
      callId,
      workspace: this.workspace,
      signal: controller.signal,
      env: this.buildEnv(),
    };

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, timeoutMs);
    });

    try {
      const outcome = await Promise.race([
        Promise.resolve(tool.invoke(input, ctx)).then((value) => ({
          kind: "value" as const,
          value,
        })),
        timeout.then(() => ({ kind: "timeout" as const })),
      ]);

      if (outcome.kind === "timeout") {
        return {
          callId,
          tool: tool.name,
          argsHash,
          ok: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          durationMs: Date.now() - started,
          timedOut: true,
          truncated: false,
          replay: false,
          error: { code: "E_TIMEOUT", message: `工具超时（>${timeoutMs}ms）` },
        };
      }

      const serialized = JSON.stringify(outcome.value) ?? "";
      const truncated =
        Buffer.byteLength(serialized, "utf8") > this.limits.maxOutputBytes;

      return {
        callId,
        tool: tool.name,
        argsHash,
        ok: true,
        stdout: truncated
          ? serialized.slice(0, this.limits.maxOutputBytes)
          : serialized,
        stderr: "",
        exitCode: 0,
        durationMs: Date.now() - started,
        timedOut: false,
        truncated,
        replay: false,
        data: outcome.value,
      };
    } catch (err) {
      return {
        callId,
        tool: tool.name,
        argsHash,
        ok: false,
        stdout: "",
        stderr: (err as Error).message,
        exitCode: null,
        durationMs: Date.now() - started,
        timedOut: false,
        truncated: false,
        replay: false,
        error: { code: "E_INTERNAL", message: (err as Error).message },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private reject(
    callId: string,
    tool: string,
    argsHash: string,
    code: SandboxErrorCode,
    message: string,
    issuePath?: string
  ): ToolResult {
    const result: ToolResult = {
      callId,
      tool,
      argsHash,
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      truncated: false,
      replay: false,
      error: { code, message, path: issuePath },
    };
    this.pushTrace(result);
    return result;
  }

  private pushTrace(result: ToolResult): void {
    this.traceEvents.push({
      seq: this.traceEvents.length + 1,
      at: new Date().toISOString(),
      callId: result.callId,
      tool: result.tool,
      argsHash: result.argsHash,
      ok: result.ok,
      errorCode: result.error?.code,
      durationMs: result.durationMs,
      replay: result.replay,
    });
  }
}

function killTree(child: ChildProcess): void {
  if (child.pid == null) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}
