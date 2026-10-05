import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import {
  deleteCloudAnalysis,
  getCloudAnalysis,
  patchCloudAnalysis,
} from "@/lib/supabase/analysis-repo";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import type { AnalysisRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

export async function GET(_req: Request, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ analysis: null, configured: false });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ analysis: null, authenticated: false });
  }

  const { id } = await context.params;
  try {
    const analysis = await getCloudAnalysis(user.id, id);
    return NextResponse.json({ analysis, authenticated: true });
  } catch (error) {
    console.error("[analyses/:id] 读取失败", error);
    return NextResponse.json({ analysis: null, error: messageOf(error) });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase 未配置" }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再同步" }, { status: 401 });
  }

  let body: { patch?: unknown };
  try {
    body = (await req.json()) as { patch?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const patch = body.patch as Partial<AnalysisRecord> | undefined;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "patch 无效" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const analysis = await patchCloudAnalysis(user.id, id, patch);
    if (!analysis) {
      return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    console.error("[analyses/:id] 更新失败", error);
    return NextResponse.json({ error: messageOf(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "Supabase 未配置" }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录后再同步" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const deleted = await deleteCloudAnalysis(user.id, id);
    return NextResponse.json({ ok: deleted });
  } catch (error) {
    console.error("[analyses/:id] 删除失败", error);
    return NextResponse.json({ error: messageOf(error) }, { status: 500 });
  }
}
