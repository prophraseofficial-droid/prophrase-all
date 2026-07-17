import crypto from "crypto";
import { NextResponse } from "next/server";
import { getBillingAccount } from "@/lib/billing/account";
import {
  replacementDescendantIds,
  replacementRelatedIds,
} from "@/lib/billing/cancellation";
import {
  cancelProviderSubscription,
  continueProviderSubscription,
  reusableProviderSubscription,
} from "@/lib/billing/provider-subscription";
import { getPlanDefinition } from "@/lib/billing/catalog";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { createReplacementSubscription } from "@/lib/billing/replacement-subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { apiError } from "@/lib/security/validation";
import { getUserPlan } from "@/lib/usage/usage";

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const limit = checkRateLimit(`billing:resume:${user.id}`, 3, 60_000);
  if (!limit.allowed) return apiError("RATE_LIMITED", "Please wait before trying again.", 429);
  const account = await getBillingAccount(user.id);
  if (
    !account.subscriptionId || !account.cancelAtPeriodEnd ||
    account.plan === "free" || account.billingInterval === "none" ||
    !account.currentPeriodEnd
  ) {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No scheduled cancellation was found.", 404);
  }
  const body = await request.json().catch(() => null) as { idempotencyKey?: unknown } | null;
  const idempotencyKey = typeof body?.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotencyKey)
    ? body.idempotencyKey
    : crypto.randomUUID();
  const supabase = createSupabaseAdminClient();
  const [{ data: subscriptionRows, error: rowsError }, { data: cancellationAudit }] = await Promise.all([
    supabase.from("subscriptions")
      .select("id, plan_id, billing_interval, razorpay_subscription_id, razorpay_customer_id, migration_source")
      .eq("user_id", user.id),
    supabase.from("billing_audit_events")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("subscription_id", account.subscriptionId)
      .eq("event_type", "subscription_cancellation_scheduled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (rowsError) return apiError("INTERNAL_ERROR", "Unable to load subscription details.", 500);
  const rows = subscriptionRows ?? [];
  const subscription = rows.find((row) => row.id === account.subscriptionId);
  if (!subscription?.razorpay_subscription_id) {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "No provider subscription was found.", 404);
  }
  const auditMetadata = cancellationAudit?.metadata && typeof cancellationAudit.metadata === "object"
    ? cancellationAudit.metadata as Record<string, unknown>
    : {};
  const canceledReplacementIds = Array.isArray(auditMetadata.canceledReplacementSubscriptionIds)
    ? auditMetadata.canceledReplacementSubscriptionIds.filter((id): id is string => typeof id === "string")
    : [];
  const canceledRenewalRow = canceledReplacementIds
    .map((id) => rows.find((row) => row.id === id))
    .find((row) => row?.plan_id === "plus" || row?.plan_id === "pro");
  const auditPlan = auditMetadata.renewalPlan;
  const auditInterval = auditMetadata.renewalInterval;
  const targetPlan = auditPlan === "plus" || auditPlan === "pro"
    ? auditPlan
    : canceledRenewalRow?.plan_id === "plus" || canceledRenewalRow?.plan_id === "pro"
      ? canceledRenewalRow.plan_id
      : account.pendingPlan ?? account.plan;
  const targetInterval = auditInterval === "monthly" || auditInterval === "annual"
    ? auditInterval
    : canceledRenewalRow?.billing_interval === "monthly" || canceledRenewalRow?.billing_interval === "annual"
      ? canceledRenewalRow.billing_interval
      : account.pendingBillingInterval ?? account.billingInterval;
  if (targetInterval !== "monthly" && targetInterval !== "annual") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "The renewal billing interval is unavailable.", 409);
  }
  try {
    const provider = await getRazorpayClient().subscriptions.fetch(subscription.razorpay_subscription_id);
    const relatedIds = new Set(replacementRelatedIds(rows, account.subscriptionId));
    const reusable = await reusableProviderSubscription(
      rows.filter((row) =>
        row.id !== account.subscriptionId &&
        relatedIds.has(row.id) &&
        row.plan_id === targetPlan &&
        row.billing_interval === targetInterval,
      ),
    );
    if (reusable?.row.razorpay_subscription_id) {
      await continueProviderSubscription(reusable.row.razorpay_subscription_id);
      const descendantIds = replacementDescendantIds(rows, account.subscriptionId)
        .filter((id) => id !== reusable.row.id);
      for (const descendantId of descendantIds) {
        const descendant = rows.find((row) => row.id === descendantId);
        if (descendant?.razorpay_subscription_id) {
          await cancelProviderSubscription(descendant.razorpay_subscription_id);
        }
      }
      const resumedAt = new Date().toISOString();
      const writes = await Promise.all([
        supabase.from("subscriptions").update({
          cancel_at_period_end: false,
          internal_status: "active",
          canceled_at: null,
          pending_plan_id: targetPlan,
          pending_billing_interval: targetInterval,
          plan_change_effective_at: account.currentPeriodEnd,
        }).eq("id", account.subscriptionId),
        descendantIds.length
          ? supabase.from("subscriptions").update({
              internal_status: "expired",
              status: "cancelled",
              cancel_at_period_end: false,
              canceled_at: resumedAt,
            }).in("id", descendantIds)
          : Promise.resolve({ error: null }),
        supabase.from("profiles").update({
          cancel_at_period_end: false,
          subscription_status: "active",
        }).eq("id", user.id),
        supabase.from("billing_audit_events").insert({
          user_id: user.id,
          subscription_id: account.subscriptionId,
          event_type: "subscription_autopay_resumed",
          metadata: {
            plan: targetPlan,
            interval: targetInterval,
            effectiveAt: account.currentPeriodEnd,
            reusedProviderSubscriptionId: reusable.row.razorpay_subscription_id,
          },
        }),
      ]);
      const failedWrite = writes.find((write) => write.error);
      if (failedWrite?.error) throw failedWrite.error;
      return NextResponse.json({
        ok: true,
        requiresCheckout: false,
        reusedMandate: true,
        effectiveAt: account.currentPeriodEnd,
        plan: targetPlan,
        interval: targetInterval,
        planCredits: getPlanDefinition(targetPlan).monthlyCredits,
      });
    }
    const replacement = await createReplacementSubscription({
      userId: user.id,
      target: { plan: targetPlan, interval: targetInterval },
      idempotencyKey,
      oldSubscriptionId: account.subscriptionId,
      oldProviderSubscriptionId: subscription.razorpay_subscription_id,
      oldCustomerId: subscription.razorpay_customer_id ?? provider.customer_id ?? null,
      effectiveAt: new Date(account.currentPeriodEnd),
      timing: "cycle_end",
      addonAmountPaise: 0,
      kind: "resume_replacement",
    });
    const profile = await getUserPlan(user.id);
    return NextResponse.json({
      ok: true,
      requiresCheckout: true,
      subscriptionId: replacement.providerSubscriptionId,
      razorpayKeyId: replacement.publicKeyId,
      effectiveAt: account.currentPeriodEnd,
      plan: targetPlan,
      interval: targetInterval,
      user: {
        name: profile.full_name ?? "",
        email: profile.email ?? user.email ?? "",
      },
    });
  } catch (error) {
    console.error("[billing] Resume authorization failed", {
      subscriptionId: account.subscriptionId,
      description: error instanceof Error ? error.message.slice(0, 180) : null,
    });
    return apiError("CHECKOUT_FAILED", "Unable to prepare autopay reauthorization. Please try again.", 502);
  }
}
