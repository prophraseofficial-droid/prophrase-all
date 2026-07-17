import { NextResponse } from "next/server";
import { verifyRazorpaySubscriptionPaymentSignature } from "@/lib/billing/razorpay";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { planFromProviderPriceId } from "@/lib/billing/plans";
import { applyVerifiedSubscriptionEvent } from "@/lib/billing/subscriptions";
import { finalizeReplacementSubscription } from "@/lib/billing/replacement-subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  getZodErrorMessage,
  validationError,
  verifyPaymentSchema,
} from "@/lib/security/validation";

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const rateLimit = checkRateLimit(`billing:verify:${user.id}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many payment verification attempts. Please try again shortly.",
      429,
      { retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
  }

  const parsed = verifyPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  try {
    const valid = verifyRazorpaySubscriptionPaymentSignature({
      paymentId: parsed.data.razorpay_payment_id,
      subscriptionId: parsed.data.razorpay_subscription_id,
      signature: parsed.data.razorpay_signature,
    });

    if (!valid) {
      return apiError(
        "PAYMENT_VERIFICATION_FAILED",
        "Payment verification failed.",
        400,
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*, plan_id, billing_interval, provider_price_id")
      .eq("user_id", user.id)
      .eq("razorpay_subscription_id", parsed.data.razorpay_subscription_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!subscription) {
      return apiError("SUBSCRIPTION_REQUIRED", "Subscription not found.", 404);
    }

    const providerSubscription = await getRazorpayClient().subscriptions.fetch(
      parsed.data.razorpay_subscription_id,
    );
    const mapped = planFromProviderPriceId(
      providerSubscription.plan_id ?? subscription.provider_price_id,
    );
    const plan = mapped?.plan ?? subscription.plan_id;
    const interval = mapped?.interval ?? subscription.billing_interval;
    if ((plan !== "plus" && plan !== "pro") ||
      (interval !== "monthly" && interval !== "annual")) {
      return apiError("INVALID_PLAN", "The purchased plan could not be verified.", 400);
    }
    if (!["active", "authenticated"].includes(providerSubscription.status ?? "")) {
      return NextResponse.json({ ok: true, processing: true, plan, interval }, { status: 202 });
    }
    const replacementResult = await finalizeReplacementSubscription({
      userId: user.id,
      providerSubscriptionId: parsed.data.razorpay_subscription_id,
      providerPaymentId: parsed.data.razorpay_payment_id,
      providerCustomerId: providerSubscription.customer_id ?? subscription.razorpay_customer_id,
      providerPriceId: providerSubscription.plan_id ?? subscription.provider_price_id,
      providerCurrentEnd: providerSubscription.current_end
        ? new Date(providerSubscription.current_end * 1000) : null,
    });
    if (replacementResult.replacement) {
      return NextResponse.json({
        ok: true,
        replacement: true,
        immediate: replacementResult.timing === "immediate",
        plan,
        interval,
      });
    }
    await applyVerifiedSubscriptionEvent({
      providerEventId: `client-verified:${parsed.data.razorpay_payment_id}`,
      eventType: "subscription.activated",
      eventCreatedAt: new Date(),
      providerSubscriptionId: parsed.data.razorpay_subscription_id,
      providerCustomerId: providerSubscription.customer_id ?? subscription.razorpay_customer_id,
      providerPaymentId: parsed.data.razorpay_payment_id,
      providerOrderId: null,
      providerPriceId: providerSubscription.plan_id ?? null,
      plan,
      interval,
      userId: user.id,
      currentPeriodStart: providerSubscription.current_start
        ? new Date(providerSubscription.current_start * 1000) : null,
      currentPeriodEnd: providerSubscription.current_end
        ? new Date(providerSubscription.current_end * 1000) : null,
    });
    return NextResponse.json({ ok: true, plan, interval });
  } catch (error) {
    console.error("[billing] Payment verification failed", {
      category: error instanceof Error ? error.name : typeof error,
      description: error instanceof Error ? error.message.slice(0, 180) : null,
    });
    return apiError(
      "PAYMENT_VERIFICATION_FAILED",
      "Payment verification failed.",
      400,
    );
  }
}
