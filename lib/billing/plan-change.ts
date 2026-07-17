import type { BillingInterval, PlanId } from "./types.ts";
import { addEntitlementMonth } from "./dates.ts";
import { priceForInterval } from "./catalog.ts";

export type PaidPlanId = Exclude<PlanId, "free">;
export type PaidBillingInterval = Exclude<BillingInterval, "none">;

export type PaidPlanSelection = {
  plan: PaidPlanId;
  interval: PaidBillingInterval;
};

export type PlanChangeTiming = "unchanged" | "immediate" | "cycle_end";
export type PlanChangeExecution = "native_update" | "replacement_checkout";

const planRank: Record<PaidPlanId, number> = {
  plus: 1,
  pro: 2,
};

/**
 * Paid-plan transition policy:
 * - a higher feature tier is an immediate upgrade, regardless of interval;
 * - within one tier, monthly -> annual is an immediate upgrade;
 * - every feature-tier downgrade and annual -> monthly switch waits for renewal.
 *
 * Razorpay owns proration for provider subscriptions that support native updates.
 * UPI AutoPay and eMandate subscriptions require a newly-authorized replacement.
 */
export function classifyPlanChange(
  current: PaidPlanSelection,
  target: PaidPlanSelection,
): PlanChangeTiming {
  if (current.plan === target.plan && current.interval === target.interval) {
    return "unchanged";
  }

  if (planRank[target.plan] > planRank[current.plan]) return "immediate";
  if (planRank[target.plan] < planRank[current.plan]) return "cycle_end";
  return current.interval === "monthly" && target.interval === "annual"
    ? "immediate"
    : "cycle_end";
}

export function providerSupportsPlanUpdate(paymentMethod?: string | null) {
  if (!paymentMethod) return false;
  return !["upi", "emandate", "nach", "emandate_v2"].includes(
    paymentMethod.trim().toLowerCase(),
  );
}

export function planChangeExecution(paymentMethod?: string | null): PlanChangeExecution {
  return providerSupportsPlanUpdate(paymentMethod)
    ? "native_update"
    : "replacement_checkout";
}

/**
 * An unsupported mandate must be replaced at renewal. A higher feature tier is
 * exposed immediately after the replacement mandate is authorized; interval-only
 * changes have no entitlement benefit and therefore wait for renewal.
 */
export function replacementPlanChangeTiming(
  current: PaidPlanSelection,
  target: PaidPlanSelection,
): PlanChangeTiming {
  const timing = classifyPlanChange(current, target);
  if (timing === "unchanged") return timing;
  return planRank[target.plan] > planRank[current.plan] ? "immediate" : "cycle_end";
}

export function replacementUpgradeAmountPaise({
  current,
  target,
  periodStart,
  periodEnd,
  now,
}: {
  current: PaidPlanSelection;
  target: PaidPlanSelection;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}) {
  if (planRank[target.plan] <= planRank[current.plan]) return 0;
  const totalMs = periodEnd.getTime() - periodStart.getTime();
  const remainingMs = periodEnd.getTime() - now.getTime();
  if (totalMs <= 0 || remainingMs <= 0) return 0;

  const currentPrice = priceForInterval(current.plan, current.interval) ?? 0;
  const targetPrice = priceForInterval(target.plan, current.interval) ?? 0;
  const difference = Math.max(0, targetPrice - currentPrice);
  return Math.max(0, Math.round(difference * Math.min(1, remainingMs / totalMs)));
}

export function razorpayScheduleForPlanChange(
  timing: Exclude<PlanChangeTiming, "unchanged">,
) {
  return timing === "immediate" ? "now" as const : "cycle_end" as const;
}

export function remainingBillingCycles(interval: PaidBillingInterval) {
  // Keep subscriptions within the same ten-year commercial horizon used at checkout.
  return interval === "annual" ? 10 : 120;
}

export function buildRazorpayPlanUpdate(
  providerPlanId: string,
  target: PaidPlanSelection,
  timing: Exclude<PlanChangeTiming, "unchanged">,
) {
  return {
    plan_id: providerPlanId,
    remaining_count: remainingBillingCycles(target.interval),
    schedule_change_at: razorpayScheduleForPlanChange(timing),
    customer_notify: true,
  } as const;
}

export function shouldApplySubscriptionUpdate(
  eventType: string,
  hasScheduledChanges: boolean | undefined,
) {
  // Razorpay emits subscription.updated when a future change is merely queued.
  // Entitlements must remain unchanged until that scheduled change is applied.
  return eventType !== "subscription.updated" || hasScheduledChanges !== true;
}

export function planChangeChargePolicy(timing: PlanChangeTiming) {
  if (timing === "immediate") return "prorated_difference" as const;
  if (timing === "cycle_end") return "next_renewal" as const;
  return "none" as const;
}

export function planChangeCreditCycle({
  effectiveAt,
  interval,
  providerPeriodEnd,
}: {
  effectiveAt: Date;
  interval: PaidBillingInterval;
  providerPeriodEnd: Date | null;
}) {
  const oneMonthLater = addEntitlementMonth(effectiveAt, 1);
  const validProviderEnd = providerPeriodEnd && providerPeriodEnd > effectiveAt
    ? providerPeriodEnd
    : null;

  // Monthly subscriptions refresh again at their next provider renewal. Annual
  // subscriptions still receive monthly credit refreshes inside the paid year.
  const end = interval === "monthly"
    ? validProviderEnd ?? oneMonthLater
    : validProviderEnd && validProviderEnd < oneMonthLater
      ? validProviderEnd
      : oneMonthLater;

  return { start: effectiveAt, end };
}
