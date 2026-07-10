import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import {
  apiError,
  getZodErrorMessage,
  updateThreadSchema,
  uuidSchema,
  validationError,
} from "@/lib/security/validation";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

async function getThreadId(context: RouteContext) {
  const { threadId } = await context.params;
  const parsed = uuidSchema.safeParse(threadId);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const threadId = await getThreadId(context);
  if (!threadId) return validationError("Invalid thread id.");

  try {
    const supabase = createSupabaseAdminClient();
    const { data: thread, error } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!thread) {
      return apiError("THREAD_NOT_FOUND", "Thread not found.", 404);
    }

    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    return NextResponse.json({ thread, messages: messages ?? [] });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load thread.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const threadId = await getThreadId(context);
  if (!threadId) return validationError("Invalid thread id.");

  const parsed = updateThreadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("threads")
      .update(parsed.data)
      .eq("id", threadId)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return apiError("THREAD_NOT_FOUND", "Thread not found.", 404);
    }

    return NextResponse.json({ thread: data });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to update thread.", 500);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const threadId = await getThreadId(context);
  if (!threadId) return validationError("Invalid thread id.");

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("threads")
      .update({ is_archived: true })
      .eq("id", threadId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return apiError("THREAD_NOT_FOUND", "Thread not found.", 404);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to archive thread.", 500);
  }
}
