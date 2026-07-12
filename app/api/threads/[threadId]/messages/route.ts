import { NextResponse } from "next/server";
import { rewriteWithGemini } from "@/lib/ai/gemini";
import {
  BillingOperationError,
  commitCreditOperation,
  prepareCreditOperation,
  releaseCreditOperation,
  type CreditOperationContext,
} from "@/lib/billing/service";
import { getBillingFlags } from "@/lib/billing/flags";
import { PlanUpgradeRequiredError, requireEntitlement } from "@/lib/billing/entitlements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  getZodErrorMessage,
  messageBodySchema,
  uuidSchema,
  validationError,
} from "@/lib/security/validation";
import {
  buildUsageSummary,
  canSendFollowupForProfile,
  getProfileAndUsageSummary,
  incrementUsage,
} from "@/lib/usage/usage";

type RouteContext = {
  params: Promise<{ threadId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const rateLimit = checkRateLimit(`message:${user.id}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many requests. Please try again shortly.",
      429,
      { retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
  }

  const { threadId: rawThreadId } = await context.params;
  const threadId = uuidSchema.safeParse(rawThreadId);
  if (!threadId.success) return validationError("Invalid thread id.");

  const parsed = messageBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  let creditContext: CreditOperationContext | null = null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId.data)
      .eq("user_id", user.id)
      .maybeSingle();

    if (threadError) throw threadError;
    if (!thread) {
      return apiError("THREAD_NOT_FOUND", "Thread not found.", 404);
    }

    const planData = await getProfileAndUsageSummary(user.id);
    const flags = getBillingFlags();
    const enforcingCredits = flags.creditBillingEnabled && !flags.creditBillingShadowMode;
    if (
      flags.planFeatureGatingEnabled &&
      !["Professional", "Polite", "Shorter"].includes(parsed.data.tone)
    ) {
      await requireEntitlement(user.id, "all_tones");
    }
    if (!enforcingCredits && planData.usage.rewriteCount >= planData.usage.rewriteLimit) {
      return apiError(
        planData.usage.isPro
          ? "PRO_FAIR_USE_LIMIT_REACHED"
          : "FREE_REWRITE_LIMIT_REACHED",
        planData.usage.isPro
          ? "Daily fair-use limit reached. Please try again tomorrow."
          : "You’ve used your free rewrites for today. Compare Plus and Pro credit plans.",
        planData.usage.isPro ? 429 : 402,
        {
          usage: planData.usage,
          upgrade: { monthly: "₹99/month", yearly: "₹899/year" },
        },
      );
    }

    const followupLimit = await canSendFollowupForProfile(
      threadId.data,
      user.id,
      planData.profile,
    );
    if (!enforcingCredits && !followupLimit.allowed) {
      return apiError(
        followupLimit.isPro
          ? "PRO_FAIR_USE_LIMIT_REACHED"
          : "FREE_FOLLOWUP_LIMIT_REACHED",
        followupLimit.isPro
          ? "Thread fair-use limit reached. Please start a new thread."
          : "Free threads include 2 follow-ups. Upgrade to Pro for longer conversations.",
        followupLimit.isPro ? 429 : 402,
        { upgrade: { monthly: "₹99/month", yearly: "₹899/year" } },
      );
    }

    const { data: contextMessages, error: contextError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("thread_id", threadId.data)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(12);

    if (contextError) throw contextError;

    creditContext = await prepareCreditOperation({
      userId: user.id,
      operation: "rephrase",
      text: parsed.data.text,
      idempotencyKey: request.headers.get("idempotency-key"),
      feature: "core_rephrase",
    });

    let aiResult: Awaited<ReturnType<typeof rewriteWithGemini>>;
    try {
      aiResult = await rewriteWithGemini({
        text: parsed.data.text,
        tone: parsed.data.tone,
        contextMessages: (contextMessages ?? []).map((message) => ({
          role: message.role as "user" | "assistant",
          content: String(message.content),
        })),
      });
    } catch {
      await releaseCreditOperation(user.id, creditContext, "ai_provider_error");
      creditContext = null;
      return apiError(
        "AI_PROVIDER_ERROR",
        "Unable to rewrite message right now. Please try again.",
        502,
      );
    }

    const { data: userMessage, error: userInsertError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId.data,
        user_id: user.id,
        role: "user",
        content: parsed.data.text,
        tone: parsed.data.tone,
      })
      .select("*")
      .single();

    if (userInsertError || !userMessage) throw userInsertError;

    const { data: assistantMessage, error: assistantInsertError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId.data,
        user_id: user.id,
        role: "assistant",
        content: aiResult.text,
        tone: parsed.data.tone,
        model: aiResult.model,
        input_tokens: aiResult.inputTokens,
        output_tokens: aiResult.outputTokens,
      })
      .select("*")
      .single();

    if (assistantInsertError || !assistantMessage) throw assistantInsertError;

    const [dailyUsage, threadUpdateResult] = await Promise.all([
      incrementUsage(user.id, { rewriteDelta: 1 }),
      supabase
        .from("threads")
        .update({
          updated_at: new Date().toISOString(),
          tone: parsed.data.tone,
          title:
            thread.title === "New rewrite"
              ? parsed.data.text.slice(0, 80)
              : thread.title,
        })
        .eq("id", threadId.data)
        .eq("user_id", user.id)
        .select("id, title, tone, is_favorite, updated_at")
        .maybeSingle(),
    ]);
    if (threadUpdateResult.error) throw threadUpdateResult.error;

    const usage = buildUsageSummary(planData.profile, dailyUsage);
    const credits = await commitCreditOperation(creditContext);

    return NextResponse.json({
      requestId: creditContext.requestId,
      userMessage,
      assistantMessage,
      result: aiResult.text,
      usage,
      ...(credits ? { credits } : {}),
      thread: threadUpdateResult.data,
    });
  } catch (error) {
    await releaseCreditOperation(user.id, creditContext, "request_failed");
    if (error instanceof BillingOperationError) {
      const status = error.code === "INSUFFICIENT_CREDITS" ? 402
        : error.code === "INPUT_LIMIT_EXCEEDED" ? 403
          : error.code === "CREDIT_REQUEST_IN_PROGRESS" ? 409 : 400;
      return apiError(error.code, error.message, status, error.details);
    }
    if (error instanceof PlanUpgradeRequiredError) {
      return apiError("PLAN_UPGRADE_REQUIRED", error.message, 403, {
        feature: error.feature,
        requiredPlan: error.requiredPlan,
      });
    }
    return apiError("INTERNAL_ERROR", "Unable to send message.", 500);
  }
}
