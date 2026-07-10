import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import {
  apiError,
  createThreadSchema,
  getZodErrorMessage,
  validationError,
} from "@/lib/security/validation";
import { canCreateThread, incrementThreadUsage } from "@/lib/usage/usage";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ threads: data ?? [] });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load threads.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = createThreadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  try {
    const limit = await canCreateThread(user.id);
    if (!limit.allowed) {
      return apiError(
        "FREE_THREAD_LIMIT_REACHED",
        limit.summary.isPro
          ? "Thread fair-use limit reached. Please try again tomorrow."
          : "You have used your free threads for today. Upgrade to Pro for unlimited threads.",
        limit.summary.isPro ? 429 : 402,
        {
          usage: limit.summary,
          upgrade: { monthly: "₹99/month", yearly: "₹699/year" },
        },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("threads")
      .insert({
        user_id: user.id,
        title: parsed.data.title || "New rewrite",
        tone: parsed.data.tone,
      })
      .select("*")
      .single();

    if (error || !data) throw error ?? new Error("THREAD_CREATE_FAILED");

    await incrementThreadUsage(user.id);

    return NextResponse.json({ thread: data }, { status: 201 });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to create thread.", 500);
  }
}
