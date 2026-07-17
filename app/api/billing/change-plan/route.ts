import { NextResponse } from "next/server";
import crypto from "crypto";
import { getBillingAccount } from "@/lib/billing/account";
import {
  classifyPlanChange,
  buildRazorpayPlanUpdate,
  planChangeChargePolicy,
  razorpayScheduleForPlanChange,
} from "@/lib/billing/plan-change";
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
  if (account.subscriptionStatus !== "active") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "Plan changes require an active subscription. Resolve the current billing status first.", 409);
  }
  if (account.cancelAtPeriodEnd) {
    return apiError("SUBSCRIPTION_CANCELLATION_PENDING", "Resume the subscription before changing its plan.", 409);
  }
  if (account.billingInterval !== "monthly" && account.billingInterval !== "annual") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "The current billing interval is unavailable. Refresh billing status before changing plans.", 409);
  }
  const timing = classifyPlanChange(
    { plan: account.plan, interval: account.billingInterval },
    parsed.data,
  );
  if (timing === "unchanged") {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  if (account.pendingPlan && account.pendingBillingInterval) {
    if (
      account.pendingPlan === parsed.data.plan &&
      account.pendingBillingInterval === parsed.data.interval
    ) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        processing: true,
        immediate: timing === "immediate",
        effectiveAt: account.planChangeEffectiveAt,
        chargePolicy: planChangeChargePolicy(timing),
      });
    }
    return apiError("PLAN_CHANGE_PENDING", "Another plan change is already pending. Wait for it to complete before choosing a different plan.", 409);
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
  const scheduleChangeAt = razorpayScheduleForPlanChange(timing);
  const requestedAt = new Date();
  const tentativeEffectiveAt = timing === "immediate"
    ? requestedAt.toISOString()
    : account.currentPeriodEnd;
  const { error: pendingUpdateError } = await supabase.from("subscriptions").update({
    pending_plan_id: parsed.data.plan,
    pending_billing_interval: parsed.data.interval,
    plan_change_effective_at: tentativeEffectiveAt,
  }).eq("id", account.subscriptionId);
  if (pendingUpdateError) {
    await supabase.from("billing_idempotency_keys").update({ status: "failed" })
      .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey);
    return apiError("INTERNAL_ERROR", "Unable to prepare the plan change. Your current plan was not changed.", 500);
  }
  try {
    const providerSubscription = await getRazorpayClient().subscriptions.update(
      subscription.razorpay_subscription_id,
      buildRazorpayPlanUpdate(definition.razorpayPlanId, parsed.data, timing),
    );
    const effectiveAt = timing === "immediate"
      ? requestedAt.toISOString()
      : providerSubscription.change_scheduled_at
        ? new Date(providerSubscription.change_scheduled_at * 1000).toISOString()
        : account.currentPeriodEnd;
    const [subscriptionUpdate, auditInsert, idempotencyUpdate] = await Promise.all([
      supabase.from("subscriptions").update({
        plan_change_effective_at: effectiveAt,
      })
        .eq("id", account.subscriptionId)
        .eq("pending_plan_id", parsed.data.plan)
        .eq("pending_billing_interval", parsed.data.interval),
      supabase.from("billing_audit_events").insert({
        user_id: user.id, subscription_id: account.subscriptionId,
        event_type: timing === "immediate" ? "subscription_upgrade_requested" : "subscription_downgrade_scheduled",
        metadata: {
          fromPlan: account.plan,
          fromInterval: account.billingInterval,
          plan: parsed.data.plan,
          interval: parsed.data.interval,
          requestHash,
          scheduleChangeAt,
          chargePolicy: planChangeChargePolicy(timing),
        },
      }),
      supabase.from("billing_idempotency_keys").update({ status: "completed" })
        .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
    ]);
    if (subscriptionUpdate.error || auditInsert.error || idempotencyUpdate.error) {
      console.error("[billing] Provider accepted a plan change but local reconciliation is pending", {
        subscriptionId: account.subscriptionId,
        timing,
        localUpdateFailed: Boolean(subscriptionUpdate.error),
        auditInsertFailed: Boolean(auditInsert.error),
        idempotencyUpdateFailed: Boolean(idempotencyUpdate.error),
      });
    }
    return NextResponse.json({
      ok: true,
      immediate: timing === "immediate",
      effectiveAt,
      chargePolicy: planChangeChargePolicy(timing),
    });
  } catch {
    await Promise.all([
      supabase.from("subscriptions").update({
        pending_plan_id: null,
        pending_billing_interval: null,
        plan_change_effective_at: null,
      })
        .eq("id", account.subscriptionId)
        .eq("pending_plan_id", parsed.data.plan)
        .eq("pending_billing_interval", parsed.data.interval),
      supabase.from("billing_idempotency_keys").update({ status: "failed" })
        .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
    ]);
    return apiError("INTERNAL_ERROR", "Unable to change plan. Your current plan was not changed.", 500);
  }
}
