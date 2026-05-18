import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

const ANALYSIS_PROMPT = `
你是一位专业的抱石（Bouldering）教练。请根据这段攀爬视频，用中文给出结构化分析：
1. 整体动作评价（1-2 句）
2. 优点（条列 2-3 点）
3. 需要改进的地方（条列 2-4 点）
4. 一条可立刻练习的建议

语气鼓励、具体、适合初学者。若看不清或不是攀爬视频，请如实说明。
`.trim();

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "未配置 GEMINI_API_KEY。请在项目根目录创建 .env.local 并填入你的 Google Gemini API Key",
      },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "无法解析上传数据" }, { status: 400 });
  }

  const file = formData.get("video");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "请上传视频文件" }, { status: 400 });
  }

  if (!file.type.startsWith("video/")) {
    return NextResponse.json({ error: "仅支持视频格式" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `视频过大，请小于 ${MAX_BYTES / 1024 / 1024}MB` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  try {
    const result = await model.generateContent([
      { text: ANALYSIS_PROMPT },
      {
        inlineData: {
          mimeType: file.type,
          data: base64,
        },
      },
    ]);

    const analysis = result.response.text();
    if (!analysis) {
      return NextResponse.json({ error: "模型未返回分析结果" }, { status: 500 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("[analyze]", err);
    const message =
      err instanceof Error ? err.message : "分析失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
