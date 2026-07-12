export type BillingEventName =
  | "pricing_page_viewed" | "pricing_interval_changed" | "pricing_plan_selected"
  | "checkout_started" | "checkout_completed" | "checkout_failed"
  | "subscription_activated" | "subscription_upgraded"
  | "subscription_downgrade_scheduled" | "subscription_canceled"
  | "subscription_resumed" | "subscription_payment_failed" | "subscription_recovered"
  | "credit_balance_viewed" | "credit_estimate_shown" | "credit_warning_shown"
  | "credits_insufficient" | "credit_reservation_created"
  | "credit_reservation_released" | "credit_usage_committed"
  | "credit_period_refreshed" | "usage_history_viewed"
  | "upgrade_prompt_viewed" | "upgrade_prompt_clicked";

const allowedKeys = new Set([
  "currentPlan", "selectedPlan", "billingInterval", "creditCostBucket",
  "inputLengthBucket", "remainingCreditBucket", "operationType",
  "paymentStatusCategory", "errorCategory", "conversionSource",
  "authenticated", "generationDurationMs", "featureEntitlementCategory",
]);

export function sanitizeBillingAnalyticsMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).filter(([key, value]) =>
    allowedKeys.has(key) && ["string", "number", "boolean"].includes(typeof value),
  ));
}

export function trackBillingEvent(
  _event: BillingEventName,
  metadata: Record<string, unknown> = {},
) {
  // The repository has no analytics SDK. Keep the privacy-safe contract ready
  // without adding a second analytics platform.
  void sanitizeBillingAnalyticsMetadata(metadata);
}
