import { describe, expect, it } from "vitest";
import { parseStructuredReport } from "@lib/parse-structured-report";

const REPORT = [
  "评分：80/100",
  "核心维度评估",
  "1. 重心与身体位置：胯部贴墙不够",
  "2. 发力与动作技术：侧拉时手臂先耗尽",
  "最终改进方案",
  "针对薄弱环节给出以下专项：",
  "1. **折膝专项**",
  "   - 练习：每侧 5 次顶膝保持 3 秒",
  "   - **力量训练：** 负重悬挂 3 组",
  "2. **脚法专项**：静音落点练习",
  "整体建议",
  "下次热身先做折膝激活。",
].join("\n");

describe("parseStructuredReport", () => {
  it("解析核心维度、改进方案与整体建议", () => {
    const report = parseStructuredReport(REPORT);

    expect(report.hasStructuredContent).toBe(true);
    expect(report.dimensionBullets).toEqual([
      "1. 重心与身体位置：胯部贴墙不够",
      "2. 发力与动作技术：侧拉时手臂先耗尽",
    ]);
    expect(report.improvementBlocks).toHaveLength(2);
    expect(report.improvementBlocks[0]).toMatchObject({
      title: "折膝专项",
      practice: "每侧 5 次顶膝保持 3 秒",
      strength: "负重悬挂 3 组",
    });
    expect(report.improvementBlocks[1]).toMatchObject({
      title: "脚法专项",
      lines: ["静音落点练习"],
    });
    expect(report.improvementIntro).toBe("针对薄弱环节给出以下专项：");
    expect(report.overallAdvice).toBe("下次热身先做折膝激活。");
  });

  it("时间轴与评分等元信息不会混入结构化块", () => {
    const report = parseStructuredReport(
      ["评分：90/100", "00:04 起步不错", "核心维度评估", "1. 重心控制良好"].join(
        "\n"
      )
    );

    expect(report.dimensionBullets).toEqual(["1. 重心控制良好"]);
    expect(report.dimensionBullets.join()).not.toContain("00:04");
  });

  it("没有结构化内容时 hasStructuredContent 为 false", () => {
    const report = parseStructuredReport("00:03 只是普通时间轴点评");
    expect(report.hasStructuredContent).toBe(false);
    expect(report.dimensionBullets).toEqual([]);
    expect(report.improvementBlocks).toEqual([]);
  });

  it("无编号的维度描述会作为单条要点保留", () => {
    const report = parseStructuredReport(
      ["核心维度评估", "胯部与墙面的关系需要改善，重心转换不够流畅。"].join("\n")
    );
    expect(report.dimensionBullets).toEqual([
      "胯部与墙面的关系需要改善，重心转换不够流畅。",
    ]);
    expect(report.hasStructuredContent).toBe(true);
  });
});
