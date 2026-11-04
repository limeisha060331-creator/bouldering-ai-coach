import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAME_COUNT,
  MAX_FRAME_COUNT,
  formatFrameTimestamp,
  planFrameTimestamps,
} from "../lib/frame-extraction";

describe("planFrameTimestamps", () => {
  it("在有效区间内均匀取帧并避开首尾黑帧", () => {
    const times = planFrameTimestamps(60, 8);
    expect(times).toHaveLength(8);
    expect(times[0]).toBeCloseTo(0.4, 2);
    expect(times.at(-1)).toBeCloseTo(58.8, 1);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it("默认 16 帧，并遵守上限", () => {
    expect(planFrameTimestamps(30)).toHaveLength(DEFAULT_FRAME_COUNT);
    expect(planFrameTimestamps(30, 999)).toHaveLength(MAX_FRAME_COUNT);
  });

  it("非法时长返回空数组，单帧取起点", () => {
    expect(planFrameTimestamps(0)).toEqual([]);
    expect(planFrameTimestamps(Number.NaN)).toEqual([]);
    expect(planFrameTimestamps(10, 1)).toHaveLength(1);
  });
});

describe("formatFrameTimestamp", () => {
  it("输出 MM:SS", () => {
    expect(formatFrameTimestamp(0)).toBe("00:00");
    expect(formatFrameTimestamp(65.9)).toBe("01:05");
    expect(formatFrameTimestamp(-3)).toBe("00:00");
  });
});
