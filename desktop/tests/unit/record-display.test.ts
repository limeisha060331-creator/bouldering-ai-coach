import { describe, expect, it } from "vitest";
import {
  formatHistoryTitle,
  formatRecordDate,
  formatSessionListMeta,
  isOpaqueFileName,
} from "@lib/record-display";
import type { AnalysisRecord } from "@lib/types";

function record(patch: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: "1",
    createdAt: "2026-02-14T10:30:00.000Z",
    fileName: "session.mp4",
    thumbnail: "",
    analysis: "",
    score: null,
    highlight: null,
    segments: [],
    ...patch,
  };
}

describe("record-display", () => {
  it("识别自动生成的不可读文件名", () => {
    expect(isOpaqueFileName("9f3ac81b4e2d4c0aa11b.mp4")).toBe(true);
    expect(isOpaqueFileName("crux-session.mp4")).toBe(false);
  });

  it("历史列表标题优先用备注", () => {
    expect(formatHistoryTitle(record({ sessionNote: "周三抱石" }))).toBe(
      "周三抱石"
    );
    expect(formatHistoryTitle(record())).toBe("session");
  });

  it("不可读文件名回退到「视频 NN」", () => {
    expect(
      formatHistoryTitle(record({ fileName: "a1b2c3d4e5f60718293a.mp4" }), 3)
    ).toBe("视频 03");
  });

  it("副标题包含难度与爬升", () => {
    const meta = formatSessionListMeta(
      record({ grade: "V5", ascentMeters: 4.5, sessionNote: "周三抱石" })
    );
    expect(meta).toContain("V5");
    expect(meta).toContain("周三抱石");
    expect(meta).toContain("4.5m 爬升");
  });

  it("formatRecordDate 支持 short/full", () => {
    expect(formatRecordDate("2026-02-14T10:30:00.000Z", "short")).toMatch(/2/);
    expect(formatRecordDate("2026-02-14T10:30:00.000Z", "full")).toMatch(/:/);
  });
});
