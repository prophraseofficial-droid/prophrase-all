import { NextResponse } from "next/server";
import { AiProviderError, rewriteWithGemini } from "@/lib/ai/gemini";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  getZodErrorMessage,
  rewriteBodySchema,
  validationError,
} from "@/lib/security/validation";
import {
  buildUsageSummary,
  canSendFollowupForProfile,
  getProfileAndUsageSummary,
  incrementUsage,
} from "@/lib/usage/usage";

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const rateLimit = checkRateLimit(`rewrite:${user.id}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many rewrite requests. Please try again shortly.",
      429,
      { retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
  }

  const parsed = rewriteBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  try {
    const supabase = createSupabaseAdminClient();
    const planData = await getProfileAndUsageSummary(user.id);
    if (planData.usage.rewriteCount >= planData.usage.rewriteLimit) {
      return apiError(
        planData.usage.isPro
          ? "PRO_FAIR_USE_LIMIT_REACHED"
          : "FREE_REWRITE_LIMIT_REACHED",
        planData.usage.isPro
          ? "Daily fair-use limit reached. Please try again tomorrow."
          : "You’ve used your free rewrites for today. Upgrade to Pro for unlimited rewrites.",
        planData.usage.isPro ? 429 : 402,
        {
          usage: planData.usage,
          upgrade: { monthly: "₹99/month", yearly: "₹699/year" },
        },
      );
    }

    let threadId = parsed.data.threadId;
    let isNewThread = false;
    let contextMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    const now = new Date().toISOString();
    const fallbackTitle = parsed.data.text.slice(0, 80);

    if (threadId) {
      const { data: thread, error: threadError } = await supabase
        .from("threads")
        .select("id, user_id")
        .eq("id", threadId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (threadError) throw threadError;
      if (!thread) {
        return apiError("THREAD_NOT_FOUND", "Thread not found.", 404);
      }

      const followupLimit = await canSendFollowupForProfile(
        threadId,
        user.id,
        planData.profile,
      );
      if (!followupLimit.allowed) {
        return apiError(
          followupLimit.isPro
            ? "PRO_FAIR_USE_LIMIT_REACHED"
            : "FREE_FOLLOWUP_LIMIT_REACHED",
          followupLimit.isPro
            ? "Thread fair-use limit reached. Please start a new thread."
            : "Free threads include 2 follow-ups. Upgrade to Pro for longer conversations.",
          followupLimit.isPro ? 429 : 402,
          { upgrade: { monthly: "₹99/month", yearly: "₹699/year" } },
        );
      }

      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("role, content")
        .eq("thread_id", threadId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(12);

      if (messagesError) throw messagesError;
      contextMessages = (messages ?? []).map((message) => ({
        role: message.role as "user" | "assistant",
        content: String(message.content),
      }));
    } else {
      if (planData.usage.threadCount >= planData.usage.threadLimit) {
        return apiError(
          planData.usage.isPro
            ? "PRO_FAIR_USE_LIMIT_REACHED"
            : "FREE_THREAD_LIMIT_REACHED",
          planData.usage.isPro
            ? "Thread fair-use limit reached. Please try again tomorrow."
            : "You have used your free threads for today. Upgrade to Pro for unlimited threads.",
          planData.usage.isPro ? 429 : 402,
          {
            usage: planData.usage,
            upgrade: { monthly: "₹99/month", yearly: "₹699/year" },
          },
        );
      }
      isNewThread = true;
    }

    let aiResult: Awaited<ReturnType<typeof rewriteWithGemini>>;
    try {
      aiResult = await rewriteWithGemini({
        text: parsed.data.text,
        tone: parsed.data.tone,
        instruction: parsed.data.instruction,
        contextMessages,
      });
    } catch (caughtError) {
      if (caughtError instanceof AiProviderError) {
        console.error("[rewrite] Gemini provider error", {
          providerStatus: caughtError.providerStatus,
          statusCode: caughtError.statusCode,
          message: caughtError.message,
        });

        return apiError(
          caughtError.providerStatus === "RESOURCE_EXHAUSTED"
            ? "AI_PROVIDER_QUOTA_EXHAUSTED"
            : "AI_PROVIDER_ERROR",
          caughtError.userMessage,
          caughtError.statusCode === 429 ? 429 : 502,
        );
      }

      console.error("[rewrite] Gemini provider error", caughtError);
      return apiError(
        "AI_PROVIDER_ERROR",
        "Unable to rewrite message right now. Please try again.",
        502,
      );
    }

    if (!threadId) {
      const { data: thread, error: threadError } = await supabase
        .from("threads")
        .insert({
          user_id: user.id,
          title: fallbackTitle,
          tone: parsed.data.tone,
        })
        .select("id, title, tone, is_favorite, updated_at")
        .single();

      if (threadError || !thread) throw threadError;
      threadId = thread.id;
    }

    const { data: insertedMessages, error: insertError } = await supabase
      .from("messages")
      .insert([
        {
          thread_id: threadId,
          user_id: user.id,
          role: "user",
          content: parsed.data.text,
          tone: parsed.data.tone,
        },
        {
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content: aiResult.text,
          tone: parsed.data.tone,
          model: aiResult.model,
          input_tokens: aiResult.inputTokens,
          output_tokens: aiResult.outputTokens,
        },
      ])
      .select("*")
      .order("created_at", { ascending: true });

    if (insertError || !insertedMessages || insertedMessages.length < 2) {
      throw insertError ?? new Error("MESSAGE_INSERT_FAILED");
    }
    const userMessage = insertedMessages.find((message) => message.role === "user");
    const assistantMessage = insertedMessages.find(
      (message) => message.role === "assistant",
    );
    if (!userMessage || !assistantMessage) throw new Error("MESSAGE_INSERT_FAILED");

    const [dailyUsage, threadUpdateResult] = await Promise.all([
      incrementUsage(user.id, {
        rewriteDelta: 1,
        threadDelta: isNewThread ? 1 : 0,
      }),
      supabase
        .from("threads")
        .update({
          title: isNewThread ? fallbackTitle : undefined,
          updated_at: now,
          tone: parsed.data.tone,
        })
        .eq("id", threadId)
        .eq("user_id", user.id)
        .select("id, title, tone, is_favorite, updated_at")
        .maybeSingle(),
    ]);
    if (threadUpdateResult.error) throw threadUpdateResult.error;

    const usage = buildUsageSummary(planData.profile, dailyUsage);

    return NextResponse.json({
      result: aiResult.text,
      threadId,
      messageId: assistantMessage.id,
      userMessage,
      assistantMessage,
      usage,
      thread: threadUpdateResult.data ?? {
        id: threadId,
        title: fallbackTitle,
        tone: parsed.data.tone,
        is_favorite: false,
        updated_at: now,
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to rewrite message.", 500);
  }
}
