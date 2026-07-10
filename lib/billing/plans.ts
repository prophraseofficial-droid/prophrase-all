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
    name: "Pro Yearly",
    amount: 69900,
    currency: "INR",
    displayPrice: "₹699/year",
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
