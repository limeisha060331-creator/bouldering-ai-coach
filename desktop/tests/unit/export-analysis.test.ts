import { describe, expect, it } from "vitest";
import { analysisToMarkdown } from "@lib/export-analysis";
import type { AnalysisRecord } from "@lib/types";

const record: AnalysisRecord = {
  id: "abc",
  createdAt: "2026-02-14T10:30:00.000Z",
  fileName: "crux.mp4",
  thumbnail: "",
  analysis: "难度：V4\n00:03 起步重心偏后",
  score: 81,
  highlight: "起步重心偏后",
  segments: [{ timestamp: "00:03", seconds: 3, content: "起步重心偏后" }],
  promptVersion: "2026-02-1",
  depth: "light",
  locale: "zh",
};

describe("analysisToMarkdown", () => {
  const md = analysisToMarkdown(record);

  it("包含元信息", () => {
    expect(md).toContain("# crux.mp4");
    expect(md).toContain("**Score:** 81/100");
    expect(md).toContain("**Depth:** light");
    expect(md).toContain("**Prompt version:** 2026-02-1");
  });

  it("包含全文与时间轴", () => {
    expect(md).toContain("## Full text");
    expect(md).toContain("00:03 起步重心偏后");
    expect(md).toContain("## Timeline");
    expect(md).toContain("- **[00:03]** 起步重心偏后");
  });
});
