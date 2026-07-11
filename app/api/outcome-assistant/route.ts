import { NextResponse } from "next/server";
import { AiProviderError } from "@/lib/ai/gemini";
import { isOutcomeAssistantEnabled } from "@/lib/feature-flags";
import { generateOutcomeAssistantResponse } from "@/lib/outcome-assistant/service";
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

  try {
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

    const startedAt = Date.now();
    const result = await generateOutcomeAssistantResponse(parsed.data);
    const dailyUsage = await incrementUsage(user.id, { rewriteDelta: 1 });
    const usage = buildUsageSummary(planData.profile, dailyUsage);

    return NextResponse.json({
      ...result.response,
      usage,
      metadata: {
        durationMs: Date.now() - startedAt,
        promptVersion: result.promptVersion,
        repaired: result.repaired,
      },
    });
  } catch (caughtError) {
    if (caughtError instanceof AiProviderError) {
      return apiError(
        caughtError.providerStatus === "RESOURCE_EXHAUSTED"
          ? "AI_PROVIDER_QUOTA_EXHAUSTED"
          : "AI_PROVIDER_ERROR",
        caughtError.userMessage,
        caughtError.statusCode === 429 ? 429 : 502,
      );
    }

    return apiError(
      "INVALID_AI_OUTPUT",
      "We could not safely verify the generated message. Please try again.",
      502,
    );
  }
}

