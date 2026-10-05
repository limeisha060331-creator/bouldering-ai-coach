// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  DeepSeekApiError,
  DeepSeekEmptyAnalysisError,
  buildDeepSeekRequest,
  describeDeepSeekStatus,
  getDeepSeekMaxTokens,
  getFrameAnalysisPrompt,
  parseDeepSeekResponse,
  runDeepSeekAnalysis,
} from "../../electron/deepseek-analyze";
import { DEFAULT_DEEPSEEK_MODEL } from "@shared/providers";
import type { AnalyzeFrame } from "@shared/ipc";

function frames(count = 3): AnalyzeFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    seconds: i * 2,
    timestamp: `00:${String(i * 2).padStart(2, "0")}`,
    dataUrl: `data:image/jpeg;base64,FRAME${i}`,
  }));
}

describe("getFrameAnalysisPrompt", () => {
  const prompt = getFrameAnalysisPrompt("deep", "zh", 16);

  it("保留网页版的关键约束", () => {
    expect(prompt).toContain("[MM:SS]");
    expect(prompt).toContain("难度：V数字");
    expect(prompt).toContain("禁止使用任何双引号");
    expect(prompt).toContain("核心维度评估");
    expect(prompt).toContain("最终改进方案");
    expect(prompt).toContain("评分：数字/100");
  });

  it("说明输入是离散关键帧并要求不要编造", () => {
    expect(prompt).toContain("离散关键帧");
    expect(prompt).toContain("不要编造");
  });

  it("写入帧数，并在轻量模式附加限制", () => {
    expect(prompt).toContain("本次共 16 张关键帧");
    expect(getFrameAnalysisPrompt("light", "zh", 8)).toContain("轻量模式");
    expect(getFrameAnalysisPrompt("light", "en", 8)).toContain("[Light mode]");
  });

  it("英文提示词不含双引号", () => {
    expect(getFrameAnalysisPrompt("deep", "en", 12)).not.toContain('"');
  });
});

describe("getDeepSeekMaxTokens", () => {
  it("按深度区分输出上限", () => {
    expect(getDeepSeekMaxTokens("light")).toBe(4096);
    expect(getDeepSeekMaxTokens("deep")).toBe(16_384);
  });
});

describe("buildDeepSeekRequest", () => {
  it("构造 OpenAI 兼容的请求（默认模型 + Bearer 鉴权）", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      depth: "deep",
      locale: "zh",
      frames: frames(2),
    });

    expect(request.url).toBe("https://api.deepseek.com/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-test");
    expect(request.body.model).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(request.body.stream).toBe(false);
    expect(request.body.max_tokens).toBe(16_384);
    expect(request.body.thinking).toBeUndefined();
  });

  it("每张关键帧前插入时间标注，图片按顺序排在其后", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      depth: "deep",
      locale: "zh",
      frames: frames(3),
    });

    const content = request.body.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const blocks = content as Exclude<typeof content, string>;

    // 1 段说明 + 每帧 2 段（文字 + 图片）
    expect(blocks).toHaveLength(1 + 3 * 2);
    expect(blocks[1]).toEqual({
      type: "text",
      text: "第 1/3 帧 · 时间 00:00",
    });
    expect(blocks[2]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,FRAME0" },
    });
    expect(blocks[5]).toMatchObject({ type: "text", text: "第 3/3 帧 · 时间 00:04" });
  });

  it("轻量模式关闭思考链以加快响应", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      depth: "light",
      locale: "zh",
      frames: frames(1),
    });
    expect(request.body.thinking).toEqual({ type: "disabled" });
    expect(request.body.max_tokens).toBe(4096);
  });

  it("支持自定义 baseUrl 与模型", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      baseUrl: "https://example.com/v1/",
      model: "deepseek-flash",
      depth: "deep",
      locale: "zh",
      frames: frames(1),
    });
    expect(request.url).toBe("https://example.com/v1/chat/completions");
  });

  it("英文界面使用英文帧标注", () => {
    const request = buildDeepSeekRequest({
      apiKey: "sk-test",
      depth: "deep",
      locale: "en",
      frames: frames(2),
    });
    const blocks = request.body.messages[0].content as unknown[];
    expect(blocks[1]).toMatchObject({
      type: "text",
      text: "Frame 1/2 · timestamp 00:00",
    });
  });
});

describe("parseDeepSeekResponse", () => {
  it("取回正文", () => {
    const text = parseDeepSeekResponse({
      choices: [{ message: { content: "  难度：V4\n00:03 起步偏后  " } }],
    });
    expect(text).toBe("难度：V4\n00:03 起步偏后");
  });

  it("空正文抛可重试错误", () => {
    expect(() => parseDeepSeekResponse({ choices: [{ message: {} }] })).toThrow(
      DeepSeekEmptyAnalysisError
    );
    expect(() => parseDeepSeekResponse({})).toThrow(DeepSeekEmptyAnalysisError);
  });

  it("被截断时给出可操作提示", () => {
    expect(() =>
      parseDeepSeekResponse({
        choices: [{ message: { content: null }, finish_reason: "length" }],
      })
    ).toThrow(/轻量/);
  });
});

describe("describeDeepSeekStatus", () => {
  it("401 / 402 不可重试", () => {
    expect(describeDeepSeekStatus(401)).toMatchObject({
      retryable: false,
    });
    expect(describeDeepSeekStatus(402).message).toContain("余额不足");
    expect(describeDeepSeekStatus(402).retryable).toBe(false);
  });

  it("429 与 5xx 可重试", () => {
    expect(describeDeepSeekStatus(429)).toMatchObject({
      retryable: true,
      waitSeconds: 20,
    });
    expect(describeDeepSeekStatus(503).retryable).toBe(true);
    expect(describeDeepSeekStatus(500).retryable).toBe(true);
  });

  it("400 / 422 不可重试并带上服务端细节", () => {
    const result = describeDeepSeekStatus(400, "unsupported content type");
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("unsupported content type");
  });
});

describe("runDeepSeekAnalysis", () => {
  it("成功时返回正文，并把请求发到 DeepSeek", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "难度：V5\n00:02 起步重心偏后" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );

    const text = await runDeepSeekAnalysis({
      apiKey: "sk-test",
      depth: "deep",
      locale: "zh",
      frames: frames(2),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(text).toContain("难度：V5");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init?.method).toBe("POST");
  });

  it("402 翻译为余额不足且不可重试", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), {
        status: 402,
      })
    );

    await expect(
      runDeepSeekAnalysis({
        apiKey: "sk-test",
        depth: "deep",
        locale: "zh",
        frames: frames(1),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ status: 402, retryable: false });
  });

  it("网络异常转成可重试错误", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.deepseek.com");
    });

    await expect(
      runDeepSeekAnalysis({
        apiKey: "sk-test",
        depth: "deep",
        locale: "zh",
        frames: frames(1),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(DeepSeekApiError);
  });

  it("非 JSON 响应体也能给出可读错误", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html>Bad Gateway</html>", { status: 502 })
    );

    await expect(
      runDeepSeekAnalysis({
        apiKey: "sk-test",
        depth: "deep",
        locale: "zh",
        frames: frames(1),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ status: 502, retryable: true });
  });
});
