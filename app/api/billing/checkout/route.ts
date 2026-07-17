import crypto from "crypto";
import { NextResponse } from "next/server";
import { checkoutDefinition } from "@/lib/billing/plans";
import { getBillingFlags } from "@/lib/billing/flags";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  billingCheckoutSchema,
  getZodErrorMessage,
  validationError,
} from "@/lib/security/validation";
import { getUserPlan } from "@/lib/usage/usage";
import { getBillingAccount } from "@/lib/billing/account";

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!getBillingFlags().paidCheckoutEnabled) {
    return apiError("FEATURE_DISABLED", "Paid checkout is not enabled yet.", 404);
  }
  const rateLimit = checkRateLimit(`billing:checkout:${user.id}`, 5, 60_000);
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many checkout attempts. Please try again shortly.", 429, {
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }
  const parsed = billingCheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(getZodErrorMessage(parsed.error));

  const billingAccount = await getBillingAccount(user.id);
  if (billingAccount.plan !== "free" && billingAccount.subscriptionId) {
    return apiError(
      "PLAN_CHANGE_REQUIRED",
      "An active paid subscription already exists. Change that subscription instead of starting another checkout.",
      409,
    );
  }

  const definition = checkoutDefinition(parsed.data.plan, parsed.data.interval);
  if (!definition.razorpayPlanId || !definition.amountPaise) {
    return apiError("CONFIGURATION_ERROR", "This billing plan is not configured.", 500);
  }
  const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!publicKeyId || (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== publicKeyId)) {
    return apiError("CONFIGURATION_ERROR", "Razorpay checkout is not configured.", 500);
  }

  const requestHash = crypto.createHash("sha256")
    .update(`${user.id}:${parsed.data.plan}:${parsed.data.interval}`)
    .digest("hex");
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("subscriptions")
    .select("razorpay_subscription_id, checkout_request_hash")
    .eq("user_id", user.id)
    .eq("checkout_idempotency_key", parsed.data.idempotencyKey)
    .maybeSingle();
  if (existing) {
    if (existing.checkout_request_hash !== requestHash) {
      return apiError("IDEMPOTENCY_KEY_REUSED", "This checkout key was used for a different plan.", 409);
    }
    if (existing.razorpay_subscription_id) {
      return NextResponse.json({
        subscriptionId: existing.razorpay_subscription_id,
        razorpayKeyId: publicKeyId,
        amount: definition.amountPaise,
        currency: definition.currency,
        plan: parsed.data.plan,
        interval: parsed.data.interval,
        duplicate: true,
      });
    }
    return apiError("PAYMENT_PROCESSING", "Checkout is already being prepared.", 409);
  }

  try {
    const profile = await getUserPlan(user.id);
    const pendingId = crypto.randomUUID();
    const { error: pendingError } = await supabase.from("subscriptions").insert({
      id: pendingId,
      user_id: user.id,
      provider: "razorpay",
      plan_id: parsed.data.plan,
      billing_interval: parsed.data.interval,
      internal_status: "pending",
      status: "created",
      provider_price_id: definition.razorpayPlanId,
      checkout_idempotency_key: parsed.data.idempotencyKey,
      checkout_request_hash: requestHash,
    });
    if (pendingError) throw pendingError;

    const razorpay = getRazorpayClient();
    let customerId = profile.razorpay_customer_id;
    if (!customerId) {
      const customer = await razorpay.customers.create({
        name: profile.full_name ?? user.user_metadata?.name ?? undefined,
        email: profile.email ?? user.email ?? undefined,
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ razorpay_customer_id: customerId }).eq("id", user.id);
    }
    const subscription = await razorpay.subscriptions.create({
      plan_id: definition.razorpayPlanId,
      customer_notify: 1,
      total_count: parsed.data.interval === "annual" ? 10 : 120,
      notes: {
        internal_user_id: user.id,
        internal_plan_id: parsed.data.plan,
        billing_interval: parsed.data.interval,
        environment: process.env.APP_ENV || process.env.VERCEL_ENV || "development",
      },
    });
    await supabase.from("subscriptions").update({
      razorpay_customer_id: customerId,
      razorpay_subscription_id: subscription.id,
      status: subscription.status ?? "created",
    }).eq("id", pendingId);

    return NextResponse.json({
      subscriptionId: subscription.id,
      razorpayKeyId: publicKeyId,
      amount: definition.amountPaise,
      currency: definition.currency,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      user: { name: profile.full_name ?? "", email: profile.email ?? user.email ?? "" },
    });
  } catch (error) {
    console.error("[billing] Checkout creation failed", {
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      category: error instanceof Error ? error.name : "unknown",
    });
    return apiError("CHECKOUT_FAILED", "Unable to start checkout. Please try again.", 500);
  }
}
