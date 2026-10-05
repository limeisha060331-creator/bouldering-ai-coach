import { describe, expect, it } from "vitest";
import {
  buildPdfContent,
  formatPdfVideoTime,
  summarizeDimensions,
  summarizeImprovements,
} from "@lib/pdf-content";
import { parseStructuredReport } from "@lib/parse-structured-report";
import type { AnalysisRecord } from "@lib/types";

const RAW = [
  "评分：88/100",
  "教练金句：起手重心太靠后，导致第一次发力被浪费。",
  "核心维度评估",
  "1. 重心与身体位置：胯部离墙过远，重心转换慢，折膝时没有把重量压到脚点上。",
  "2. 发力与动作技术：侧拉时手臂先耗尽，没有利用髋部发力。",
  "最终改进方案",
  "1. **折膝专项**",
  "   - 练习：每侧 5 次顶膝保持 3 秒",
  "   - **力量训练：** 负重悬挂 3 组",
  "整体建议",
  "下次热身先做折膝激活，并注意起步时把胯部贴墙。",
].join("\n");

const record: AnalysisRecord = {
  id: "abc",
  createdAt: "2026-02-14T10:30:00.000Z",
  fileName: "crux.mp4",
  thumbnail: "",
  analysis: RAW,
  score: null,
  highlight: null,
  segments: [],
  grade: "V5",
  ascentMeters: 4,
};

describe("pdf-content", () => {
  it("汇总单页所需内容", () => {
    const content = buildPdfContent(record, 3);
    expect(content.videoLabel).toBe("视频 03");
    expect(content.gradeLine).toBe("V5 · 爬升 4m");
    expect(content.score).toBe(88);
    expect(content.highlight).toContain("起手重心太靠后");
    expect(content.dimensions.length).toBeGreaterThan(0);
    expect(content.improvements[0]).toMatchObject({
      title: "折膝专项",
    });
    expect(content.improvements[0].text).toContain("练习");
    expect(content.overall).toContain("折膝激活");
  });

  it("视频序号缺失时使用占位", () => {
    const content = buildPdfContent(record, null);
    expect(content.videoLabel).toBe("视频 —");
  });

  it("维度摘要保留标题与正文", () => {
    const structured = parseStructuredReport(RAW);
    const items = summarizeDimensions(structured);
    expect(items[0].label).toBe("重心与身体位置");
    expect(items[0].text.length).toBeGreaterThan(5);
  });

  it("无改进块时退回 intro", () => {
    const structured = parseStructuredReport(
      ["最终改进方案", "多做静音落点练习，提升踩点精度。"].join("\n")
    );
    const items = summarizeImprovements(structured);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("改进方向");
  });

  it("时间格式为 YYYY/M/D HH:mm", () => {
    expect(formatPdfVideoTime("2026-02-14T10:30:00.000Z")).toMatch(
      /^\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}$/
    );
  });
});
