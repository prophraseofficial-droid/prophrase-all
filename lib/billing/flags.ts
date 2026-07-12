function enabled(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return value === "true";
}

export function getBillingFlags() {
  return {
    creditBillingEnabled: enabled(process.env.CREDIT_BILLING_ENABLED, false),
    creditBillingShadowMode: enabled(
      process.env.CREDIT_BILLING_SHADOW_MODE,
      true,
    ),
    pricingPageEnabled: enabled(process.env.PRICING_PAGE_ENABLED, true),
    paidCheckoutEnabled: enabled(process.env.PAID_CHECKOUT_ENABLED, false),
    planFeatureGatingEnabled: enabled(
      process.env.PLAN_FEATURE_GATING_ENABLED,
      false,
    ),
    creditUsageHistoryEnabled: enabled(
      process.env.CREDIT_USAGE_HISTORY_ENABLED,
      false,
    ),
    founderOfferEnabled: enabled(process.env.FOUNDER_OFFER_ENABLED, false),
  };
}
