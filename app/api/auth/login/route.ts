import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth-config";
import { loginUser } from "@/lib/auth-server";

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "账户服务未配置（需 POSTGRES_URL 与 AUTH_SECRET）" },
      { status: 503 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "请填写邮箱和密码" }, { status: 400 });
  }

  const result = await loginUser({ email, password });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  return NextResponse.json({ user: result.user });
}
