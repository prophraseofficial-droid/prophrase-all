import crypto from "crypto";
import { checkoutDefinition } from "@/lib/billing/plans";
import {
  getRazorpayCheckoutKeyId,
  getRazorpayClient,
  verifyRazorpayPlanConfiguration,
} from "@/lib/billing/razorpay";
import { planChangeCreditCycle, remainingBillingCycles, type PaidPlanSelection } from "@/lib/billing/plan-change";
import { applyVerifiedSubscriptionEvent } from "@/lib/billing/subscriptions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ReplacementMetadata = {
  kind: "plan_change_replacement" | "resume_replacement";
  oldSubscriptionId: string;
  oldProviderSubscriptionId: string;
  timing: "immediate" | "cycle_end";
  effectiveAt: string;
  addonAmountPaise: number;
  finalizedAt?: string;
};

function metadataFrom(value: unknown): ReplacementMetadata | null {
  if (!value || typeof value !== "object") return null;
  const replacement = (value as { replacement?: unknown }).replacement;
  if (!replacement || typeof replacement !== "object") return null;
  const data = replacement as Partial<ReplacementMetadata>;
  if (
    (data.kind !== "plan_change_replacement" && data.kind !== "resume_replacement") ||
    !data.oldSubscriptionId || !data.oldProviderSubscriptionId ||
    (data.timing !== "immediate" && data.timing !== "cycle_end") ||
    !data.effectiveAt
  ) return null;
  return { ...data, addonAmountPaise: Number(data.addonAmountPaise ?? 0) } as ReplacementMetadata;
}

async function scheduleOldSubscriptionCancellation(providerSubscriptionId: string) {
  const razorpay = getRazorpayClient();
  try {
    await razorpay.subscriptions.cancel(providerSubscriptionId, true);
  } catch (error) {
    // Browser verification and the authenticated webhook can race. Treat an
    // already-scheduled or terminal provider subscription as an idempotent
    // success, but preserve every genuinely unexpected provider failure.
    const current = await razorpay.subscriptions.fetch(providerSubscriptionId);
    const terminal = ["cancelled", "completed", "expired"].includes(
      current.status ?? "",
    );
    if (!terminal && current.has_scheduled_changes !== true) throw error;
  }
}

export async function createReplacementSubscription({
  userId,
  target,
  idempotencyKey,
  oldSubscriptionId,
  oldProviderSubscriptionId,
  oldCustomerId,
  effectiveAt,
  timing,
  addonAmountPaise,
  kind = "plan_change_replacement",
}: {
  userId: string;
  target: PaidPlanSelection;
  idempotencyKey: string;
  oldSubscriptionId: string;
  oldProviderSubscriptionId: string;
  oldCustomerId: string | null;
  effectiveAt: Date;
  timing: "immediate" | "cycle_end";
  addonAmountPaise: number;
  kind?: ReplacementMetadata["kind"];
}) {
  const definition = checkoutDefinition(target.plan, target.interval);
  if (!definition.razorpayPlanId || !definition.amountPaise) {
    throw new Error("REPLACEMENT_NOT_CONFIGURED");
  }
  const publicKeyId = getRazorpayCheckoutKeyId();
  await verifyRazorpayPlanConfiguration({
    planId: definition.razorpayPlanId,
    amountPaise: definition.amountPaise,
    currency: definition.currency,
    interval: target.interval,
  });
  const supabase = createSupabaseAdminClient();
  const requestHash = crypto.createHash("sha256")
    .update(`${userId}:${oldSubscriptionId}:${target.plan}:${target.interval}:${kind}`)
    .digest("hex");
  const { data: existing, error: existingError } = await supabase.from("subscriptions")
    .select("razorpay_subscription_id, checkout_request_hash")
    .eq("user_id", userId)
    .eq("checkout_idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (existing.checkout_request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
    if (!existing.razorpay_subscription_id) throw new Error("REPLACEMENT_PROCESSING");
    return { providerSubscriptionId: existing.razorpay_subscription_id, publicKeyId, duplicate: true };
  }

  const localId = crypto.randomUUID();
  const metadata: ReplacementMetadata = {
    kind,
    oldSubscriptionId,
    oldProviderSubscriptionId,
    timing,
    effectiveAt: effectiveAt.toISOString(),
    addonAmountPaise,
  };
  const { error: insertError } = await supabase.from("subscriptions").insert({
    id: localId,
    user_id: userId,
    provider: "razorpay",
    plan_id: target.plan,
    billing_interval: target.interval,
    internal_status: "pending",
    status: "created",
    razorpay_customer_id: oldCustomerId,
    provider_price_id: definition.razorpayPlanId,
    checkout_idempotency_key: idempotencyKey,
    checkout_request_hash: requestHash,
    migration_source: `replacement:${oldSubscriptionId}`,
    raw_event: { replacement: metadata },
  });
  if (insertError) throw insertError;

  try {
    const addons = addonAmountPaise > 0 ? [{
      item: {
        name: `${target.plan === "pro" ? "Pro" : "Plus"} upgrade for current paid period`,
        amount: addonAmountPaise,
        currency: definition.currency,
        description: "Prorated plan upgrade until the next renewal date",
      },
    }] : undefined;
    const provider = await getRazorpayClient().subscriptions.create({
      plan_id: definition.razorpayPlanId,
      customer_notify: 1,
      total_count: remainingBillingCycles(target.interval),
      start_at: Math.floor(effectiveAt.getTime() / 1000),
      addons,
      notes: {
        internal_user_id: userId,
        internal_plan_id: target.plan,
        billing_interval: target.interval,
        replacement_for: oldProviderSubscriptionId,
        replacement_timing: timing,
        environment: process.env.APP_ENV || process.env.VERCEL_ENV || "development",
      },
    });
    const { error: updateError } = await supabase.from("subscriptions").update({
      razorpay_subscription_id: provider.id,
      status: provider.status ?? "created",
    }).eq("id", localId);
    if (updateError) throw updateError;
    return { providerSubscriptionId: provider.id, publicKeyId, duplicate: false };
  } catch (error) {
    await supabase.from("subscriptions").delete()
      .eq("id", localId).is("razorpay_subscription_id", null);
    throw error;
  }
}

export async function finalizeReplacementSubscription({
  userId,
  providerSubscriptionId,
  providerPaymentId,
  providerCustomerId,
  providerPriceId,
  providerCurrentEnd,
  eventCreatedAt = new Date(),
}: {
  userId: string;
  providerSubscriptionId: string;
  providerPaymentId: string | null;
  providerCustomerId: string | null;
  providerPriceId: string | null;
  providerCurrentEnd: Date | null;
  eventCreatedAt?: Date;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: replacement, error } = await supabase.from("subscriptions")
    .select("id, plan_id, billing_interval, raw_event")
    .eq("user_id", userId)
    .eq("razorpay_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (error) throw error;
  const metadata = metadataFrom(replacement?.raw_event);
  if (!replacement || !metadata) return { replacement: false };
  if (metadata.finalizedAt) return { replacement: true, duplicate: true, timing: metadata.timing };
  const target = { plan: replacement.plan_id, interval: replacement.billing_interval } as PaidPlanSelection;
  const { data: oldSubscription, error: oldError } = await supabase.from("subscriptions")
    .select("id, plan_id, current_period_start, current_period_end, cancel_at_period_end")
    .eq("id", metadata.oldSubscriptionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (oldError) throw oldError;
  if (!oldSubscription) throw new Error("REPLACED_SUBSCRIPTION_NOT_FOUND");

  if (metadata.kind !== "resume_replacement" && !oldSubscription.cancel_at_period_end) {
    await scheduleOldSubscriptionCancellation(metadata.oldProviderSubscriptionId);
  }
  const finalizedAt = new Date().toISOString();
  const resumed = metadata.kind === "resume_replacement";
  const commonOldUpdate = {
    cancel_at_period_end: !resumed,
    internal_status: resumed ? "active" : "canceled",
    canceled_at: resumed ? null : finalizedAt,
    pending_plan_id: target.plan,
    pending_billing_interval: target.interval,
    plan_change_effective_at: metadata.effectiveAt,
  };
  const { error: oldUpdateError } = await supabase.from("subscriptions")
    .update(commonOldUpdate).eq("id", metadata.oldSubscriptionId);
  if (oldUpdateError) throw oldUpdateError;
  if (resumed) {
    const { error: profileError } = await supabase.from("profiles").update({
      cancel_at_period_end: false,
      subscription_status: "active",
    }).eq("id", userId);
    if (profileError) throw profileError;
  }

  if (metadata.timing === "immediate") {
    const effectiveAt = eventCreatedAt;
    const providerEnd = oldSubscription.current_period_end
      ? new Date(oldSubscription.current_period_end)
      : providerCurrentEnd;
    await applyVerifiedSubscriptionEvent({
      providerEventId: `replacement-verified:${providerPaymentId ?? providerSubscriptionId}`,
      eventType: "subscription.activated",
      eventCreatedAt: effectiveAt,
      providerSubscriptionId,
      providerCustomerId,
      providerPaymentId,
      providerOrderId: null,
      providerPriceId,
      plan: target.plan,
      interval: target.interval,
      userId,
      currentPeriodStart: effectiveAt,
      currentPeriodEnd: providerEnd,
    });
    if (oldSubscription.plan_id !== target.plan) {
      const { error: expireError } = await supabase.rpc("expire_credit_buckets", {
        p_user_id: userId,
        p_plan_id: oldSubscription.plan_id,
        p_reason: "replacement_plan_upgrade",
      });
      if (expireError) throw expireError;
    }
    const cycle = planChangeCreditCycle({
      effectiveAt,
      interval: target.interval,
      providerPeriodEnd: providerEnd,
    });
    await supabase.from("subscriptions").update({
      entitlement_cycle_start: cycle.start.toISOString(),
      entitlement_cycle_end: cycle.end.toISOString(),
    }).eq("id", replacement.id);
  } else {
    const { error: pendingError } = await supabase.from("subscriptions").update({
      status: "authenticated",
      internal_status: "pending",
      razorpay_customer_id: providerCustomerId,
      razorpay_payment_id: providerPaymentId,
      provider_price_id: providerPriceId,
    }).eq("id", replacement.id);
    if (pendingError) throw pendingError;
  }

  const finalMetadata = { ...metadata, finalizedAt };
  await Promise.all([
    supabase.from("subscriptions").update({ raw_event: { replacement: finalMetadata } })
      .eq("id", replacement.id),
    supabase.from("billing_audit_events").insert({
      user_id: userId,
      subscription_id: replacement.id,
      event_type: metadata.timing === "immediate"
        ? "replacement_upgrade_activated"
        : "replacement_plan_scheduled",
      metadata: {
        replacedSubscriptionId: metadata.oldSubscriptionId,
        plan: target.plan,
        interval: target.interval,
        effectiveAt: metadata.effectiveAt,
        addonAmountPaise: metadata.addonAmountPaise,
      },
    }),
  ]);
  return { replacement: true, timing: metadata.timing };
}
