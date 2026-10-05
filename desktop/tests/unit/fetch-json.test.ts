import { describe, expect, it } from "vitest";
import {
  errorFromFetchJson,
  explainFetchError,
  humanizeNonJsonBody,
  inferStatusFromBody,
  isLikelyJsonParseError,
  readFetchJson,
} from "@lib/fetch-json";

describe("humanizeNonJsonBody", () => {
  it("把 413 纯文本翻译成体积提示", () => {
    expect(humanizeNonJsonBody(413, "Request Entity Too Large")).toContain(
      "超过服务器限制"
    );
    expect(humanizeNonJsonBody(200, "payload too large")).toContain(
      "超过服务器限制"
    );
  });

  it("翻译 502/503/504", () => {
    expect(humanizeNonJsonBody(502, "blob error")).toContain("Vercel Blob");
    expect(humanizeNonJsonBody(504, "timeout")).toContain("超时");
    expect(humanizeNonJsonBody(503, "down")).toContain("不可用");
  });

  it("截断超长文本", () => {
    const long = "x".repeat(1000);
    expect(humanizeNonJsonBody(500, long).length).toBeLessThanOrEqual(280);
  });
});

describe("inferStatusFromBody", () => {
  it("从正文推断状态码", () => {
    expect(inferStatusFromBody(200, "Request Entity Too Large")).toBe(413);
    expect(inferStatusFromBody(200, "gateway timeout")).toBe(504);
    expect(inferStatusFromBody(200, "ok")).toBe(200);
    expect(inferStatusFromBody(0, "ok")).toBe(500);
  });
});

describe("readFetchJson", () => {
  it("解析 JSON 响应", async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const parsed = await readFetchJson<{ ok: boolean }>(res);
    expect(parsed).toMatchObject({ ok: true, status: 200, parseError: false });
    expect(parsed.data?.ok).toBe(true);
  });

  it("纯文本错误正文不抛 JSON 异常", async () => {
    const res = new Response("Request Entity Too Large", { status: 413 });
    const parsed = await readFetchJson(res);
    expect(parsed.parseError).toBe(true);
    expect(parsed.status).toBe(413);
    expect(parsed.data).toBeNull();
  });

  it("空正文标记为非 ok", async () => {
    const res = new Response("", { status: 502 });
    const parsed = await readFetchJson(res);
    expect(parsed.data).toBeNull();
    expect(parsed.parseError).toBe(true);
  });
});

describe("errorFromFetchJson", () => {
  it("服务端 error 字段优先，并按状态码判断可重试", async () => {
    const res = new Response(JSON.stringify({ error: "限流了" }), { status: 429 });
    const parsed = await readFetchJson<{ error?: string }>(res);
    expect(errorFromFetchJson(parsed, "兜底")).toMatchObject({
      message: "限流了",
      retryable: true,
    });
  });

  it("4xx 业务错误不可重试", async () => {
    const res = new Response(JSON.stringify({ error: "参数错误" }), { status: 400 });
    const parsed = await readFetchJson<{ error?: string }>(res);
    expect(errorFromFetchJson(parsed, "兜底")).toMatchObject({
      message: "参数错误",
      retryable: false,
    });
  });
});

describe("explainFetchError", () => {
  it("识别取消", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(explainFetchError(err)).toMatchObject({
      message: "已取消",
      retryable: true,
    });
  });

  it("识别 JSON 解析失败并翻译为体积提示", () => {
    const result = explainFetchError(
      new Error("Unexpected token 'R', Request Entity Too Large")
    );
    expect(result.message).toContain("超过服务器限制");
  });

  it("识别网络失败并给出排查建议", () => {
    const result = explainFetchError(new Error("Failed to fetch"));
    expect(result.message).toContain("无法连接服务器");
    expect(result.retryable).toBe(true);
  });

  it("isLikelyJsonParseError 区分 JSON 错误与网络错误", () => {
    expect(isLikelyJsonParseError(new Error("Unexpected token < in JSON"))).toBe(
      true
    );
    expect(isLikelyJsonParseError(new Error("Failed to fetch"))).toBe(false);
  });
});
