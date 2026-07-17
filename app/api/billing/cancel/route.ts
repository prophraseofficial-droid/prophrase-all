import { NextResponse } from "next/server";
import { getBillingAccount } from "@/lib/billing/account";
import {
  replacementDescendantIds,
  replacementRelatedIds,
} from "@/lib/billing/cancellation";
import { cancelProviderSubscription } from "@/lib/billing/provider-subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { apiError } from "@/lib/security/validation";

type SubscriptionRow = {
  id: string;
  razorpay_subscription_id: string | null;
  migration_source: string | null;
  plan_id: string;
  billing_interval: string;
};

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const limit = checkRateLimit(`billing:cancel:${user.id}`, 3, 60_000);
  if (!limit.allowed) return apiError("RATE_LIMITED", "Please wait before trying again.", 429);
  const account = await getBillingAccount(user.id);
  if (!account.subscriptionId || account.subscriptionStatus === "free") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No active subscription was found.", 404);
  }
  const supabase = createSupabaseAdminClient();
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("id, razorpay_subscription_id, migration_source, plan_id, billing_interval")
    .eq("user_id", user.id);
  if (subscriptionsError) {
    return apiError("INTERNAL_ERROR", "Unable to load subscription details.", 500);
  }
  const rows = (subscriptions ?? []) as SubscriptionRow[];
  const subscription = rows.find((row) => row.id === account.subscriptionId);
  if (!subscription?.razorpay_subscription_id) {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No provider subscription was found.", 404);
  }
  try {
    const descendantIds = replacementDescendantIds(rows, account.subscriptionId);
    const relatedIds = new Set(replacementRelatedIds(rows, account.subscriptionId));
    const descendants = descendantIds
      .map((id) => rows.find((row) => row.id === id))
      .filter((row): row is SubscriptionRow => Boolean(row))
      .reverse();

    for (const descendant of descendants) {
      if (descendant.razorpay_subscription_id) {
        await cancelProviderSubscription(descendant.razorpay_subscription_id);
      }
    }
    const renewalRows = account.pendingPlan && account.pendingBillingInterval
      ? rows.filter((row) =>
          row.id !== account.subscriptionId &&
          relatedIds.has(row.id) &&
          row.plan_id === account.pendingPlan &&
          row.billing_interval === account.pendingBillingInterval,
        )
      : [];
    for (const renewalRow of renewalRows) {
      if (
        renewalRow.razorpay_subscription_id &&
        !descendantIds.includes(renewalRow.id)
      ) {
        await cancelProviderSubscription(renewalRow.razorpay_subscription_id);
      }
    }
    await cancelProviderSubscription(subscription.razorpay_subscription_id, {
      cancelScheduledPlanChange: Boolean(
        account.pendingPlan && account.pendingBillingInterval && !descendants.length,
      ),
    });

    const canceledAt = new Date().toISOString();
    const writes = await Promise.all([
      supabase.from("subscriptions").update({
        cancel_at_period_end: true,
        internal_status: "canceled",
        canceled_at: canceledAt,
      }).eq("id", account.subscriptionId),
      descendantIds.length
        ? supabase.from("subscriptions").update({
            cancel_at_period_end: false,
            internal_status: "expired",
            status: "cancelled",
            canceled_at: canceledAt,
            pending_plan_id: null,
            pending_billing_interval: null,
            plan_change_effective_at: null,
          }).in("id", descendantIds)
        : Promise.resolve({ error: null }),
      supabase.from("profiles").update({ cancel_at_period_end: true }).eq("id", user.id),
      supabase.from("billing_audit_events").insert({
        user_id: user.id,
        subscription_id: account.subscriptionId,
        event_type: "subscription_cancellation_scheduled",
        metadata: {
          effectiveAt: account.currentPeriodEnd,
          renewalPlan: account.pendingPlan ?? account.plan,
          renewalInterval: account.pendingBillingInterval ?? account.billingInterval,
          canceledReplacementSubscriptionIds: descendantIds,
        },
      }),
    ]);
    const failedWrite = writes.find((result) => result.error);
    if (failedWrite?.error) throw failedWrite.error;
    return NextResponse.json({ ok: true, effectiveAt: account.currentPeriodEnd });
  } catch (error) {
    console.error("[billing] Unable to schedule cancellation", {
      subscriptionId: account.subscriptionId,
      providerSubscriptionId: subscription.razorpay_subscription_id,
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return apiError("INTERNAL_ERROR", "Unable to schedule cancellation.", 500);
  }
}
