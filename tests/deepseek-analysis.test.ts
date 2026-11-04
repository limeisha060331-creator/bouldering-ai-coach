import { describe, expect, it, vi } from "vitest";
import {
  DeepSeekApiError,
  DeepSeekEmptyAnalysisError,
  buildDeepSeekRequest,
  getFrameAnalysisPrompt,
  parseDeepSeekResponse,
  runDeepSeekAnalysis,
} from "../lib/deepseek-analysis";
import type { AnalyzeFrame } from "../lib/frame-extraction";

function frames(count = 2): AnalyzeFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    seconds: i * 3,
    timestamp: `00:${String(i * 3).padStart(2, "0")}`,
    dataUrl: `data:image/jpeg;base64,F${i}`,
  }));
}

describe("buildDeepSeekRequest", () => {
  it("按时间顺序交替插入文字与图片", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      depth: "deep",
      locale: "zh",
      frames: frames(3),
    });
    expect(request.url).toBe("https://api.deepseek.com/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-test");

    const blocks = request.body.messages[0].content;
    expect(Array.isArray(blocks)).toBe(true);
    if (!Array.isArray(blocks)) return;
    expect(blocks).toHaveLength(1 + 3 * 2);
    expect(blocks[1]).toMatchObject({ type: "text", text: "第 1/3 帧 · 时间 00:00" });
    expect(blocks[2]).toMatchObject({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,F0" },
    });
    expect(blocks.at(-2)).toMatchObject({ text: "第 3/3 帧 · 时间 00:06" });
  });

  it("轻量模式关闭思考链", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      depth: "light",
      locale: "zh",
      frames: frames(1),
    });
    expect(request.body.thinking).toEqual({ type: "disabled" });
    expect(request.body.max_tokens).toBe(4096);
  });

  it("自定义提示词可覆盖默认抽帧提示词", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      depth: "deep",
      locale: "en",
      frames: frames(1),
      prompt: "CUSTOM PROMPT",
    });
    const blocks = request.body.messages[0].content;
    if (!Array.isArray(blocks)) throw new Error("expected blocks");
    expect(blocks[0]).toMatchObject({ type: "text" });
    expect((blocks[0] as { text: string }).text).toContain("CUSTOM PROMPT");
  });
});

describe("getFrameAnalysisPrompt", () => {
  it("声明输入是离散关键帧并禁止编造", () => {
    const prompt = getFrameAnalysisPrompt("deep", "zh", 16);
    expect(prompt).toContain("离散关键帧");
    expect(prompt).toContain("不要编造");
    expect(prompt).toContain("[MM:SS]");
    expect(prompt).toContain("本次共 16 张关键帧");
  });
});

describe("parseDeepSeekResponse", () => {
  it("返回正文与 usage", () => {
    const parsed = parseDeepSeekResponse({
      choices: [{ message: { content: "  难度：V4\n[00:03] 起步偏后  " } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    });
    expect(parsed.text).toBe("难度：V4\n[00:03] 起步偏后");
    expect(parsed.usage).toMatchObject({ promptTokens: 100, outputTokens: 20 });
  });

  it("空正文 / 截断 / 过滤都抛可重试错误", () => {
    expect(() => parseDeepSeekResponse({})).toThrow(DeepSeekEmptyAnalysisError);
    expect(() =>
      parseDeepSeekResponse({
        choices: [{ message: { content: null }, finish_reason: "length" }],
      })
    ).toThrow(/轻量/);
    expect(() =>
      parseDeepSeekResponse({
        choices: [{ message: { content: "" }, finish_reason: "content_filter" }],
      })
    ).toThrow(/内容策略/);
  });
});

describe("runDeepSeekAnalysis", () => {
  it("成功时返回正文、模型与耗时", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "难度：V5\n[00:02] 重心偏后" } }],
          usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const detail = await runDeepSeekAnalysis({
      apiKey: "sk-test",
      depth: "deep",
      locale: "zh",
      frames: frames(2),
      fetchImpl,
      maxAttempts: 1,
    });

    expect(detail.text).toContain("难度：V5");
    expect(detail.modelId).toBe("deepseek-flash");
    expect(detail.usage?.totalTokens).toBe(1020);
  });

  it("429 自动重试后成功，并记录尝试次数", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ error: { message: "slow down" } }), {
          status: 429,
        });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "第二次成功" } }] }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const detail = await runDeepSeekAnalysis({
      apiKey: "sk-test",
      depth: "deep",
      locale: "zh",
      frames: frames(1),
      fetchImpl,
      maxAttempts: 2,
      sleep: async () => undefined,
    });

    expect(detail.attempts).toBe(2);
    expect(detail.text).toBe("第二次成功");
  });

  it("402 余额不足不可重试", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Insufficient Balance" } }),
          { status: 402 }
        )
    ) as unknown as typeof fetch;

    await expect(
      runDeepSeekAnalysis({
        apiKey: "sk-test",
        depth: "deep",
        locale: "zh",
        frames: frames(1),
        fetchImpl,
        maxAttempts: 3,
        sleep: async () => undefined,
      })
    ).rejects.toMatchObject({ status: 402, retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("网络异常转成可重试的 DeepSeekApiError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;

    await expect(
      runDeepSeekAnalysis({
        apiKey: "sk-test",
        depth: "deep",
        locale: "zh",
        frames: frames(1),
        fetchImpl,
        maxAttempts: 1,
      })
    ).rejects.toBeInstanceOf(DeepSeekApiError);
  });
});
