import { NextResponse } from "next/server";
import { requireUser } from "@/lib/security/auth";
import { rewriteTemplates } from "@/lib/templates";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({ templates: rewriteTemplates });
}
