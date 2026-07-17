import crypto from "crypto";
import { NextResponse } from "next/server";
import { planFromProviderPriceId } from "@/lib/billing/plans";
import {
  stableWebhookEventId,
  verifyRazorpayWebhookSignature,
} from "@/lib/billing/razorpay";
import { applyVerifiedSubscriptionEvent } from "@/lib/billing/subscriptions";
import { shouldApplySubscriptionUpdate } from "@/lib/billing/plan-change";
import { subscriptionStatusForEvent } from "@/lib/billing/provider-events";
import type { BillingInterval, PlanId } from "@/lib/billing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/security/validation";
import { readTextBodyWithLimit } from "@/lib/security/request-body";

type RazorpayWebhookPayload = {
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: { entity?: {
      id?: string; customer_id?: string; plan_id?: string;
      current_start?: number; current_end?: number;
      has_scheduled_changes?: boolean; change_scheduled_at?: number | null;
      notes?: { internal_user_id?: string };
    } };
    payment?: { entity?: {
      id?: string; subscription_id?: string; order_id?: string;
      amount?: number; amount_refunded?: number;
    } };
  };
};

function unixDate(value?: number | null) {
  return value ? new Date(value * 1000) : null;
}

function isPaidPlan(value: unknown): value is Exclude<PlanId, "free"> {
  return value === "plus" || value === "pro";
}

function isPaidInterval(value: unknown): value is Exclude<BillingInterval, "none"> {
  return value === "monthly" || value === "annual";
}

export async function POST(request: Request) {
  const body = await readTextBodyWithLimit(request, 1_000_000);
  if (!body.ok) {
    return apiError("VALIDATION_ERROR", "Webhook payload is too large.", 413);
  }
  const rawBody = body.text;
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return apiError("WEBHOOK_VERIFICATION_FAILED", "Missing webhook signature.", 400);
  }
  try {
    if (!verifyRazorpayWebhookSignature({ rawBody, signature })) {
      return apiError("WEBHOOK_VERIFICATION_FAILED", "Invalid webhook signature.", 400);
    }
  } catch {
    return apiError("CONFIGURATION_ERROR", "Webhook verification is not configured.", 500);
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid webhook payload.", 400);
  }
  const eventType = payload.event ?? "unknown";
  const eventId = request.headers.get("x-razorpay-event-id") ?? stableWebhookEventId(rawBody);
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const supabase = createSupabaseAdminClient();
  const { data: existingEvent, error: existingError } = await supabase
    .from("webhook_events")
    .select("id, processing_status, processed_at, attempt_count")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existingError) return apiError("INTERNAL_ERROR", "Unable to process webhook.", 500);
  if (existingEvent?.processed_at || existingEvent?.processing_status === "processed") {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  const { error: eventStoreError } = await supabase.from("webhook_events").upsert({
    provider: "razorpay",
    event_id: eventId,
    event_type: eventType,
    payload: null,
    payload_hash: payloadHash,
    processing_status: "processing",
    attempt_count: Number(existingEvent?.attempt_count ?? 0) + 1,
    failure_reason: null,
  }, { onConflict: "event_id" });
  if (eventStoreError) return apiError("INTERNAL_ERROR", "Unable to store webhook.", 500);

  try {
    if (!subscriptionStatusForEvent(eventType)) {
      await supabase.from("webhook_events").update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
      return NextResponse.json({ ok: true, ignored: true });
    }
    const subscriptionEntity = payload.payload?.subscription?.entity;
    const paymentEntity = payload.payload?.payment?.entity;
    if (!shouldApplySubscriptionUpdate(eventType, subscriptionEntity?.has_scheduled_changes)) {
      await supabase.from("webhook_events").update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
      return NextResponse.json({
        ok: true,
        scheduledChangePending: true,
        effectiveAt: unixDate(subscriptionEntity?.change_scheduled_at)?.toISOString() ?? null,
      });
    }
    const providerSubscriptionId = subscriptionEntity?.id ?? paymentEntity?.subscription_id;
    if (!providerSubscriptionId) throw new Error("SUBSCRIPTION_ID_MISSING");
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("user_id, plan_id, billing_interval, provider_price_id")
      .eq("razorpay_subscription_id", providerSubscriptionId)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    const mapped = planFromProviderPriceId(
      subscriptionEntity?.plan_id ?? subscription?.provider_price_id,
    );
    const plan = mapped?.plan ?? subscription?.plan_id;
    const interval = mapped?.interval ?? subscription?.billing_interval;
    const userId = subscription?.user_id ?? subscriptionEntity?.notes?.internal_user_id;
    if (!userId || !isPaidPlan(plan) || !isPaidInterval(interval)) {
      throw new Error("UNKNOWN_PROVIDER_PLAN");
    }

    const isPartialRefund = eventType === "payment.refunded" &&
      typeof paymentEntity?.amount === "number" &&
      typeof paymentEntity.amount_refunded === "number" &&
      paymentEntity.amount_refunded < paymentEntity.amount;
    if (isPartialRefund) {
      await supabase.from("billing_audit_events").insert({
        user_id: userId,
        event_type: "partial_refund_recorded",
        provider_event_id: eventId,
        metadata: {
          provider_subscription_id: providerSubscriptionId,
          amount: paymentEntity.amount,
          amount_refunded: paymentEntity.amount_refunded,
        },
      });
      await supabase.from("webhook_events").update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
      return NextResponse.json({ ok: true, partialRefund: true });
    }

    await applyVerifiedSubscriptionEvent({
      providerEventId: eventId,
      eventType,
      eventCreatedAt: unixDate(payload.created_at) ?? new Date(),
      providerSubscriptionId,
      providerCustomerId: subscriptionEntity?.customer_id ?? null,
      providerPaymentId: paymentEntity?.id ?? null,
      providerOrderId: paymentEntity?.order_id ?? null,
      providerPriceId: subscriptionEntity?.plan_id ?? subscription?.provider_price_id ?? null,
      plan,
      interval,
      userId,
      currentPeriodStart: unixDate(subscriptionEntity?.current_start),
      currentPeriodEnd: unixDate(subscriptionEntity?.current_end),
    });
    await supabase.from("webhook_events").update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("event_id", eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 160) : "WEBHOOK_PROCESSING_FAILED";
    await supabase.from("webhook_events").update({
      processing_status: "failed",
      failure_reason: reason,
    }).eq("event_id", eventId);
    return apiError("INTERNAL_ERROR", "Unable to process webhook.", 500);
  }
}
