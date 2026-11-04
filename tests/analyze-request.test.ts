import { describe, expect, it } from "vitest";
import {
  MAX_DURATION_SEC,
  MAX_REQUEST_FRAMES,
  MAX_TOTAL_DATA_URL_CHARS,
  parseAnalyzeRequest,
} from "../lib/analyze-request";

function frame(index = 0) {
  return {
    seconds: index * 2,
    timestamp: `00:${String(index * 2).padStart(2, "0")}`,
    dataUrl: "data:image/jpeg;base64,AAAA",
  };
}

function request(patch: Record<string, unknown> = {}) {
  return {
    fileName: "crux.mp4",
    durationSec: 42,
    frames: [frame(0), frame(1)],
    depth: "deep",
    locale: "zh",
    ...patch,
  };
}

describe("parseAnalyzeRequest", () => {
  it("接受合法的关键帧请求并做默认值归一", () => {
    const parsed = parseAnalyzeRequest(request({ depth: "weird", locale: "fr" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.frames).toHaveLength(2);
    expect(parsed.value.depth).toBe("deep");
    expect(parsed.value.locale).toBe("zh");
    expect(parsed.value.durationSec).toBe(42);
  });

  it("拒绝整段视频 / 非 JSON 结构", () => {
    expect(parseAnalyzeRequest(null).ok).toBe(false);
    expect(parseAnalyzeRequest("video-bytes").ok).toBe(false);
    expect(parseAnalyzeRequest({ video: "abc" }).ok).toBe(false);
  });

  it("要求至少一帧且不超过上限", () => {
    expect(parseAnalyzeRequest(request({ frames: [] })).ok).toBe(false);
    const tooMany = Array.from({ length: MAX_REQUEST_FRAMES + 1 }, (_, i) =>
      frame(i)
    );
    const parsed = parseAnalyzeRequest(request({ frames: tooMany }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("最多");
  });

  it("拒绝非图片 data URL 与错误时间戳", () => {
    const notImage = parseAnalyzeRequest(
      request({ frames: [{ ...frame(0), dataUrl: "data:video/mp4;base64,AA" }] })
    );
    expect(notImage.ok).toBe(false);
    if (!notImage.ok) expect(notImage.error).toContain("JPEG");

    const badTime = parseAnalyzeRequest(
      request({ frames: [{ ...frame(0), timestamp: "3s" }] })
    );
    expect(badTime.ok).toBe(false);
  });

  it("拒绝超过总大小上限的请求", () => {
    const big = "data:image/jpeg;base64," + "A".repeat(350_000);
    const frames = Array.from({ length: 10 }, (_, i) => ({
      ...frame(i),
      dataUrl: big,
    }));
    const parsed = parseAnalyzeRequest(request({ frames }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("3.2MB");
    expect(big.length * 10).toBeGreaterThan(MAX_TOTAL_DATA_URL_CHARS);
  });

  it("拒绝非法时长", () => {
    for (const durationSec of [0, -1, Number.NaN, MAX_DURATION_SEC + 1]) {
      expect(parseAnalyzeRequest(request({ durationSec })).ok).toBe(false);
    }
  });

  it("接受可选姿态证据与难度", () => {
    const pose = {
      model: "mediapipe-pose-landmarker-lite@1.2.0",
      frames: [
        {
          atSec: 1.2,
          timestamp: "00:01",
          landmarks: Array.from({ length: 33 }, () => ({
            x: 0.5,
            y: 0.5,
            z: 0,
            visibility: 0.9,
          })),
          worldLandmarks: null,
        },
      ],
    };

    const parsed = parseAnalyzeRequest(request({ pose, grade: "V5" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pose?.frames).toHaveLength(1);
    expect(parsed.value.grade).toBe("V5");
  });

  it("姿态证据格式错误时拒绝整个请求", () => {
    const parsed = parseAnalyzeRequest(
      request({
        pose: {
          frames: [{ atSec: -1, timestamp: "bad", landmarks: [] }],
        },
      })
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("姿态");
  });

  it("非法难度被忽略，不影响分析", () => {
    const parsed = parseAnalyzeRequest(request({ grade: "V99" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.grade).toBeUndefined();
  });
});
