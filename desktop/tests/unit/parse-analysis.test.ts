import { describe, expect, it } from "vitest";
import { formatSeconds, parseAnalysis } from "@lib/parse-analysis";

const SAMPLE = [
  "难度：V5",
  "评分：82/100",
  "教练金句：起手重心太靠后",
  "00:03 起步时胯部离墙太远，浪费了一次发力",
  "00:11 折膝没有顶实，脚后跟掉下来",
  "[00:24] 收顶前没有调整呼吸，节奏偏快",
  "核心维度评估",
  "1. 重心与身体位置：胯部贴墙不够",
  "2. 发力与动作技术：侧拉时手臂先耗尽",
  "最终改进方案",
  "1. **折膝专项**：练习顶膝后保持 3 秒",
  "整体建议",
  "下次热身时先做 2 组折膝激活。",
].join("\n");

describe("parseAnalysis", () => {
  it("提取评分、金句、时间轴与难度", () => {
    const parsed = parseAnalysis(SAMPLE);

    expect(parsed.score).toBe(82);
    expect(parsed.highlight).toBe("起手重心太靠后");
    expect(parsed.grade).toBe("V5");
    expect(parsed.segments).toHaveLength(3);
    expect(parsed.segments[0]).toMatchObject({
      timestamp: "00:03",
      seconds: 3,
      content: "起步时胯部离墙太远，浪费了一次发力",
    });
    expect(parsed.segments[2].seconds).toBe(24);
  });

  it("识别带方括号与前缀符号的时间戳", () => {
    const parsed = parseAnalysis("- [01:05] 换手迟疑\n* 02:10 落点偏外");
    expect(parsed.segments.map((s) => s.timestamp)).toEqual(["01:05", "02:10"]);
    expect(parsed.segments.map((s) => s.seconds)).toEqual([65, 130]);
  });

  it("解析英文评分与难度缺失时的兜底", () => {
    const parsed = parseAnalysis("Score: 74/100\n00:02 hips too far from wall");
    expect(parsed.score).toBe(74);
    expect(parsed.grade).toBeUndefined();
    expect(parsed.segments).toHaveLength(1);
  });

  it("评分上限为 100", () => {
    expect(parseAnalysis("评分：180/100").score).toBe(100);
  });

  it("没有金句时用第一条时间轴内容兜底", () => {
    const parsed = parseAnalysis("00:07 起步脚点选择不准");
    expect(parsed.highlight).toBe("起步脚点选择不准");
  });

  it("结构化块被解析出来", () => {
    const parsed = parseAnalysis(SAMPLE);
    expect(parsed.structured.hasStructuredContent).toBe(true);
    expect(parsed.structured.improvementBlocks[0]?.title).toBe("折膝专项");
  });
});

describe("formatSeconds", () => {
  it("补零到 MM:SS", () => {
    expect(formatSeconds(5)).toBe("00:05");
    expect(formatSeconds(75)).toBe("01:15");
  });
});
