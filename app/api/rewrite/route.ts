import { NextResponse } from "next/server";
import {
  AiProviderError,
  AiValidationError,
  rewriteWithGemini,
} from "@/lib/ai/gemini";
import {
  BillingOperationError,
  creditFailureSummary,
  commitCreditOperation,
  prepareCreditOperation,
  releaseCreditOperation,
  type CreditOperationContext,
} from "@/lib/billing/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { requireEntitlement, PlanUpgradeRequiredError } from "@/lib/billing/entitlements";
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

  let creditContext: CreditOperationContext | null = null;
  let releaseReservationOnFailure = true;
  try {
    const supabase = createSupabaseAdminClient();
    const planData = await getProfileAndUsageSummary(user.id);
    const billingFlags = (await import("@/lib/billing/flags")).getBillingFlags();
    const creditEnforcementActive =
      billingFlags.creditBillingEnabled && !billingFlags.creditBillingShadowMode;
    if (
      billingFlags.planFeatureGatingEnabled &&
      !["Professional", "Polite", "Shorter"].includes(parsed.data.tone)
    ) {
      await requireEntitlement(user.id, "all_tones");
    }
    if (!creditEnforcementActive && planData.usage.rewriteCount >= planData.usage.rewriteLimit) {
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

      if (!creditEnforcementActive) {
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
            { upgrade: { monthly: "₹99/month", yearly: "₹899/year" } },
          );
        }
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
      if (
        !creditEnforcementActive &&
        planData.usage.threadCount >= planData.usage.threadLimit
      ) {
        return apiError(
          planData.usage.isPro
            ? "PRO_FAIR_USE_LIMIT_REACHED"
            : "FREE_THREAD_LIMIT_REACHED",
          planData.usage.isPro
            ? "Thread fair-use limit reached. Please try again tomorrow."
            : "You have used your free threads for today. Compare Plus and Pro credit plans.",
          planData.usage.isPro ? 429 : 402,
          {
            usage: planData.usage,
            upgrade: { monthly: "₹99/month", yearly: "₹899/year" },
          },
        );
      }
      isNewThread = true;
    }

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
        instruction: parsed.data.instruction,
        contextMessages,
      });
    } catch (caughtError) {
      if (caughtError instanceof AiValidationError) {
        await releaseCreditOperation(user.id, creditContext, "semantic_validation_failed");
        const credits = await creditFailureSummary(user.id, creditContext);
        creditContext = null;
        return apiError(
          "INVALID_AI_OUTPUT",
          caughtError.userMessage,
          422,
          credits ? { credits } : undefined,
        );
      }
      if (caughtError instanceof AiProviderError) {
        await releaseCreditOperation(user.id, creditContext, "ai_provider_error");
        const credits = await creditFailureSummary(user.id, creditContext);
        creditContext = null;
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
          credits ? { credits } : undefined,
        );
      }

      await releaseCreditOperation(user.id, creditContext, "ai_provider_error");
      const credits = await creditFailureSummary(user.id, creditContext);
      creditContext = null;
      console.error("[rewrite] Gemini provider error", caughtError);
      return apiError(
        "AI_PROVIDER_ERROR",
        "Unable to rewrite message right now. Please try again.",
        502,
        credits ? { credits } : undefined,
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
    releaseReservationOnFailure = false;
    const credits = await commitCreditOperation(creditContext);

    return NextResponse.json({
      requestId: creditContext.requestId,
      result: aiResult.text,
      warnings: aiResult.warnings,
      promptVersion: aiResult.promptVersion,
      repaired: aiResult.repaired,
      threadId,
      messageId: assistantMessage.id,
      userMessage,
      assistantMessage,
      usage,
      ...(credits ? { credits } : {}),
      thread: threadUpdateResult.data ?? {
        id: threadId,
        title: fallbackTitle,
        tone: parsed.data.tone,
        is_favorite: false,
        updated_at: now,
      },
    });
  } catch (caughtError) {
    if (releaseReservationOnFailure) {
      await releaseCreditOperation(user.id, creditContext, "request_failed");
    }
    if (caughtError instanceof BillingOperationError) {
      const status = caughtError.code === "INSUFFICIENT_CREDITS" ? 402
        : caughtError.code === "INPUT_LIMIT_EXCEEDED" ? 403
          : caughtError.code === "CREDIT_REQUEST_IN_PROGRESS" ? 409
            : 400;
      return apiError(caughtError.code, caughtError.message, status, {
        ...caughtError.details,
        ...(creditContext ? { requiredCredits: creditContext.estimate.creditCost } : {}),
      });
    }
    if (caughtError instanceof PlanUpgradeRequiredError) {
      return apiError(caughtError.code, caughtError.message, 403, {
        feature: caughtError.feature,
        requiredPlan: caughtError.requiredPlan,
      });
    }
    const credits = await creditFailureSummary(user.id, creditContext);
    return apiError("INTERNAL_ERROR", "Unable to rewrite message. No credits were used.", 500, credits ? { credits } : undefined);
  }
}
