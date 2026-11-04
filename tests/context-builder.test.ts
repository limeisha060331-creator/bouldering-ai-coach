import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CheckpointStore,
  buildContext,
  factsFromToolResults,
  renderContext,
  type ContextInput,
  type SessionState,
} from "../lib/agent/context";
import type { MemoryHit } from "../lib/agent/memory";
import type { ToolResult } from "../lib/agent/sandbox";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "context-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function toolResult(overrides: Partial<ToolResult> = {}): ToolResult {
  return {
    callId: "c1",
    tool: "pose.analyze",
    argsHash: "hash",
    ok: true,
    stdout: "",
    stderr: "",
    exitCode: 0,
    durationMs: 120,
    timedOut: false,
    truncated: false,
    replay: false,
    ...overrides,
  };
}

function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: "s1",
    userId: "u1",
    grade: "V4",
    angle: "side",
    startedAt: "2026-11-04T10:00:00.000Z",
    status: "active",
    facts: [],
    openQuestions: [],
    ...overrides,
  };
}

function hit(index: number): MemoryHit {
  return {
    episode: {
      id: `ep_${index}`,
      userId: "u1",
      at: `2026-10-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      grade: "V4",
      angle: "side",
      lighting: "good",
      issues: [
        {
          bodyPart: "右脚",
          detail: `脚尖滑到脚掌，第 ${index} 次`,
          atSec: 10 + index,
          confidence: 0.8,
        },
      ],
      sourceSessionId: `old-${index}`,
    },
    score: 0.9 - index * 0.05,
    reason: "同难度 V4 · 同机位 side · 3 天前",
  };
}

function input(overrides: Partial<ContextInput> = {}): ContextInput {
  return {
    policy: "只描述画面里看得到的证据。",
    profile: {
      userId: "u1",
      level: "V4",
      goals: ["稳定完成 V4"],
      injuries: [],
      language: "zh",
      tone: "direct",
      updatedAt: "2026-11-01T10:00:00.000Z",
    },
    session: session(),
    memories: [],
    tools: [],
    task: "分析这段抱石视频，指出三个最值得改的动作。",
    ...overrides,
  };
}

describe("context builder", () => {
  it("段落顺序固定", () => {
    const bundle = buildContext(input());

    expect(bundle.sections.map((section) => section.id)).toEqual([
      "policy",
      "profile",
      "session",
      "memory",
      "tools",
      "task",
    ]);
  });

  it("工具事件转成可追溯的会话事实", () => {
    const facts = factsFromToolResults([
      toolResult({
        callId: "c9",
        data: {
          events: [
            {
              atSec: 12,
              bodyPart: "右脚",
              detail: "脚尖没有压住岩点",
              confidence: 0.86,
            },
          ],
        },
      }),
      toolResult({
        callId: "c10",
        tool: "video.probe",
        data: { format: { duration: "42.5" } },
      }),
    ]);

    expect(facts).toHaveLength(2);
    expect(facts[0]?.sourceCallId).toBe("c9");
    expect(facts[0]?.detail).toBe("脚尖没有压住岩点");
    expect(facts[1]?.detail).toBe("视频时长 42.5 秒");
  });

  it("事实进入本次训练段落，并保留时间与置信度", () => {
    const facts = factsFromToolResults([
      toolResult({
        callId: "c1",
        data: {
          events: [
            {
              atSec: 7.5,
              bodyPart: "胯部",
              detail: "离墙超过一拳",
              confidence: 0.9,
            },
          ],
        },
      }),
    ]);
    const bundle = buildContext(input({ session: session({ facts }) }));
    const text = renderContext(bundle);

    expect(text).toContain("7.5s 胯部：离墙超过一拳（置信 0.90）");
  });

  it("同样输入得到同样的 digest", () => {
    const first = buildContext(input({ memories: [hit(0)] }));
    const second = buildContext(input({ memories: [hit(0)] }));
    const changed = buildContext(input({ policy: "换一条策略" }));

    expect(first.digest).toBe(second.digest);
    expect(changed.digest).not.toBe(first.digest);
  });

  it("记忆超预算时丢低分项并记录原因", () => {
    const bundle = buildContext(
      input({
        memories: [hit(0), hit(1), hit(2), hit(3)],
      }),
      {
        budget: {
          total: 900,
          policy: 100,
          profile: 100,
          session: 200,
          memory: 40,
          tools: 300,
          task: 60,
        },
      }
    );
    const memory = bundle.sections.find((section) => section.id === "memory");

    expect(bundle.dropped.length).toBeGreaterThan(0);
    expect(bundle.dropped[0]?.reason).toBe("budget");
    expect(memory?.truncated).toBe(true);
  });

  it("失败的工具结果保留错误码，供后续归因", () => {
    const bundle = buildContext(
      input({
        tools: [
          toolResult({
            ok: false,
            timedOut: true,
            error: { code: "E_TIMEOUT", message: "工具超时" },
          }),
        ],
      })
    );
    const text = renderContext(bundle);

    expect(text).toContain("pose.analyze 失败 E_TIMEOUT");
  });

  it("检查点按步骤存读", async () => {
    const store = new CheckpointStore(path.join(dir, "checkpoints.jsonl"));
    const bundle = buildContext(input());
    const base = {
      runId: "run-1",
      at: "2026-11-04T10:00:00.000Z",
      stateDigest: "state",
      contextDigest: bundle.digest,
      state: session(),
      context: bundle,
    };

    await store.save({ ...base, step: 1 });
    await store.save({ ...base, step: 2 });

    const all = await store.list("run-1");
    const latest = await store.latest("run-1");

    expect(all).toHaveLength(2);
    expect(latest?.step).toBe(2);
    expect(await store.latest("run-2")).toBeNull();
  });
});
