import { NextResponse } from "next/server";
import { verifyRazorpaySubscriptionPaymentSignature } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  getZodErrorMessage,
  validationError,
  verifyPaymentSchema,
} from "@/lib/security/validation";

export async function POST(request: Request) {
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
      .select("*")
      .eq("user_id", user.id)
      .eq("razorpay_subscription_id", parsed.data.razorpay_subscription_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!subscription) {
      return apiError("SUBSCRIPTION_REQUIRED", "Subscription not found.", 404);
    }

    await Promise.all([
      supabase
        .from("subscriptions")
        .update({
          status: "active",
          razorpay_payment_id: parsed.data.razorpay_payment_id,
        })
        .eq("id", subscription.id),
      supabase
        .from("profiles")
        .update({
          plan: subscription.plan,
          subscription_status: "active",
          razorpay_customer_id: subscription.razorpay_customer_id,
          razorpay_subscription_id: parsed.data.razorpay_subscription_id,
        })
        .eq("id", user.id),
    ]);

    return NextResponse.json({ ok: true, plan: subscription.plan });
  } catch {
    return apiError(
      "PAYMENT_VERIFICATION_FAILED",
      "Payment verification failed.",
      400,
    );
  }
}
