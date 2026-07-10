import { NextResponse } from "next/server";
import {
  stableWebhookEventId,
  verifyRazorpayWebhookSignature,
} from "@/lib/billing/razorpay";
import { planFromRazorpayPlanId, type BillingPlan } from "@/lib/billing/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/security/validation";

type RazorpayWebhookPayload = {
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        status?: string;
        customer_id?: string;
        plan_id?: string;
        current_start?: number;
        current_end?: number;
        notes?: {
          user_id?: string;
          plan?: BillingPlan;
        };
      };
    };
    payment?: {
      entity?: {
        id?: string;
        status?: string;
        subscription_id?: string;
        order_id?: string;
      };
    };
  };
};

function fromUnixSeconds(value?: number) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function subscriptionStatusFromEvent(eventType: string, providerStatus?: string) {
  if (["subscription.activated", "subscription.charged", "subscription.resumed"].includes(eventType)) {
    return "active";
  }
  if (["subscription.cancelled", "subscription.completed"].includes(eventType)) {
    return "cancelled";
  }
  if (["subscription.halted", "subscription.paused"].includes(eventType)) {
    return "past_due";
  }
  return providerStatus ?? "created";
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) {
    return apiError("VALIDATION_ERROR", "Webhook payload is too large.", 413);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return apiError("PAYMENT_VERIFICATION_FAILED", "Missing webhook signature.", 400);
  }

  try {
    const valid = verifyRazorpayWebhookSignature({ rawBody, signature });
    if (!valid) {
      return apiError("PAYMENT_VERIFICATION_FAILED", "Invalid webhook signature.", 400);
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
  const eventId =
    request.headers.get("x-razorpay-event-id") ?? stableWebhookEventId(rawBody);
  const supabase = createSupabaseAdminClient();

  const { data: existingEvent, error: existingError } = await supabase
    .from("webhook_events")
    .select("id, processed_at")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingError) {
    return apiError("INTERNAL_ERROR", "Unable to process webhook.", 500);
  }

  if (existingEvent?.processed_at) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { error: insertEventError } = await supabase
    .from("webhook_events")
    .upsert(
      {
        provider: "razorpay",
        event_id: eventId,
        event_type: eventType,
        payload: payload as Record<string, unknown>,
      },
      { onConflict: "event_id" },
    );

  if (insertEventError) {
    return apiError("INTERNAL_ERROR", "Unable to store webhook.", 500);
  }

  try {
    const subscriptionEntity = payload.payload?.subscription?.entity;
    const paymentEntity = payload.payload?.payment?.entity;
    const subscriptionId = subscriptionEntity?.id ?? paymentEntity?.subscription_id;

    if (subscriptionId) {
      const { data: existingSubscription } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("razorpay_subscription_id", subscriptionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const plan =
        existingSubscription?.plan ??
        subscriptionEntity?.notes?.plan ??
        planFromRazorpayPlanId(subscriptionEntity?.plan_id);
      const userId = existingSubscription?.user_id;
      const status = subscriptionStatusFromEvent(eventType, subscriptionEntity?.status);

      if (userId && plan) {
        const subscriptionUpdate = {
          user_id: userId,
          provider: "razorpay",
          plan,
          status,
          razorpay_customer_id:
            subscriptionEntity?.customer_id ??
            existingSubscription?.razorpay_customer_id ??
            null,
          razorpay_subscription_id: subscriptionId,
          razorpay_payment_id:
            paymentEntity?.id ?? existingSubscription?.razorpay_payment_id ?? null,
          razorpay_order_id:
            paymentEntity?.order_id ?? existingSubscription?.razorpay_order_id ?? null,
          current_period_start: fromUnixSeconds(subscriptionEntity?.current_start),
          current_period_end: fromUnixSeconds(subscriptionEntity?.current_end),
          raw_event: payload as Record<string, unknown>,
        };

        if (existingSubscription?.id) {
          await supabase
            .from("subscriptions")
            .update(subscriptionUpdate)
            .eq("id", existingSubscription.id);
        } else {
          await supabase.from("subscriptions").insert(subscriptionUpdate);
        }

        const active = status === "active";
        await supabase
          .from("profiles")
          .update({
            plan: active ? plan : "free",
            subscription_status: active ? "active" : status,
            razorpay_customer_id: subscriptionUpdate.razorpay_customer_id,
            razorpay_subscription_id: subscriptionId,
            current_period_start: subscriptionUpdate.current_period_start,
            current_period_end: subscriptionUpdate.current_period_end,
          })
          .eq("id", userId);
      }
    }

    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", eventId);

    return NextResponse.json({ ok: true });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to process webhook.", 500);
  }
}
