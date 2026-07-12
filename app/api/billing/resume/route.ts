import { NextResponse } from "next/server";
import { getBillingAccount } from "@/lib/billing/account";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const account = await getBillingAccount(user.id);
  if (!account.subscriptionId || !account.cancelAtPeriodEnd) {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No scheduled cancellation was found.", 404);
  }
  const supabase = createSupabaseAdminClient();
  const { data: subscription } = await supabase.from("subscriptions")
    .select("razorpay_subscription_id").eq("id", account.subscriptionId).single();
  if (!subscription?.razorpay_subscription_id) {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No provider subscription was found.", 404);
  }
  try {
    await getRazorpayClient().subscriptions.resume(subscription.razorpay_subscription_id, { resume_at: "now" });
    await Promise.all([
      supabase.from("subscriptions").update({
        cancel_at_period_end: false, internal_status: "active", canceled_at: null,
      }).eq("id", account.subscriptionId),
      supabase.from("profiles").update({
        cancel_at_period_end: false, subscription_status: "active",
      }).eq("id", user.id),
      supabase.from("billing_audit_events").insert({
        user_id: user.id, subscription_id: account.subscriptionId,
        event_type: "subscription_resumed", metadata: {},
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to resume subscription.", 500);
  }
}
