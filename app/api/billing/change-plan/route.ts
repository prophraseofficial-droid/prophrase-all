import { NextResponse } from "next/server";
import crypto from "crypto";
import { getBillingAccount } from "@/lib/billing/account";
import {
  replacementRelatedIds,
} from "@/lib/billing/cancellation";
import {
  cancelProviderSubscription,
  continueProviderSubscription,
  reusableProviderSubscription,
} from "@/lib/billing/provider-subscription";
import {
  classifyPlanChange,
  buildRazorpayPlanUpdate,
  planChangeExecution,
  planChangeChargePolicy,
  replacementPlanChangeTiming,
  replacementUpgradeAmountPaise,
  razorpayScheduleForPlanChange,
} from "@/lib/billing/plan-change";
import { checkoutDefinition } from "@/lib/billing/plans";
import {
  getRazorpayCheckoutKeyId,
  getRazorpayClient,
  verifyRazorpayPlanConfiguration,
} from "@/lib/billing/razorpay";
import { createReplacementSubscription } from "@/lib/billing/replacement-subscription";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { apiError, billingChangePlanSchema, getZodErrorMessage, validationError } from "@/lib/security/validation";
import { getUserPlan } from "@/lib/usage/usage";

function providerErrorDetails(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const nested = record?.error && typeof record.error === "object"
    ? record.error as Record<string, unknown>
    : record;
  return {
    code: typeof nested?.code === "string" ? nested.code : null,
    description: typeof nested?.description === "string"
      ? nested.description.slice(0, 180)
      : error instanceof Error ? error.message.slice(0, 180) : null,
  };
}

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const parsed = billingChangePlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(getZodErrorMessage(parsed.error));
  const account = await getBillingAccount(user.id);
  if (!account.subscriptionId || account.plan === "free") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "Start checkout to choose a paid plan.", 409);
  }
  if (!["active", "canceled"].includes(account.subscriptionStatus)) {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "Plan changes require an active paid period. Resolve the current billing status first.", 409);
  }
  if (account.billingInterval !== "monthly" && account.billingInterval !== "annual") {
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "The current billing interval is unavailable. Refresh billing status before changing plans.", 409);
  }
  const timing = classifyPlanChange(
    { plan: account.plan, interval: account.billingInterval },
    parsed.data,
  );
  if (timing === "unchanged") {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  const supabase = createSupabaseAdminClient();
  if (account.pendingPlan && account.pendingBillingInterval) {
    if (
      account.pendingPlan === parsed.data.plan &&
      account.pendingBillingInterval === parsed.data.interval
    ) {
      const { data: pendingReplacement } = await supabase.from("subscriptions")
        .select("razorpay_subscription_id, status")
        .eq("user_id", user.id)
        .eq("migration_source", `replacement:${account.subscriptionId}`)
        .eq("plan_id", parsed.data.plan)
        .eq("billing_interval", parsed.data.interval)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingReplacement?.razorpay_subscription_id && pendingReplacement.status === "created") {
        let publicKeyId: string;
        try {
          publicKeyId = getRazorpayCheckoutKeyId();
        } catch {
          return apiError("CONFIGURATION_ERROR", "Razorpay checkout is not configured.", 500);
        }
        const profile = await getUserPlan(user.id);
        return NextResponse.json({
          ok: true,
          duplicate: true,
          requiresCheckout: true,
          replacement: true,
          subscriptionId: pendingReplacement.razorpay_subscription_id,
          razorpayKeyId: publicKeyId,
          immediate: timing === "immediate",
          effectiveAt: account.planChangeEffectiveAt,
          user: {
            name: profile.full_name ?? "",
            email: profile.email ?? user.email ?? "",
          },
        });
      }
      return NextResponse.json({
        ok: true,
        duplicate: true,
        processing: true,
        immediate: timing === "immediate",
        effectiveAt: account.planChangeEffectiveAt,
        chargePolicy: planChangeChargePolicy(timing),
      });
    }
    return apiError("PLAN_CHANGE_PENDING", "Another plan change is already pending. Wait for it to complete before choosing a different plan.", 409);
  }
  const definition = checkoutDefinition(parsed.data.plan, parsed.data.interval);
  if (!definition.razorpayPlanId || !definition.amountPaise) {
    return apiError("CONFIGURATION_ERROR", "The selected plan is not configured.", 500);
  }
  try {
    await verifyRazorpayPlanConfiguration({
      planId: definition.razorpayPlanId,
      amountPaise: definition.amountPaise,
      currency: definition.currency,
      interval: parsed.data.interval,
    });
  } catch (error) {
    console.error("[billing] Razorpay plan configuration check failed", {
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      description: error instanceof Error ? error.message : null,
    });
    return apiError("CONFIGURATION_ERROR", "The selected plan is not configured correctly.", 500);
  }
  const requestHash = crypto.createHash("sha256").update(`${parsed.data.plan}:${parsed.data.interval}`).digest("hex");
  const { data: existingKey } = await supabase.from("billing_idempotency_keys")
    .select("request_hash, status").eq("user_id", user.id)
    .eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existingKey) {
    if (existingKey.request_hash !== requestHash) return apiError("IDEMPOTENCY_KEY_REUSED", "This request key was used for a different plan change.", 409);
    return NextResponse.json({ ok: true, duplicate: true, processing: existingKey.status === "processing" });
  }
  const { error: keyError } = await supabase.from("billing_idempotency_keys").insert({
    user_id: user.id, idempotency_key: parsed.data.idempotencyKey,
    operation_type: "change_plan", request_hash: requestHash,
  });
  if (keyError) return apiError("CREDIT_REQUEST_IN_PROGRESS", "This plan change is already processing.", 409);
  const { data: subscription } = await supabase.from("subscriptions")
    .select("razorpay_subscription_id, razorpay_customer_id, current_period_start, current_period_end")
    .eq("id", account.subscriptionId).single();
  if (!subscription?.razorpay_subscription_id) return apiError("SUBSCRIPTION_NOT_ACTIVE", "Provider subscription not found.", 404);
  const razorpay = getRazorpayClient();
  let providerSubscription;
  try {
    providerSubscription = await razorpay.subscriptions.fetch(subscription.razorpay_subscription_id);
  } catch (error) {
    const details = providerErrorDetails(error);
    console.error("[billing] Unable to fetch subscription before plan change", {
      subscriptionId: account.subscriptionId,
      ...details,
    });
    await supabase.from("billing_idempotency_keys").update({ status: "failed" })
      .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey);
    return apiError("INTERNAL_ERROR", "Unable to confirm the current subscription. Please try again.", 503);
  }
  if (!["active", "authenticated"].includes(providerSubscription.status ?? "") && !account.cancelAtPeriodEnd) {
    await supabase.from("billing_idempotency_keys").update({ status: "failed" })
      .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey);
    return apiError("SUBSCRIPTION_NOT_ACTIVE", "The payment provider does not allow changes in the current subscription state.", 409);
  }
  const execution = account.cancelAtPeriodEnd
    ? "replacement_checkout" as const
    : planChangeExecution(providerSubscription.payment_method);
  if (execution === "replacement_checkout") {
    const replacementTiming = replacementPlanChangeTiming(
      { plan: account.plan, interval: account.billingInterval },
      parsed.data,
    );
    if (replacementTiming === "unchanged") {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    const periodStartValue = subscription.current_period_start ??
      (providerSubscription.current_start
        ? new Date(providerSubscription.current_start * 1000).toISOString()
        : null);
    const periodEndValue = subscription.current_period_end ?? account.currentPeriodEnd ??
      (providerSubscription.current_end
        ? new Date(providerSubscription.current_end * 1000).toISOString()
        : null);
    if (!periodStartValue || !periodEndValue) {
      await supabase.from("billing_idempotency_keys").update({ status: "failed" })
        .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey);
      return apiError("SUBSCRIPTION_NOT_ACTIVE", "The paid period could not be verified. Refresh billing and try again.", 409);
    }
    const periodStart = new Date(periodStartValue);
    const effectiveAt = new Date(periodEndValue);
    const now = new Date();
    try {
      if (replacementTiming === "cycle_end") {
      const { data: relatedRows, error: relatedError } = await supabase
        .from("subscriptions")
        .select("id, plan_id, billing_interval, razorpay_subscription_id, migration_source")
        .eq("user_id", user.id);
      if (relatedError) throw relatedError;
      const rows = relatedRows ?? [];
      const relatedIds = new Set(replacementRelatedIds(rows, account.subscriptionId));
      const reusable = await reusableProviderSubscription(
        rows.filter((row) =>
          row.id !== account.subscriptionId &&
          relatedIds.has(row.id) &&
          row.plan_id === parsed.data.plan &&
          row.billing_interval === parsed.data.interval,
        ),
      );
      if (reusable?.row.razorpay_subscription_id) {
        await continueProviderSubscription(reusable.row.razorpay_subscription_id);
        if (subscription.razorpay_subscription_id !== reusable.row.razorpay_subscription_id) {
          await cancelProviderSubscription(subscription.razorpay_subscription_id);
        }
        const writes = await Promise.all([
          supabase.from("subscriptions").update({
            cancel_at_period_end: false,
            internal_status: "active",
            canceled_at: null,
            pending_plan_id: parsed.data.plan,
            pending_billing_interval: parsed.data.interval,
            plan_change_effective_at: effectiveAt.toISOString(),
          }).eq("id", account.subscriptionId),
          supabase.from("profiles").update({
            cancel_at_period_end: false,
            subscription_status: "active",
          }).eq("id", user.id),
          supabase.from("billing_idempotency_keys").update({ status: "completed" })
            .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
          supabase.from("billing_audit_events").insert({
            user_id: user.id,
            subscription_id: account.subscriptionId,
            event_type: "subscription_existing_mandate_reused",
            metadata: {
              fromPlan: account.plan,
              fromInterval: account.billingInterval,
              plan: parsed.data.plan,
              interval: parsed.data.interval,
              providerSubscriptionId: reusable.row.razorpay_subscription_id,
              effectiveAt: effectiveAt.toISOString(),
            },
          }),
        ]);
        const failedWrite = writes.find((write) => write.error);
        if (failedWrite?.error) throw failedWrite.error;
        return NextResponse.json({
          ok: true,
          immediate: false,
          effectiveAt: effectiveAt.toISOString(),
          chargePolicy: "next_renewal",
          reusedMandate: true,
        });
      }
      }
    } catch (error) {
      const details = providerErrorDetails(error);
      console.error("[billing] Existing mandate reuse failed", {
        subscriptionId: account.subscriptionId,
        plan: parsed.data.plan,
        interval: parsed.data.interval,
        ...details,
      });
      await supabase.from("billing_idempotency_keys").update({ status: "failed" })
        .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey);
      return apiError("INTERNAL_ERROR", "Unable to reuse the existing autopay mandate. Please try again.", 502);
    }
    const addonAmountPaise = replacementTiming === "immediate"
      ? replacementUpgradeAmountPaise({
          current: { plan: account.plan, interval: account.billingInterval },
          target: parsed.data,
          periodStart,
          periodEnd: effectiveAt,
          now,
        })
      : 0;
    try {
      const replacement = await createReplacementSubscription({
        userId: user.id,
        target: parsed.data,
        idempotencyKey: parsed.data.idempotencyKey,
        oldSubscriptionId: account.subscriptionId,
        oldProviderSubscriptionId: subscription.razorpay_subscription_id,
        oldCustomerId: subscription.razorpay_customer_id ?? providerSubscription.customer_id ?? null,
        effectiveAt,
        timing: replacementTiming,
        addonAmountPaise,
      });
      const profile = await getUserPlan(user.id);
      await Promise.all([
        supabase.from("subscriptions").update({
          pending_plan_id: parsed.data.plan,
          pending_billing_interval: parsed.data.interval,
          plan_change_effective_at: replacementTiming === "immediate"
            ? now.toISOString()
            : effectiveAt.toISOString(),
        }).eq("id", account.subscriptionId),
        supabase.from("billing_idempotency_keys").update({ status: "completed" })
          .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
        supabase.from("billing_audit_events").insert({
          user_id: user.id,
          subscription_id: account.subscriptionId,
          event_type: "subscription_replacement_checkout_created",
          metadata: {
            fromPlan: account.plan,
            fromInterval: account.billingInterval,
            plan: parsed.data.plan,
            interval: parsed.data.interval,
            paymentMethod: providerSubscription.payment_method ?? "unknown",
            timing: replacementTiming,
            addonAmountPaise,
          },
        }),
      ]);
      return NextResponse.json({
        ok: true,
        requiresCheckout: true,
        replacement: true,
        subscriptionId: replacement.providerSubscriptionId,
        razorpayKeyId: replacement.publicKeyId,
        immediate: replacementTiming === "immediate",
        effectiveAt: replacementTiming === "immediate" ? now.toISOString() : effectiveAt.toISOString(),
        addonAmountPaise,
        chargePolicy: replacementTiming === "immediate" ? "prorated_difference" : "next_renewal",
        user: {
          name: profile.full_name ?? "",
          email: profile.email ?? user.email ?? "",
        },
      });
    } catch (error) {
      const details = providerErrorDetails(error);
      console.error("[billing] Replacement checkout creation failed", {
        subscriptionId: account.subscriptionId,
        plan: parsed.data.plan,
        interval: parsed.data.interval,
        paymentMethod: providerSubscription.payment_method ?? "unknown",
        ...details,
      });
      await Promise.all([
        supabase.from("subscriptions").update({
          pending_plan_id: null,
          pending_billing_interval: null,
          plan_change_effective_at: null,
        }).eq("id", account.subscriptionId),
        supabase.from("billing_idempotency_keys").update({ status: "failed" })
          .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
      ]);
      return apiError("CHECKOUT_FAILED", "Razorpay could not prepare the plan-change authorization. Please try again.", 502);
    }
  }
  const scheduleChangeAt = razorpayScheduleForPlanChange(timing);
  const requestedAt = new Date();
  const tentativeEffectiveAt = timing === "immediate"
    ? requestedAt.toISOString()
    : account.currentPeriodEnd;
  const { error: pendingUpdateError } = await supabase.from("subscriptions").update({
    pending_plan_id: parsed.data.plan,
    pending_billing_interval: parsed.data.interval,
    plan_change_effective_at: tentativeEffectiveAt,
  }).eq("id", account.subscriptionId);
  if (pendingUpdateError) {
    await supabase.from("billing_idempotency_keys").update({ status: "failed" })
      .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey);
    return apiError("INTERNAL_ERROR", "Unable to prepare the plan change. Your current plan was not changed.", 500);
  }
  try {
    const providerSubscription = await razorpay.subscriptions.update(
      subscription.razorpay_subscription_id,
      buildRazorpayPlanUpdate(definition.razorpayPlanId, parsed.data, timing),
    );
    const effectiveAt = timing === "immediate"
      ? requestedAt.toISOString()
      : providerSubscription.change_scheduled_at
        ? new Date(providerSubscription.change_scheduled_at * 1000).toISOString()
        : account.currentPeriodEnd;
    const [subscriptionUpdate, auditInsert, idempotencyUpdate] = await Promise.all([
      supabase.from("subscriptions").update({
        plan_change_effective_at: effectiveAt,
      })
        .eq("id", account.subscriptionId)
        .eq("pending_plan_id", parsed.data.plan)
        .eq("pending_billing_interval", parsed.data.interval),
      supabase.from("billing_audit_events").insert({
        user_id: user.id, subscription_id: account.subscriptionId,
        event_type: timing === "immediate" ? "subscription_upgrade_requested" : "subscription_downgrade_scheduled",
        metadata: {
          fromPlan: account.plan,
          fromInterval: account.billingInterval,
          plan: parsed.data.plan,
          interval: parsed.data.interval,
          requestHash,
          scheduleChangeAt,
          chargePolicy: planChangeChargePolicy(timing),
        },
      }),
      supabase.from("billing_idempotency_keys").update({ status: "completed" })
        .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
    ]);
    if (subscriptionUpdate.error || auditInsert.error || idempotencyUpdate.error) {
      console.error("[billing] Provider accepted a plan change but local reconciliation is pending", {
        subscriptionId: account.subscriptionId,
        timing,
        localUpdateFailed: Boolean(subscriptionUpdate.error),
        auditInsertFailed: Boolean(auditInsert.error),
        idempotencyUpdateFailed: Boolean(idempotencyUpdate.error),
      });
    }
    return NextResponse.json({
      ok: true,
      immediate: timing === "immediate",
      effectiveAt,
      chargePolicy: planChangeChargePolicy(timing),
    });
  } catch (error) {
    const details = providerErrorDetails(error);
    console.error("[billing] Native plan change failed", {
      subscriptionId: account.subscriptionId,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      paymentMethod: providerSubscription.payment_method ?? "unknown",
      ...details,
    });
    await Promise.all([
      supabase.from("subscriptions").update({
        pending_plan_id: null,
        pending_billing_interval: null,
        plan_change_effective_at: null,
      })
        .eq("id", account.subscriptionId)
        .eq("pending_plan_id", parsed.data.plan)
        .eq("pending_billing_interval", parsed.data.interval),
      supabase.from("billing_idempotency_keys").update({ status: "failed" })
        .eq("user_id", user.id).eq("idempotency_key", parsed.data.idempotencyKey),
    ]);
    return apiError("INTERNAL_ERROR", "Unable to change plan. Your current plan was not changed.", 500);
  }
}
