import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth-config";
import { getSessionUser } from "@/lib/auth-server";

export async function GET() {
  if (!isAuthConfigured()) {
    return NextResponse.json({ user: null, configured: false });
  }
  const user = await getSessionUser();
  return NextResponse.json({ user, configured: true });
}
