import { NextResponse } from "next/server";
import crypto from "crypto";
import { getBillingAccount } from "@/lib/billing/account";
import { checkoutDefinition } from "@/lib/billing/plans";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { apiError, billingChangePlanSchema, getZodErrorMessage, validationError } from "@/lib/security/validation";

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const parsed = billingChangePlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(getZodErrorMessage(parsed.error));
  const account = await getBillingAccount(user.id);
  if (!account.subscriptionId || account.plan === "free") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "Start checkout to choose a paid plan.", 409);
  }
  if (account.plan === parsed.data.plan && account.billingInterval === parsed.data.interval) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  const definition = checkoutDefinition(parsed.data.plan, parsed.data.interval);
  if (!definition.razorpayPlanId) return apiError("CONFIGURATION_ERROR", "The selected plan is not configured.", 500);
  const supabase = createSupabaseAdminClient();
  const requestHash = crypto.createHash("sha256").update(`${parsed.data.plan}:${parsed.data.interval}`).digest("hex");
  const { data: existingKey } = await supabase.from("billing_idempotency_keys")
    .select("request_hash, status").eq("user_id", user.id)
    .eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existingKey) {
    if (existingKey.request_hash !== requestHash) return apiError("IDEMPOTENCY_KEY_REUSED", "This request key was used for a different plan change.", 409);
    return NextResponse.json({ ok: true, duplicate: true, processing: existingKey.status === "processing" });
  }
  const { error: keyError } = await supabase.from("billing_idempotency_keys").insert({
    user_id: user.id, idempotency_key: parsed.data.idempotencyKey,
    operation_type: "change_plan", request_hash: requestHash,
  });
  if (keyError) return apiError("CREDIT_REQUEST_IN_PROGRESS", "This plan change is already processing.", 409);
  const { data: subscription } = await supabase.from("subscriptions")
    .select("razorpay_subscription_id").eq("id", account.subscriptionId).single();
  if (!subscription?.razorpay_subscription_id) return apiError("SUBSCRIPTION_NOT_ACTIVE", "Provider subscription not found.", 404);
  const upgrade = account.plan === "plus" && parsed.data.plan === "pro";
  try {
    await getRazorpayClient().subscriptions.update(subscription.razorpay_subscription_id, {
      plan_id: definition.razorpayPlanId,
      schedule_change_at: upgrade ? "now" : "cycle_end",
    });
    await Promise.all([
      supabase.from("subscriptions").update({
        pending_plan_id: parsed.data.plan,
        pending_billing_interval: parsed.data.interval,
        plan_change_effective_at: upgrade ? new Date().toISOString() : account.currentPeriodEnd,
      }).eq("id", account.subscriptionId),
      supabase.from("billing_audit_events").insert({
        user_id: user.id, subscription_id: account.subscriptionId,
        event_type: upgrade ? "subscription_upgrade_requested" : "subscription_downgrade_scheduled",
        metadata: { plan: parsed.data.plan, interval: parsed.data.interval, requestHash },
      }),
      supabase.from("billing_idempotency_keys").update({ status: "completed" })
        .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
    ]);
    return NextResponse.json({ ok: true, immediate: upgrade, effectiveAt: upgrade ? new Date().toISOString() : account.currentPeriodEnd });
  } catch {
    await supabase.from("billing_idempotency_keys").update({ status: "failed" })
      .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey);
    return apiError("INTERNAL_ERROR", "Unable to change plan. Your current plan was not changed.", 500);
  }
}
