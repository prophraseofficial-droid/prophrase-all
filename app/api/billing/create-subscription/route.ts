import { NextResponse } from "next/server";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  billingPlanSchema,
  getZodErrorMessage,
  validationError,
} from "@/lib/security/validation";
import { getUserPlan } from "@/lib/usage/usage";

type RazorpayApiError = {
  statusCode?: number;
  error?: {
    code?: string;
    description?: string;
  };
  message?: string;
};

function getRazorpayErrorMessage(error: unknown) {
  const razorpayError = error as RazorpayApiError;
  return (
    razorpayError.error?.description ||
    razorpayError.message ||
    "Razorpay could not create the subscription."
  );
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const rateLimit = checkRateLimit(`billing:create:${user.id}`, 5, 60_000);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many billing attempts. Please try again shortly.",
      429,
      { retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
  }

  const parsed = billingPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  const plan = BILLING_PLANS[parsed.data.plan];
  if (!plan.razorpayPlanId) {
    return apiError("CONFIGURATION_ERROR", "Billing plan is not configured.", 500);
  }

  const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!publicKeyId) {
    return apiError(
      "CONFIGURATION_ERROR",
      "Razorpay checkout key is not configured.",
      500,
    );
  }

  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== publicKeyId) {
    return apiError(
      "CONFIGURATION_ERROR",
      "Razorpay public and server keys do not match.",
      500,
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const razorpay = getRazorpayClient();
    const profile = await getUserPlan(user.id);

    let customerId = profile.razorpay_customer_id;
    if (!customerId) {
      const customer = await razorpay.customers.create({
        name: profile.full_name ?? user.user_metadata?.name ?? undefined,
        email: profile.email ?? user.email ?? undefined,
      });
      customerId = customer.id;
      await supabase
        .from("profiles")
        .update({ razorpay_customer_id: customerId })
        .eq("id", user.id);
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.razorpayPlanId,
      customer_notify: 1,
      total_count: parsed.data.plan === "pro_yearly" ? 5 : 60,
      notes: {
        user_id: user.id,
        plan: parsed.data.plan,
      },
    });

    await supabase.from("subscriptions").insert({
      user_id: user.id,
      provider: "razorpay",
      plan: parsed.data.plan,
      status: subscription.status ?? "created",
      razorpay_customer_id: customerId,
      razorpay_subscription_id: subscription.id,
      raw_event: subscription as unknown as Record<string, unknown>,
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      razorpayKeyId: publicKeyId,
      plan: parsed.data.plan,
      amount: plan.amount,
      currency: plan.currency,
      user: {
        name: profile.full_name ?? "",
        email: profile.email ?? user.email ?? "",
      },
    });
  } catch (caughtError) {
    const razorpayError = caughtError as RazorpayApiError;
    const statusCode = razorpayError.statusCode ?? 500;
    const message = getRazorpayErrorMessage(caughtError);
    console.error("[billing] Unable to create Razorpay subscription", {
      statusCode,
      plan: parsed.data.plan,
      razorpayCode: razorpayError.error?.code,
      razorpayDescription: razorpayError.error?.description,
    });

    if ([400, 401, 404].includes(statusCode)) {
      return apiError(
        "CONFIGURATION_ERROR",
        `Razorpay subscription setup issue: ${message}`,
        500,
      );
    }

    return apiError(
      "INTERNAL_ERROR",
      "Unable to create subscription. Please try again.",
      500,
    );
  }
}
