import { getPlanCatalog, priceForInterval } from "@/lib/billing/catalog";
import type { BillingInterval, PlanId } from "@/lib/billing/types";

// Legacy exports remain while existing subscriptions are migrated to Plus.
export const BILLING_PLANS = {
  pro_monthly: {
    name: "Pro Monthly",
    amount: 9900,
    currency: "INR",
    displayPrice: "₹99/month",
    get razorpayPlanId() {
      return process.env.RAZORPAY_PLAN_MONTHLY_ID;
    },
  },
  pro_yearly: {
    name: "Legacy Annual",
    amount: 69900,
    currency: "INR",
    displayPrice: "₹699/year (legacy)",
    get razorpayPlanId() {
      return process.env.RAZORPAY_PLAN_YEARLY_ID;
    },
  },
} as const;

export type BillingPlan = keyof typeof BILLING_PLANS;

export function planFromRazorpayPlanId(planId?: string | null): BillingPlan | null {
  if (!planId) return null;
  if (planId === process.env.RAZORPAY_PLAN_MONTHLY_ID) return "pro_monthly";
  if (planId === process.env.RAZORPAY_PLAN_YEARLY_ID) return "pro_yearly";
  return null;
}

export function razorpayPlanIdFor(
  plan: Exclude<PlanId, "free">,
  interval: Exclude<BillingInterval, "none">,
) {
  const key = `RAZORPAY_${plan.toUpperCase()}_${interval.toUpperCase()}_PLAN_ID`;
  return process.env[key];
}

export function planFromProviderPriceId(planId?: string | null) {
  if (!planId) return null;
  const candidates = ["plus", "pro"] as const;
  const intervals = ["monthly", "annual"] as const;
  for (const plan of candidates) {
    for (const interval of intervals) {
      if (razorpayPlanIdFor(plan, interval) === planId) return { plan, interval };
    }
  }
  const legacy = planFromRazorpayPlanId(planId);
  if (legacy === "pro_monthly") return { plan: "plus" as const, interval: "monthly" as const };
  if (legacy === "pro_yearly") return { plan: "plus" as const, interval: "annual" as const };
  return null;
}

export function checkoutDefinition(
  plan: Exclude<PlanId, "free">,
  interval: Exclude<BillingInterval, "none">,
) {
  const catalog = getPlanCatalog();
  return {
    plan: catalog[plan],
    interval,
    amountPaise: priceForInterval(plan, interval),
    currency: process.env.BILLING_CURRENCY || "INR",
    razorpayPlanId: razorpayPlanIdFor(plan, interval),
  };
}
