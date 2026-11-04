import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createScriptedModel,
  finalTurn,
  toolTurn,
} from "../lib/agent/model/fake";
import { runAgent } from "../lib/agent/loop";
import { Sandbox } from "../lib/agent/sandbox";
import { createPoseAnalyzeTool } from "../lib/agent/tools";
import type { PoseEvidence, PoseLandmark } from "../lib/pose-types";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "agent-loop-test-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function points(): PoseLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.99,
  }));
}

function poseFrame(atSec: number) {
  const landmarks = points();
  // 左膝 90°（深屈膝）
  landmarks[23] = { x: 0.5, y: 0.5, z: 0, visibility: 0.99 };
  landmarks[25] = { x: 0.5, y: 0.6, z: 0, visibility: 0.99 };
  landmarks[27] = { x: 0.6, y: 0.6, z: 0, visibility: 0.99 };
  // 右膝伸直
  landmarks[24] = { x: 0.4, y: 0.5, z: 0, visibility: 0.99 };
  landmarks[26] = { x: 0.4, y: 0.6, z: 0, visibility: 0.99 };
  landmarks[28] = { x: 0.4, y: 0.7, z: 0, visibility: 0.99 };
  // 肩线水平，双肘伸直
  landmarks[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.99 };
  landmarks[12] = { x: 0.6, y: 0.3, z: 0, visibility: 0.99 };
  landmarks[13] = { x: 0.4, y: 0.4, z: 0, visibility: 0.99 };
  landmarks[14] = { x: 0.6, y: 0.4, z: 0, visibility: 0.99 };
  landmarks[15] = { x: 0.4, y: 0.5, z: 0, visibility: 0.99 };
  landmarks[16] = { x: 0.6, y: 0.5, z: 0, visibility: 0.99 };

  return {
    atSec,
    timestamp: `00:0${Math.round(atSec)}`,
    landmarks,
    worldLandmarks: null,
  };
}

const EVIDENCE: PoseEvidence = {
  model: "test-pose",
  frames: [poseFrame(1), poseFrame(2)],
};

const REPORT = JSON.stringify({
  grade: "V4",
  score: 78,
  dimensionScores: { hips: 4, power: 3, feet: 3, sequence: 4, completion: 4 },
  segments: [
    {
      t: "00:01",
      evidence: "起步时左膝角度约 90 度，右膝接近伸直",
      fix: "先把重心压到脚点上方",
    },
    {
      t: "00:02",
      evidence: "双臂伸直，肩线保持水平",
      fix: "保持手臂伸展，减少无效屈肘",
    },
  ],
  overallAdvice: "先稳定下肢，再处理出手节奏。",
});

function sandbox() {
  return new Sandbox({
    workspace,
    tools: [createPoseAnalyzeTool(EVIDENCE, { locale: "zh" })],
    mode: "off",
    limits: { maxSteps: 6, defaultTimeoutMs: 5_000, maxTimeoutMs: 5_000 },
  });
}

function baseInput(model: ReturnType<typeof createScriptedModel>) {
  return {
    runId: "run-1",
    model,
    modelId: "fake-model",
    sandbox: sandbox(),
    session: {
      sessionId: "run-1",
      userId: "u1",
      grade: "V4" as const,
      angle: "unknown" as const,
      startedAt: "2026-11-04T00:00:00.000Z",
      status: "active" as const,
      facts: [],
      openQuestions: [],
    },
    policy: "测试策略",
    task: "测试任务",
    frames: [
      {
        seconds: 1,
        timestamp: "00:01",
        dataUrl: "data:image/jpeg;base64,AAAA",
      },
    ],
    durationSec: 10,
    locale: "zh" as const,
    depth: "light" as const,
    hasPoseEvidence: true,
  };
}

describe("runAgent（顶层模型 → 工具 → 事实 → 上下文循环）", () => {
  it("先调用 pose.analyze，再基于事实交付报告", async () => {
    const model = createScriptedModel([
      toolTurn("pose.analyze", {}),
      finalTurn(JSON.parse(REPORT)),
    ]);

    const outcome = await runAgent(baseInput(model));

    expect(outcome.ok).toBe(true);
    expect(outcome.record.steps).toBe(1);
    expect(outcome.record.attempts).toBe(2);
    expect(outcome.record.toolCalls[0]?.tool).toBe("pose.analyze");
    expect(outcome.record.validation.ok).toBe(true);
    expect(outcome.contract?.segments).toHaveLength(2);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1]?.transcript.some((item) => item.role === "user"))
      .toBe(true);
  });

  it("有姿态证据却不取证时，E2 校验会拦住 direct final", async () => {
    const model = createScriptedModel([
      finalTurn(JSON.parse(REPORT)),
      finalTurn(JSON.parse(REPORT)),
    ]);

    const outcome = await runAgent({
      ...baseInput(model),
      budget: { maxModelTurns: 3 },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe("repair-budget");
    expect(outcome.record.steps).toBe(0);
    expect(outcome.attempts[0]?.issues.map((item) => item.code)).toContain(
      "E_CLAIM_WITHOUT_EVIDENCE"
    );
  });

  it("收到 E2 反馈后重新调用工具，再交付报告", async () => {
    const model = createScriptedModel([
      finalTurn(JSON.parse(REPORT)),
      toolTurn("pose.analyze", {}),
      finalTurn(JSON.parse(REPORT)),
    ]);

    const outcome = await runAgent({
      ...baseInput(model),
      budget: { maxModelTurns: 4 },
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.record.steps).toBe(1);
    expect(outcome.record.attempts).toBe(3);
    expect(model.requests[1]?.feedbackText).toContain("E_CLAIM_WITHOUT_EVIDENCE");
  });

  it("触碰安全红线时只调用一次模型", async () => {
    const unsafe = JSON.stringify({
      ...JSON.parse(REPORT),
      segments: [
        {
          t: "00:01",
          evidence: "起步前建议服用止痛药",
          fix: "按剂量吃",
        },
      ],
    });
    const model = createScriptedModel([finalTurn(JSON.parse(unsafe))]);

    const outcome = await runAgent(baseInput(model));

    expect(outcome.ok).toBe(false);
    expect(outcome.record.attempts).toBe(1);
    expect(outcome.attempts[0]?.issues.map((item) => item.code)).toContain(
      "E_SAFETY_BLOCKED"
    );
    expect(model.requests).toHaveLength(1);
  });

  it("模型轮次预算耗尽时停止", async () => {
    const model = createScriptedModel([
      toolTurn("pose.analyze", {}),
      toolTurn("pose.analyze", {}),
    ]);

    const outcome = await runAgent({
      ...baseInput(model),
      budget: { maxModelTurns: 1 },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe("model-turn-budget");
    expect(model.requests).toHaveLength(1);
  });

  it("工具步数预算耗尽时停止", async () => {
    const model = createScriptedModel([
      {
        actions: [
          { type: "tool", tool: "pose.analyze", args: {} },
          { type: "tool", tool: "pose.analyze", args: { focus: "lower" } },
        ],
        raw: "{}",
        usage: null,
        latencyMs: 1,
      },
    ]);

    const outcome = await runAgent({
      ...baseInput(model),
      budget: { maxSteps: 1, maxModelTurns: 2 },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe("step-budget");
    expect(outcome.record.steps).toBe(1);
  });
});
