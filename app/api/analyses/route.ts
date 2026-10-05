import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import {
  listCloudAnalyses,
  upsertCloudAnalysis,
} from "@/lib/supabase/analysis-repo";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import type { AnalysisRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 单条记录的 thumbnail 是 base64 data URL，限制体积避免写爆请求体 */
const MAX_THUMBNAIL_CHARS = 2_000_000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({
      analyses: [],
      authenticated: false,
      configured: false,
    });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({
      analyses: [],
      authenticated: false,
      configured: true,
    });
  }

  try {
    const analyses = await listCloudAnalyses(user.id);
    return NextResponse.json({
      analyses,
      authenticated: true,
      configured: true,
    });
  } catch (error) {
    console.error("[analyses] 读取失败", error);
    return NextResponse.json({
      analyses: [],
      authenticated: true,
      configured: true,
      error: messageOf(error),
    });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase 未配置，请先设置环境变量" },
      { status: 503 }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再同步" }, { status: 401 });
  }

  let body: { record?: unknown };
  try {
    body = (await req.json()) as { record?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const record = body.record as AnalysisRecord | undefined;
  if (
    !record ||
    typeof record.id !== "string" ||
    !record.id.trim() ||
    typeof record.fileName !== "string" ||
    typeof record.analysis !== "string"
  ) {
    return NextResponse.json({ error: "分析记录格式无效" }, { status: 400 });
  }

  if (
    typeof record.thumbnail === "string" &&
    record.thumbnail.length > MAX_THUMBNAIL_CHARS
  ) {
    record.thumbnail = "";
  }

  try {
    await upsertCloudAnalysis(user.id, record);
    return NextResponse.json({ ok: true, id: record.id });
  } catch (error) {
    console.error("[analyses] 写入失败", error);
    return NextResponse.json({ error: messageOf(error) }, { status: 500 });
  }
}
