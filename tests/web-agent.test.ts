import { describe, expect, it } from "vitest";
import {
  createScriptedModel,
  finalTurn,
  toolTurn,
} from "../lib/agent/model/fake";
import { runWebAgentAnalysis } from "../lib/agent/web-runtime";
import type { PoseEvidence, PoseLandmark } from "../lib/pose-types";

function poseFrame(atSec: number): PoseEvidence["frames"][number] {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.99,
  }));
  landmarks[23] = { x: 0.5, y: 0.5, z: 0, visibility: 0.99 };
  landmarks[25] = { x: 0.5, y: 0.6, z: 0, visibility: 0.99 };
  landmarks[27] = { x: 0.6, y: 0.6, z: 0, visibility: 0.99 };
  landmarks[24] = { x: 0.4, y: 0.5, z: 0, visibility: 0.99 };
  landmarks[26] = { x: 0.4, y: 0.6, z: 0, visibility: 0.99 };
  landmarks[28] = { x: 0.4, y: 0.7, z: 0, visibility: 0.99 };

  return {
    atSec,
    timestamp: "00:01",
    landmarks,
    worldLandmarks: null,
  };
}

const REPORT = {
  grade: "V4",
  score: 76,
  dimensionScores: { hips: 4, power: 3, feet: 3, sequence: 4, completion: 3 },
  segments: [
    {
      t: "00:01",
      evidence: "起步时左膝深屈，右膝接近伸直",
      fix: "先把重心压到脚点上方",
    },
    {
      t: "00:02",
      evidence: "第二帧仍然保持左膝深屈",
      fix: "起身时保持膝盖方向",
    },
  ],
  overallAdvice: "先把下肢稳定住，再处理出手。",
};

describe("runWebAgentAnalysis", () => {
  it("把网页姿态证据、工具集和模型循环串起来", async () => {
    const model = createScriptedModel([
      toolTurn("pose.analyze", {}),
      finalTurn(REPORT),
    ]);

    const result = await runWebAgentAnalysis({
      runId: `web-agent-${Date.now()}`,
      frames: [
        {
          seconds: 1,
          timestamp: "00:01",
          dataUrl: "data:image/jpeg;base64,AAAA",
        },
      ],
      pose: {
        model: "test",
        frames: [poseFrame(1), poseFrame(2)],
      },
      durationSec: 10,
      depth: "light",
      locale: "zh",
      apiKey: "sk-test",
      model: "deepseek-flash",
      modelImpl: model,
      memory: null,
      budget: { maxModelTurns: 3, maxSteps: 3 },
    });

    expect(result.contract.segments).toHaveLength(2);
    expect(result.outcome.record.steps).toBe(1);
    expect(result.outcome.record.toolCalls[0]?.tool).toBe("pose.analyze");
    expect(result.outcome.record.validation.ok).toBe(true);
    expect(JSON.parse(result.analysis).grade).toBe("V4");
  });
});
