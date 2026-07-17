import { providerCancellationMode } from "@/lib/billing/cancellation";
import { getRazorpayClient } from "@/lib/billing/razorpay";

export async function cancelProviderSubscription(
  providerSubscriptionId: string,
  { cancelScheduledPlanChange = false }: { cancelScheduledPlanChange?: boolean } = {},
) {
  const razorpay = getRazorpayClient();
  let providerSubscription = await razorpay.subscriptions.fetch(providerSubscriptionId);
  let mode = providerCancellationMode(providerSubscription.status);
  if (mode === "none") return { canceled: true, mode };

  if (cancelScheduledPlanChange && providerSubscription.has_scheduled_changes) {
    await razorpay.subscriptions.cancelScheduledChanges(providerSubscriptionId);
    providerSubscription = await razorpay.subscriptions.fetch(providerSubscriptionId);
    mode = providerCancellationMode(providerSubscription.status);
    if (mode === "none") return { canceled: true, mode };
  }

  try {
    await razorpay.subscriptions.cancel(
      providerSubscriptionId,
      mode === "cycle_end",
    );
  } catch (error) {
    const refreshed = await razorpay.subscriptions.fetch(providerSubscriptionId);
    const refreshedMode = providerCancellationMode(refreshed.status);
    if (
      refreshedMode !== "none" &&
      !(mode === "cycle_end" && refreshed.has_scheduled_changes)
    ) throw error;
  }
  return { canceled: true, mode };
}

export async function reusableProviderSubscription<T extends {
  razorpay_subscription_id: string | null;
}>(candidates: T[]) {
  const razorpay = getRazorpayClient();
  const reusable: Array<{
    row: T;
    status: string;
  }> = [];

  for (const row of candidates) {
    if (!row.razorpay_subscription_id) continue;
    try {
      const provider = await razorpay.subscriptions.fetch(row.razorpay_subscription_id);
      if (["active", "authenticated"].includes(provider.status ?? "")) {
        reusable.push({ row, status: provider.status ?? "" });
      }
    } catch {
      // A stale local provider id is not reusable; try the next related row.
    }
  }

  reusable.sort((left, right) =>
    left.status === right.status
      ? 0
      : left.status === "active" ? -1 : 1,
  );
  return reusable[0] ?? null;
}

export async function continueProviderSubscription(providerSubscriptionId: string) {
  const razorpay = getRazorpayClient();
  let provider = await razorpay.subscriptions.fetch(providerSubscriptionId);
  if (provider.status === "active" && provider.has_scheduled_changes) {
    await razorpay.subscriptions.cancelScheduledChanges(providerSubscriptionId);
    provider = await razorpay.subscriptions.fetch(providerSubscriptionId);
  }
  if (!["active", "authenticated"].includes(provider.status ?? "")) {
    throw new Error("PROVIDER_SUBSCRIPTION_NOT_REUSABLE");
  }
  return provider;
}
