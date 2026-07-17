import type { SubscriptionStatus } from "./types.ts";

export function subscriptionStatusForEvent(eventType: string): SubscriptionStatus | null {
  if (["subscription.activated", "subscription.charged", "subscription.resumed", "subscription.updated"].includes(eventType)) return "active";
  if (["subscription.pending", "subscription.authenticated"].includes(eventType)) return "pending";
  if (["subscription.halted", "subscription.paused", "payment.failed"].includes(eventType)) return "grace_period";
  if (eventType === "subscription.cancelled") return "canceled";
  if (["subscription.completed", "subscription.expired"].includes(eventType)) return "expired";
  if (eventType === "payment.refunded") return "refunded";
  if (["payment.dispute.created", "chargeback.created"].includes(eventType)) return "chargeback";
  return null;
}
