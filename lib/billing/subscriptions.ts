import { addEntitlementMonth } from "@/lib/billing/dates";
import { getPlanDefinition } from "@/lib/billing/catalog";
import { ensureCurrentCreditGrant } from "@/lib/billing/account";
import { planChangeCreditCycle } from "@/lib/billing/plan-change";
import { subscriptionStatusForEvent } from "@/lib/billing/provider-events";
import type {
  BillingInterval,
  PlanId,
} from "@/lib/billing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { trackBillingEvent } from "@/lib/billing/analytics";

export type VerifiedSubscriptionEvent = {
  providerEventId: string;
  eventType: string;
  eventCreatedAt: Date;
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  providerPriceId: string | null;
  plan: Exclude<PlanId, "free">;
  interval: Exclude<BillingInterval, "none">;
  userId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

export async function applyVerifiedSubscriptionEvent(event: VerifiedSubscriptionEvent) {
  const status = subscriptionStatusForEvent(event.eventType);
  if (!status) return { handled: false };
  const supabase = createSupabaseAdminClient();
  const { data: subscription, error } = await supabase.from("subscriptions")
    .select("id, provider_event_created_at, plan_id, billing_interval, pending_plan_id, pending_billing_interval")
    .eq("razorpay_subscription_id", event.providerSubscriptionId)
    .maybeSingle();
  if (error) throw error;
  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");
  const previousPlan = subscription.plan_id as PlanId;
  const confirmedPlanChange =
    subscription.pending_plan_id === event.plan &&
    subscription.pending_billing_interval === event.interval &&
    (subscription.plan_id !== event.plan || subscription.billing_interval !== event.interval);
  if (
    subscription.provider_event_created_at &&
    new Date(subscription.provider_event_created_at) > event.eventCreatedAt
  ) {
    return { handled: true, stale: true };
  }

  const periodStart = event.currentPeriodStart ?? new Date();
  const periodEnd = event.currentPeriodEnd ??
    (event.interval === "monthly"
      ? addEntitlementMonth(periodStart, 1)
      : new Date(Date.UTC(periodStart.getUTCFullYear() + 1, periodStart.getUTCMonth(), periodStart.getUTCDate())));
  const gracePeriodEnd = status === "grace_period"
    ? new Date(Date.now() + Number(process.env.BILLING_GRACE_PERIOD_DAYS || 3) * 86_400_000)
    : null;
  const canceled = status === "canceled";
  const terminal = ["expired", "refunded", "chargeback"].includes(status);
  const refreshedCreditCycle = confirmedPlanChange
    ? planChangeCreditCycle({
        effectiveAt: event.eventCreatedAt,
        interval: event.interval,
        providerPeriodEnd: event.currentPeriodEnd,
      })
    : null;
  const entitlementCycleStart = refreshedCreditCycle?.start ?? periodStart;
  const entitlementCycleEnd = refreshedCreditCycle?.end ?? addEntitlementMonth(periodStart, 1);

  const { error: updateError } = await supabase.from("subscriptions").update({
    plan_id: event.plan,
    billing_interval: event.interval,
    internal_status: status,
    status,
    razorpay_customer_id: event.providerCustomerId,
    razorpay_payment_id: event.providerPaymentId,
    razorpay_order_id: event.providerOrderId,
    provider_price_id: event.providerPriceId,
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
    entitlement_cycle_start: entitlementCycleStart.toISOString(),
    entitlement_cycle_end: entitlementCycleEnd.toISOString(),
    cancel_at_period_end: canceled,
    canceled_at: canceled ? event.eventCreatedAt.toISOString() : null,
    grace_period_end: gracePeriodEnd?.toISOString() ?? null,
    provider_event_created_at: event.eventCreatedAt.toISOString(),
    pending_plan_id: null,
    pending_billing_interval: null,
    plan_change_effective_at: null,
  }).eq("id", subscription.id);
  if (updateError) throw updateError;

  if (terminal) {
    await supabase.rpc("expire_credit_buckets", {
      p_user_id: event.userId,
      p_plan_id: event.plan,
      p_reason: status,
    });
    await supabase.from("profiles").update({
      plan: "free",
      billing_interval: "none",
      subscription_status: status,
      cancel_at_period_end: false,
      current_period_start: null,
      current_period_end: null,
    }).eq("id", event.userId);
  } else {
    await supabase.from("profiles").update({
      plan: event.plan,
      billing_interval: event.interval,
      subscription_status: status,
      razorpay_customer_id: event.providerCustomerId,
      razorpay_subscription_id: event.providerSubscriptionId,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      grace_period_end: gracePeriodEnd?.toISOString() ?? null,
      cancel_at_period_end: canceled,
    }).eq("id", event.userId);
    if (status === "active") {
      await supabase.rpc("expire_credit_buckets", {
        p_user_id: event.userId,
        p_plan_id: "free",
        p_reason: "paid_activation",
      });
      if (confirmedPlanChange && refreshedCreditCycle) {
        const { error: expireError } = await supabase.rpc("expire_credit_buckets", {
          p_user_id: event.userId,
          p_plan_id: previousPlan,
          p_reason: "plan_change_credit_refresh",
        });
        if (expireError) throw expireError;
        const { error: grantError } = await supabase.rpc("grant_credit_bucket", {
          p_user_id: event.userId,
          p_source_type:
            event.plan === "plus" ? "plus_monthly_grant" : "pro_monthly_grant",
          p_source_reference_id: subscription.id,
          p_amount: getPlanDefinition(event.plan).monthlyCredits ?? 0,
          p_valid_from: refreshedCreditCycle.start.toISOString(),
          p_expires_at: refreshedCreditCycle.end.toISOString(),
          p_plan_id: event.plan,
          p_grant_period_key: `${event.plan}:${refreshedCreditCycle.start.toISOString()}`,
        });
        if (grantError) throw grantError;
      } else {
        await ensureCurrentCreditGrant(event.userId, event.eventCreatedAt);
      }
    }
  }
  await supabase.from("billing_audit_events").insert({
    user_id: event.userId,
    subscription_id: subscription.id,
    event_type: `subscription_${status}`,
    provider_event_id: event.providerEventId,
    metadata: { plan: event.plan, interval: event.interval },
  });
  const analyticsEvent = status === "active"
    ? confirmedPlanChange
      ? "subscription_upgraded" as const
      : "subscription_activated" as const
    : status === "grace_period"
      ? "subscription_payment_failed" as const
      : null;
  if (analyticsEvent) {
    trackBillingEvent(analyticsEvent, {
      currentPlan: previousPlan,
      selectedPlan: event.plan,
      billingInterval: event.interval,
      paymentStatusCategory: status,
    });
  }
  return { handled: true, status };
}
