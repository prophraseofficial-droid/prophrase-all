import { NextResponse } from "next/server";
import { requireUser } from "@/lib/security/auth";
import { rewriteTemplates } from "@/lib/templates";

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  return NextResponse.json({ templates: rewriteTemplates });
}
