import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Sandbox, defineTool } from "../lib/agent/sandbox";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "sandbox-test-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function nodeTool(
  name: string,
  code: string,
  options: { timeoutMs?: number; maxCallsPerRun?: number } = {}
) {
  return defineTool({
    kind: "command",
    name,
    description: "测试工具",
    input: z.object({}),
    command: () => ({
      file: process.execPath,
      args: ["-e", code],
    }),
    ...options,
  });
}

describe("sandbox runner", () => {
  it("成功执行并捕获 stdout", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [nodeTool("echo", "console.log('hello')")],
      mode: "off",
    });

    const result = await sandbox.run("echo", {});

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.replay).toBe(false);
  });

  it("非零退出码转成结构化错误，但保留 stderr", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [nodeTool("fail", "console.error('boom'); process.exit(3)")],
      mode: "off",
    });

    const result = await sandbox.run("fail", {});

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("boom");
    expect(result.error?.code).toBe("E_EXIT_NONZERO");
  });

  it("超时后强杀进程并标记 E_TIMEOUT", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [
        nodeTool("slow", "setTimeout(() => {}, 5000)", { timeoutMs: 400 }),
      ],
      mode: "off",
    });

    const result = await sandbox.run("slow", {});

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error?.code).toBe("E_TIMEOUT");
    expect(result.durationMs).toBeLessThan(4_000);
  });

  it("输出超过上限时截断并标记 E_OUTPUT_LIMIT", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [nodeTool("loud", "process.stdout.write('x'.repeat(20000))")],
      mode: "off",
      limits: { maxOutputBytes: 512 },
    });

    const result = await sandbox.run("loud", {});

    expect(result.ok).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.error?.code).toBe("E_OUTPUT_LIMIT");
    expect(result.stdout.length).toBe(512);
  });

  it("子进程拿不到未显式放行的密钥", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [
        nodeTool(
          "env",
          "console.log(process.env.GEMINI_API_KEY ?? 'LEAKED')"
        ),
      ],
      mode: "off",
    });

    const result = await sandbox.run("env", {});

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("LEAKED");
  });

  it("未注册的工具直接拒绝", async () => {
    const sandbox = new Sandbox({ workspace, tools: [], mode: "off" });

    const result = await sandbox.run("shell", {});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("E_TOOL_UNKNOWN");
    expect(sandbox.listTools()).toEqual([]);
  });

  it("参数不合法时不进入工具体", async () => {
    const tool = defineTool({
      kind: "command",
      name: "need-path",
      description: "需要路径",
      input: z.object({ path: z.string() }),
      command: ({ path: videoPath }) => ({
        file: process.execPath,
        args: ["-e", `console.log(${JSON.stringify(videoPath)})`],
      }),
    });
    const sandbox = new Sandbox({ workspace, tools: [tool], mode: "off" });

    const result = await sandbox.run("need-path", {});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("E_ARGS_INVALID");
    expect(result.error?.path).toBe("path");
  });

  it("单工具调用次数超过配额后拒绝", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [nodeTool("once", "console.log('ok')", { maxCallsPerRun: 1 })],
      mode: "off",
    });

    const first = await sandbox.run("once", {});
    const second = await sandbox.run("once", {});

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("E_QUOTA_EXCEEDED");
  });

  it("整轮步数超限后拒绝", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [nodeTool("a", "console.log('a')"), nodeTool("b", "console.log('b')")],
      mode: "off",
      limits: { maxSteps: 1 },
    });

    const first = await sandbox.run("a", {});
    const second = await sandbox.run("b", {});

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("E_STEP_LIMIT");
  });

  it("录制后回放得到同一结果，未知参数则报 E_REPLAY_MISS", async () => {
    const tool = defineTool({
      kind: "command",
      name: "echo-n",
      description: "回显数字",
      input: z.object({ n: z.number() }),
      command: ({ n }) => ({
        file: process.execPath,
        args: ["-e", `console.log(${n})`],
      }),
    });
    const recorderFile = path.join(workspace, "tool-results.json");

    const recorderSandbox = new Sandbox({
      workspace,
      tools: [tool],
      mode: "record",
      recorderFile,
    });
    const recorded = await recorderSandbox.run("echo-n", { n: 7 });

    const replaySandbox = new Sandbox({
      workspace,
      tools: [tool],
      mode: "replay",
      recorderFile,
    });
    const replayed = await replaySandbox.run("echo-n", { n: 7 });
    const missed = await replaySandbox.run("echo-n", { n: 8 });

    expect(recorded.stdout.trim()).toBe("7");
    expect(replayed.ok).toBe(true);
    expect(replayed.replay).toBe(true);
    expect(replayed.stdout).toBe(recorded.stdout);
    expect(missed.error?.code).toBe("E_REPLAY_MISS");
  });

  it("审计能发现 workspace 之外的写入", async () => {
    const guardRoot = await mkdtemp(path.join(tmpdir(), "sandbox-guard-"));
    const guardedWorkspace = path.join(guardRoot, "workspace");
    await mkdir(guardedWorkspace, { recursive: true });
    const protectedFile = path.join(guardRoot, "protected.txt");
    await writeFile(protectedFile, "original", "utf8");

    const escape = defineTool({
      kind: "handler",
      name: "escape.write",
      description: "写到 workspace 之外",
      input: z.object({}),
      handler: async () => {
        await writeFile(protectedFile, "changed", "utf8");
        return "ok";
      },
    });

    const sandbox = new Sandbox({
      workspace: guardedWorkspace,
      tools: [escape],
      mode: "off",
    });

    try {
      const before = await sandbox.snapshot(guardRoot);
      const result = await sandbox.run("escape.write", {});
      const audit = await sandbox.audit(before, {
        root: guardRoot,
        allow: ["workspace"],
      });

      expect(result.ok).toBe(true);
      expect(audit.violations).toContain("protected.txt");
    } finally {
      await rm(guardRoot, { recursive: true, force: true });
    }
  });

  it("trace 与 summary 记录每次调用", async () => {
    const sandbox = new Sandbox({
      workspace,
      tools: [nodeTool("echo", "console.log('x')")],
      mode: "off",
    });

    await sandbox.run("echo", {});
    await sandbox.run("missing", {});

    const trace = sandbox.trace();
    const summary = sandbox.summary();

    expect(trace).toHaveLength(2);
    expect(trace[0]?.seq).toBe(1);
    expect(trace[0]?.ok).toBe(true);
    expect(trace[1]?.ok).toBe(false);
    expect(summary.calls).toBe(2);
    expect(summary.ok).toBe(1);
    expect(summary.failed).toBe(1);
  });
});
