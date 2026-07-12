import { NextResponse } from "next/server";
import { getBillingAccount } from "@/lib/billing/account";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { apiError } from "@/lib/security/validation";

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const limit = checkRateLimit(`billing:cancel:${user.id}`, 3, 60_000);
  if (!limit.allowed) return apiError("RATE_LIMITED", "Please wait before trying again.", 429);
  const account = await getBillingAccount(user.id);
  if (!account.subscriptionId || account.subscriptionStatus === "free") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No active subscription was found.", 404);
  }
  const supabase = createSupabaseAdminClient();
  const { data: subscription } = await supabase.from("subscriptions")
    .select("razorpay_subscription_id")
    .eq("id", account.subscriptionId).single();
  if (!subscription?.razorpay_subscription_id) {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No provider subscription was found.", 404);
  }
  try {
    await getRazorpayClient().subscriptions.cancel(subscription.razorpay_subscription_id, true);
    await Promise.all([
      supabase.from("subscriptions").update({
        cancel_at_period_end: true,
        internal_status: "canceled",
        canceled_at: new Date().toISOString(),
      }).eq("id", account.subscriptionId),
      supabase.from("profiles").update({ cancel_at_period_end: true }).eq("id", user.id),
      supabase.from("billing_audit_events").insert({
        user_id: user.id,
        subscription_id: account.subscriptionId,
        event_type: "subscription_cancellation_scheduled",
        metadata: { effectiveAt: account.currentPeriodEnd },
      }),
    ]);
    return NextResponse.json({ ok: true, effectiveAt: account.currentPeriodEnd });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to schedule cancellation.", 500);
  }
}
