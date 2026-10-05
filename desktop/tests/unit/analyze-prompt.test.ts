import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  PROMPT_VERSION,
  getAnalysisPrompt,
  getGeminiModelId,
  getMaxOutputTokens,
} from "@lib/analyze-prompt";

describe("analyze-prompt", () => {
  it("中文深度提示词包含关键约束", () => {
    const prompt = getAnalysisPrompt("deep", "zh");
    expect(prompt).toContain("难度：V数字");
    expect(prompt).toContain("[MM:SS]");
    expect(prompt).not.toContain("轻量模式");
  });

  it("轻量模式附加字数与条数限制", () => {
    expect(getAnalysisPrompt("light", "zh")).toContain("轻量模式");
    expect(getAnalysisPrompt("light", "en")).toContain("[Light mode]");
  });

  it("英文提示词不含双引号（降低解析干扰）", () => {
    expect(getAnalysisPrompt("deep", "en")).not.toContain('"');
  });

  it("token 上限按深度区分", () => {
    expect(getMaxOutputTokens("light")).toBe(4096);
    expect(getMaxOutputTokens("deep")).toBe(8192);
  });

  it("模型 ID 默认值与常量一致", () => {
    delete process.env.GEMINI_MODEL;
    expect(getGeminiModelId()).toBe(DEFAULT_GEMINI_MODEL);
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    expect(getGeminiModelId()).toBe("gemini-2.5-flash");
    delete process.env.GEMINI_MODEL;
  });

  it("提示词版本号非空", () => {
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d+$/);
  });
});
