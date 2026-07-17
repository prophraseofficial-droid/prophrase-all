import crypto from "crypto";
import { NextResponse } from "next/server";
import { checkoutDefinition } from "@/lib/billing/plans";
import { getBillingFlags } from "@/lib/billing/flags";
import { getRazorpayClient } from "@/lib/billing/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  billingCheckoutSchema,
  getZodErrorMessage,
  validationError,
} from "@/lib/security/validation";
import { getUserPlan } from "@/lib/usage/usage";
import { getBillingAccount } from "@/lib/billing/account";

function razorpayCustomerName(value: unknown) {
  if (typeof value !== "string") return undefined;
  const name = value.trim().slice(0, 50);
  if (name.length < 3 || !/^[A-Za-z0-9][A-Za-z0-9 .,'_()@/-]*[A-Za-z0-9.)]$/.test(name)) {
    return undefined;
  }
  return name;
}

function checkoutErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { category: error.name, code: null, description: error.message.slice(0, 180) };
  }
  if (!error || typeof error !== "object") {
    return { category: typeof error, code: null, description: null };
  }
  const record = error as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object"
    ? record.error as Record<string, unknown>
    : record;
  return {
    category: typeof nested.code === "string" ? "provider" : "unknown_object",
    code: typeof nested.code === "string" ? nested.code : null,
    description: typeof nested.description === "string"
      ? nested.description.slice(0, 180)
      : typeof nested.message === "string" ? nested.message.slice(0, 180) : null,
  };
}

function isExistingRazorpayCustomerError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const nested = record.error && typeof record.error === "object"
    ? record.error as Record<string, unknown>
    : record;
  return nested.code === "BAD_REQUEST_ERROR"
    && typeof nested.description === "string"
    && nested.description.toLowerCase().includes("customer already exists");
}

async function findRazorpayCustomerByEmail(
  razorpay: ReturnType<typeof getRazorpayClient>,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const pageSize = 100;

  // Razorpay's customer list endpoint does not support email filtering. This
  // recovery path is used only when customer creation reports a duplicate;
  // once found, the id is persisted locally and subsequent checkouts skip it.
  for (let skip = 0; skip < 5_000; skip += pageSize) {
    const page = await razorpay.customers.all({ count: pageSize, skip });
    const match = page.items.find((customer) =>
      typeof customer.email === "string"
      && customer.email.trim().toLowerCase() === normalizedEmail
    );
    if (match) return match;
    if (page.items.length < pageSize) break;
  }

  return null;
}

export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!getBillingFlags().paidCheckoutEnabled) {
    return apiError("FEATURE_DISABLED", "Paid checkout is not enabled yet.", 404);
  }
  const rateLimit = checkRateLimit(`billing:checkout:${user.id}`, 5, 60_000);
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many checkout attempts. Please try again shortly.", 429, {
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }
  const parsed = billingCheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(getZodErrorMessage(parsed.error));

  const billingAccount = await getBillingAccount(user.id);
  if (billingAccount.plan !== "free" && billingAccount.subscriptionId) {
    return apiError(
      "PLAN_CHANGE_REQUIRED",
      "An active paid subscription already exists. Change that subscription instead of starting another checkout.",
      409,
    );
  }

  const definition = checkoutDefinition(parsed.data.plan, parsed.data.interval);
  if (!definition.razorpayPlanId || !definition.amountPaise) {
    return apiError("CONFIGURATION_ERROR", "This billing plan is not configured.", 500);
  }
  const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!publicKeyId || (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== publicKeyId)) {
    return apiError("CONFIGURATION_ERROR", "Razorpay checkout is not configured.", 500);
  }

  const requestHash = crypto.createHash("sha256")
    .update(`${user.id}:${parsed.data.plan}:${parsed.data.interval}`)
    .digest("hex");
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("subscriptions")
    .select("razorpay_subscription_id, checkout_request_hash")
    .eq("user_id", user.id)
    .eq("checkout_idempotency_key", parsed.data.idempotencyKey)
    .maybeSingle();
  if (existing) {
    if (existing.checkout_request_hash !== requestHash) {
      return apiError("IDEMPOTENCY_KEY_REUSED", "This checkout key was used for a different plan.", 409);
    }
    if (existing.razorpay_subscription_id) {
      return NextResponse.json({
        subscriptionId: existing.razorpay_subscription_id,
        razorpayKeyId: publicKeyId,
        amount: definition.amountPaise,
        currency: definition.currency,
        plan: parsed.data.plan,
        interval: parsed.data.interval,
        duplicate: true,
      });
    }
    return apiError("PAYMENT_PROCESSING", "Checkout is already being prepared.", 409);
  }

  let pendingId: string | null = null;
  let providerSubscriptionId: string | null = null;
  let failureStage = "load_profile";
  try {
    const profile = await getUserPlan(user.id);
    pendingId = crypto.randomUUID();
    failureStage = "persist_pending_checkout";
    const { error: pendingError } = await supabase.from("subscriptions").insert({
      id: pendingId,
      user_id: user.id,
      provider: "razorpay",
      plan_id: parsed.data.plan,
      billing_interval: parsed.data.interval,
      internal_status: "pending",
      status: "created",
      provider_price_id: definition.razorpayPlanId,
      checkout_idempotency_key: parsed.data.idempotencyKey,
      checkout_request_hash: requestHash,
    });
    if (pendingError) throw pendingError;

    const razorpay = getRazorpayClient();
    let customerId = profile.razorpay_customer_id;
    if (!customerId) {
      failureStage = "create_customer";
      const customerEmail = profile.email ?? user.email;
      if (!customerEmail) throw new Error("CUSTOMER_EMAIL_REQUIRED");
      let customer;
      try {
        customer = await razorpay.customers.create({
          name: razorpayCustomerName(profile.full_name ?? user.user_metadata?.name),
          email: customerEmail,
          // Razorpay returns the existing customer only when every supplied
          // detail matches. A changed display name can still raise a duplicate.
          fail_existing: 0,
        });
      } catch (error) {
        if (!isExistingRazorpayCustomerError(error)) throw error;
        failureStage = "recover_customer";
        customer = await findRazorpayCustomerByEmail(razorpay, customerEmail);
        if (!customer) throw error;
      }
      customerId = customer.id;
      failureStage = "persist_customer";
      const { error: customerUpdateError } = await supabase
        .from("profiles")
        .update({ razorpay_customer_id: customerId })
        .eq("id", user.id);
      if (customerUpdateError) throw customerUpdateError;
    }
    failureStage = "create_subscription";
    const subscription = await razorpay.subscriptions.create({
      plan_id: definition.razorpayPlanId,
      customer_notify: 1,
      total_count: parsed.data.interval === "annual" ? 10 : 120,
      notes: {
        internal_user_id: user.id,
        internal_plan_id: parsed.data.plan,
        billing_interval: parsed.data.interval,
        environment: process.env.APP_ENV || process.env.VERCEL_ENV || "development",
      },
    });
    providerSubscriptionId = subscription.id;
    failureStage = "persist_subscription";
    const { error: subscriptionUpdateError } = await supabase.from("subscriptions").update({
      razorpay_customer_id: customerId,
      razorpay_subscription_id: subscription.id,
      status: subscription.status ?? "created",
    }).eq("id", pendingId);
    if (subscriptionUpdateError) throw subscriptionUpdateError;

    return NextResponse.json({
      subscriptionId: subscription.id,
      razorpayKeyId: publicKeyId,
      amount: definition.amountPaise,
      currency: definition.currency,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      user: { name: profile.full_name ?? "", email: profile.email ?? user.email ?? "" },
    });
  } catch (error) {
    const details = checkoutErrorDetails(error);
    if (pendingId && !providerSubscriptionId) {
      const { error: cleanupError } = await supabase.from("subscriptions").delete()
        .eq("id", pendingId)
        .eq("internal_status", "pending")
        .is("razorpay_subscription_id", null);
      if (cleanupError) {
        console.error("[billing] Failed to clean pending checkout", {
          pendingId,
          category: cleanupError.code ?? "database",
          description: cleanupError.message,
        });
      }
    }
    console.error("[billing] Checkout creation failed", {
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      stage: failureStage,
      providerSubscriptionCreated: Boolean(providerSubscriptionId),
      ...details,
    });
    return apiError("CHECKOUT_FAILED", "Unable to start checkout. Please try again.", 500);
  }
}
