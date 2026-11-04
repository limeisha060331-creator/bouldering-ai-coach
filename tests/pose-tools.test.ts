import { describe, expect, it } from "vitest";
import { analyzePose } from "../lib/agent/tools";
import type { PoseEvidence, PoseLandmark } from "../lib/pose-types";

function points(visibility = 0.99): PoseLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility,
  }));
}

function evidence(
  frame: (landmarks: PoseLandmark[]) => void,
  atSec = 1,
  world?: (landmarks: PoseLandmark[]) => void
): PoseEvidence {
  const landmarks = points();
  frame(landmarks);
  const worldLandmarks = world ? points() : null;
  if (worldLandmarks && world) world(worldLandmarks);
  return {
    model: "test",
    frames: [
      {
        atSec,
        timestamp: "00:01",
        landmarks,
        worldLandmarks,
      },
    ],
  };
}

describe("pose.analyze", () => {
  it("识别深屈膝与接近伸直", () => {
    const result = analyzePose(
      evidence((points) => {
        points[23] = { x: 0.5, y: 0.5, z: 0, visibility: 0.99 };
        points[25] = { x: 0.5, y: 0.6, z: 0, visibility: 0.99 };
        points[27] = { x: 0.6, y: 0.6, z: 0, visibility: 0.99 };
        points[24] = { x: 0.4, y: 0.5, z: 0, visibility: 0.99 };
        points[26] = { x: 0.4, y: 0.6, z: 0, visibility: 0.99 };
        points[28] = { x: 0.4, y: 0.7, z: 0, visibility: 0.99 };
      })
    );

    const codes = result.events.map((event) => event.code);
    expect(codes).toContain("knee_deep");
    expect(codes).toContain("knee_extended");
    expect(result.events.find((event) => event.code === "knee_deep")?.detail)
      .toContain("90");
  });

  it("用 worldLandmarks 计算髋部相对踝部横移", () => {
    const result = analyzePose(
      evidence(
        () => {},
        2,
        (points) => {
          points[11] = { x: 0, y: 0.5, z: 0 };
          points[12] = { x: 0.2, y: 0.5, z: 0 };
          points[23] = { x: 0, y: 0, z: 0 };
          points[24] = { x: 0.2, y: 0, z: 0 };
          points[27] = { x: 0.5, y: 1, z: 0 };
          points[28] = { x: 0.7, y: 1, z: 0 };
        }
      ),
      { focus: "lower" }
    );

    const event = result.events.find((item) => item.code === "hip_offset");
    expect(event).toBeTruthy();
    expect(event?.detail).toContain("2.50");
  });

  it("识别脚踝在不同关键帧之间的位移", () => {
    const first = points();
    const second = points();
    second[27] = { x: 0.6, y: 0.5, z: 0, visibility: 0.99 };
    const result = analyzePose({
      model: "test",
      frames: [
        { atSec: 0, timestamp: "00:00", landmarks: first },
        { atSec: 2, timestamp: "00:02", landmarks: second },
      ],
    });

    const event = result.events.find(
      (item) => item.code === "foot_move_left"
    );
    expect(event).toBeTruthy();
    expect(event?.atSec).toBe(2);
    expect(event?.detail).toContain("0.100");
  });

  it("低置信度关节点不产出事实", () => {
    const result = analyzePose(
      evidence((points) => {
        points[23] = { x: 0.5, y: 0.5, z: 0, visibility: 0.1 };
        points[25] = { x: 0.5, y: 0.6, z: 0, visibility: 0.1 };
        points[27] = { x: 0.6, y: 0.6, z: 0, visibility: 0.1 };
      })
    );

    expect(result.events).toHaveLength(0);
    expect(result.summary.emitted).toBe(0);
  });

  it("遵守 maxEvents 上限", () => {
    const result = analyzePose(
      evidence((points) => {
        points[23] = { x: 0.5, y: 0.5, z: 0, visibility: 0.99 };
        points[25] = { x: 0.5, y: 0.6, z: 0, visibility: 0.99 };
        points[27] = { x: 0.6, y: 0.6, z: 0, visibility: 0.99 };
        points[24] = { x: 0.4, y: 0.5, z: 0, visibility: 0.99 };
        points[26] = { x: 0.4, y: 0.6, z: 0, visibility: 0.99 };
        points[28] = { x: 0.4, y: 0.7, z: 0, visibility: 0.99 };
        points[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.99 };
        points[12] = { x: 0.6, y: 0.35, z: 0, visibility: 0.99 };
        points[13] = { x: 0.4, y: 0.4, z: 0, visibility: 0.99 };
        points[14] = { x: 0.6, y: 0.4, z: 0, visibility: 0.99 };
        points[15] = { x: 0.4, y: 0.5, z: 0, visibility: 0.99 };
        points[16] = { x: 0.6, y: 0.5, z: 0, visibility: 0.99 };
      }),
      { maxEvents: 2 }
    );

    expect(result.events).toHaveLength(2);
  });
});
