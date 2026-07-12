import { NextResponse } from "next/server";
import { AiProviderError } from "@/lib/ai/gemini";
import {
  BillingOperationError,
  creditFailureSummary,
  commitCreditOperation,
  prepareCreditOperation,
  releaseCreditOperation,
  type CreditOperationContext,
} from "@/lib/billing/service";
import { getBillingFlags } from "@/lib/billing/flags";
import {
  PlanUpgradeRequiredError,
  requireEntitlement,
} from "@/lib/billing/entitlements";
import { isOutcomeAssistantEnabled } from "@/lib/feature-flags";
import {
  generateOutcomeAssistantResponse,
  OutcomeAssistantError,
} from "@/lib/outcome-assistant/service";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  getZodErrorMessage,
  outcomeAssistantBodySchema,
  validationError,
} from "@/lib/security/validation";
import {
  buildUsageSummary,
  getProfileAndUsageSummary,
  incrementUsage,
} from "@/lib/usage/usage";

export async function POST(request: Request) {
  if (!isOutcomeAssistantEnabled()) {
    return apiError(
      "FEATURE_DISABLED",
      "Outcome Assistant is not enabled for this environment.",
      404,
    );
  }

  const { user, response } = await requireUser(request);
  if (!user) return response;

  const rateLimit = checkRateLimit(`outcome:${user.id}`, 12, 60_000);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many requests. Please try again shortly.",
      429,
      { retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
  }

  const parsed = outcomeAssistantBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  let creditContext: CreditOperationContext | null = null;
  try {
    const planData = await getProfileAndUsageSummary(user.id);
    const flags = getBillingFlags();
    const creditEnforcementActive =
      flags.creditBillingEnabled && !flags.creditBillingShadowMode;
    const advancedOutcomeRequested =
      Boolean(parsed.data.customRecipient) ||
      Boolean(parsed.data.customIntent) ||
      Boolean(parsed.data.relationshipLevel) ||
      Boolean(parsed.data.desiredResponse) ||
      parsed.data.channel !== "email";
    if (flags.planFeatureGatingEnabled && advancedOutcomeRequested) {
      await requireEntitlement(user.id, "channel_modes");
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

    creditContext = await prepareCreditOperation({
      userId: user.id,
      operation: "outcome_assistant",
      text: parsed.data.originalText,
      idempotencyKey: request.headers.get("idempotency-key"),
      feature: "outcome_assistant",
    });

    const startedAt = Date.now();
    const result = await generateOutcomeAssistantResponse(parsed.data);
    const dailyUsage = await incrementUsage(user.id, { rewriteDelta: 1 });
    const usage = buildUsageSummary(planData.profile, dailyUsage);
    const credits = await commitCreditOperation(creditContext);

    return NextResponse.json({
      requestId: creditContext.requestId,
      ...result.response,
      usage,
      ...(credits ? { credits } : {}),
      metadata: {
        durationMs: Date.now() - startedAt,
        promptVersion: result.promptVersion,
        repaired: result.repaired,
        fallback: result.fallback,
      },
    });
  } catch (caughtError) {
    await releaseCreditOperation(user.id, creditContext, "generation_failed");
    if (caughtError instanceof BillingOperationError) {
      const status = caughtError.code === "INSUFFICIENT_CREDITS" ? 402
        : caughtError.code === "INPUT_LIMIT_EXCEEDED" ? 403
          : caughtError.code === "CREDIT_REQUEST_IN_PROGRESS" ? 409
            : 400;
      return apiError(caughtError.code, caughtError.message, status, caughtError.details);
    }
    if (caughtError instanceof PlanUpgradeRequiredError) {
      return apiError("PLAN_UPGRADE_REQUIRED", caughtError.message, 403, {
        feature: caughtError.feature,
        requiredPlan: caughtError.requiredPlan,
      });
    }
    if (caughtError instanceof AiProviderError) {
      const credits = await creditFailureSummary(user.id, creditContext);
      return apiError(
        caughtError.providerStatus === "RESOURCE_EXHAUSTED"
          ? "AI_PROVIDER_QUOTA_EXHAUSTED"
          : "AI_PROVIDER_ERROR",
        caughtError.userMessage,
        caughtError.statusCode === 429 ? 429 : 502,
        credits ? { credits } : undefined,
      );
    }
    if (caughtError instanceof OutcomeAssistantError) {
      const credits = await creditFailureSummary(user.id, creditContext);
      return apiError(
        "INVALID_AI_OUTPUT",
        caughtError.userMessage,
        caughtError.status === 502 ? 422 : caughtError.status,
        credits ? { credits } : undefined,
      );
    }

    const credits = await creditFailureSummary(user.id, creditContext);
    return apiError(
      "INVALID_AI_OUTPUT",
      "We could not safely verify the generated message. No credits were used.",
      502,
      credits ? { credits } : undefined,
    );
  }
}
