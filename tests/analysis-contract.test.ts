import { describe, expect, it } from "vitest";
import {
  parseAnalysisContract,
  sanitizeSegments,
} from "../lib/analysis-schema";
import { parseAnalysis } from "../lib/parse-analysis";
import { parseDimensionScores } from "../lib/eval-metrics";

const CONTRACT = {
  grade: "V4",
  score: 78,
  dimensionScores: {
    hips: 4,
    power: 3,
    feet: 4,
    sequence: 3,
    completion: 5,
  },
  highlight: "起步那一脚踩虚了，后面都在补债",
  segments: [
    {
      t: "00:03",
      evidence: "右脚踩在岩点边缘，脚尖没有压住，身体先向外倒",
      fix: "脚尖先压住再站起，胯部主动贴墙",
    },
    {
      t: "00:12",
      evidence: "侧拉时肩膀耸起，先拉后蹬",
      fix: "先移重心到左脚，再蹬腿出手",
    },
  ],
  dimensionSummary: ["重心与身体位置：胯部离墙偏远"],
  improvements: [
    {
      title: "折膝方向",
      practice: "30 度墙慢速折膝换脚，8 次 3 组",
      strength: "单腿箱式深蹲，8 次 3 组",
    },
  ],
  overallAdvice: "先把脚踩实再出手",
};

describe("analysis-contract", () => {
  it("裸 JSON 能解析出分数、难度、五维分和证据链", () => {
    const raw = JSON.stringify(CONTRACT);
    const contract = parseAnalysisContract(raw);

    expect(contract).not.toBeNull();

    const parsed = parseAnalysis(raw);
    expect(parsed.score).toBe(78);
    expect(parsed.grade).toBe("V4");
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments[0].seconds).toBe(3);
    expect(parsed.segments[0].content).toContain("脚尖先压住再站起");
    expect(parsed.structured.improvementBlocks).toHaveLength(1);
    expect(parsed.structured.dimensionBullets).toHaveLength(1);
    expect(parseDimensionScores(raw)).toEqual(CONTRACT.dimensionScores);
  });

  it("被 markdown 代码块包裹也能解析", () => {
    const raw = `\`\`\`json\n${JSON.stringify(CONTRACT)}\n\`\`\``;

    expect(parseAnalysisContract(raw)).not.toBeNull();
    expect(parseAnalysis(raw).score).toBe(78);
  });

  it("JSON 前后夹了多余文字也能抠出来", () => {
    const raw = `好的，这是分析：\n${JSON.stringify(CONTRACT)}\n希望对你有帮助。`;

    expect(parseAnalysis(raw).score).toBe(78);
  });

  it("分数越界时不认这段契约，回落到文本解析", () => {
    const raw = JSON.stringify({ ...CONTRACT, score: 130 });

    expect(parseAnalysisContract(raw)).toBeNull();
    const parsed = parseAnalysis(raw);
    expect(parsed.score).toBeNull();
    expect(parsed.segments).toHaveLength(0);
  });

  it("时间戳格式不对时不认契约", () => {
    const raw = JSON.stringify({
      ...CONTRACT,
      segments: [{ t: "3 秒", evidence: "右脚没有压住点", fix: "先压住" }],
    });

    expect(parseAnalysisContract(raw)).toBeNull();
  });

  it("缺少五维分时不认契约，避免拿半个分数当完整报告", () => {
    const rest: Record<string, unknown> = { ...CONTRACT };
    delete rest.dimensionScores;
    const raw = JSON.stringify(rest);

    expect(parseAnalysisContract(raw)).toBeNull();
  });

  it("sanitizeSegments 丢弃越界项并按时间排序", () => {
    const raw = JSON.stringify({
      ...CONTRACT,
      segments: [
        { t: "01:30", evidence: "这一步其实超出视频时长", fix: "先压住" },
        { t: "00:12", evidence: "侧拉时肩膀耸起，先拉后蹬", fix: "先移重心" },
        { t: "00:03", evidence: "右脚踩在岩点边缘，脚尖没有压住", fix: "先压住" },
      ],
    });

    const parsed = sanitizeSegments(parseAnalysis(raw), 30);

    expect(parsed.segments.map((item) => item.timestamp)).toEqual([
      "00:03",
      "00:12",
    ]);
  });
});
