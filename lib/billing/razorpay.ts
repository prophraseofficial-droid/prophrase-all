import crypto from "crypto";
import Razorpay from "razorpay";

type RazorpayEnvironment = Record<string, string | undefined>;
type RazorpayMode = "test" | "live";

function modeFromKeyId(keyId: string): RazorpayMode | null {
  if (keyId.startsWith("rzp_test_")) return "test";
  if (keyId.startsWith("rzp_live_")) return "live";
  return null;
}

export function validateRazorpayKeyConfiguration({
  env = process.env,
  requirePublicKey = false,
}: {
  env?: RazorpayEnvironment;
  requirePublicKey?: boolean;
} = {}) {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const publicKeyId = env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  if (!keyId || !keySecret) {
    throw new Error("Razorpay server credentials are not configured.");
  }

  const keyMode = modeFromKeyId(keyId);
  if (!keyMode) {
    throw new Error("RAZORPAY_KEY_ID must be a Razorpay test or live key ID.");
  }
  const configuredMode = env.RAZORPAY_MODE?.trim().toLowerCase();
  if (configuredMode && configuredMode !== "test" && configuredMode !== "live") {
    throw new Error("RAZORPAY_MODE must be either test or live.");
  }
  if (configuredMode && configuredMode !== keyMode) {
    throw new Error("RAZORPAY_MODE does not match RAZORPAY_KEY_ID.");
  }
  if (requirePublicKey && !publicKeyId) {
    throw new Error("NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured.");
  }
  if (publicKeyId && publicKeyId !== keyId) {
    throw new Error("The public and server Razorpay key IDs do not match.");
  }

  const productionDeployment = env.VERCEL_ENV === "production" ||
    env.APP_ENV === "production" || env.NEXT_PUBLIC_APP_ENV === "production";
  if (productionDeployment && env.PAID_CHECKOUT_ENABLED === "true" && keyMode !== "live") {
    throw new Error("Live Razorpay credentials are required when paid checkout is enabled in production.");
  }

  return { keyId, keySecret, publicKeyId: publicKeyId ?? null, mode: keyMode };
}

export function getRazorpayClient() {
  const { keyId, keySecret } = validateRazorpayKeyConfiguration();

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export function getRazorpayCheckoutKeyId() {
  const { publicKeyId } = validateRazorpayKeyConfiguration({ requirePublicKey: true });
  return publicKeyId!;
}

export function assertRazorpayPlanMatches({
  providerPlan,
  expectedAmountPaise,
  expectedCurrency,
  expectedInterval,
}: {
  providerPlan: {
    interval?: number;
    period?: string;
    item?: { amount?: number | string; currency?: string };
  };
  expectedAmountPaise: number;
  expectedCurrency: string;
  expectedInterval: "monthly" | "annual";
}) {
  const expectedPeriod = expectedInterval === "monthly" ? "monthly" : "yearly";
  const amount = Number(providerPlan.item?.amount);
  const currency = providerPlan.item?.currency?.toUpperCase();
  if (
    amount !== expectedAmountPaise ||
    currency !== expectedCurrency.toUpperCase() ||
    providerPlan.period !== expectedPeriod ||
    providerPlan.interval !== 1
  ) {
    throw new Error(
      `Razorpay plan does not match the configured ${expectedInterval} price, currency, or billing interval.`,
    );
  }
}

const verifiedPlans = new Map<string, Promise<void>>();

export async function verifyRazorpayPlanConfiguration({
  planId,
  amountPaise,
  currency,
  interval,
}: {
  planId: string;
  amountPaise: number;
  currency: string;
  interval: "monthly" | "annual";
}) {
  const { keyId } = validateRazorpayKeyConfiguration();
  const cacheKey = `${keyId}:${planId}:${amountPaise}:${currency}:${interval}`;
  const existing = verifiedPlans.get(cacheKey);
  if (existing) return existing;

  const verification = (async () => {
    const providerPlan = await getRazorpayClient().plans.fetch(planId);
    assertRazorpayPlanMatches({
      providerPlan,
      expectedAmountPaise: amountPaise,
      expectedCurrency: currency,
      expectedInterval: interval,
    });
  })();
  verifiedPlans.set(cacheKey, verification);
  try {
    await verification;
  } catch (error) {
    verifiedPlans.delete(cacheKey);
    throw error;
  }
}

export function verifyRazorpaySubscriptionPaymentSignature({
  paymentId,
  subscriptionId,
  signature,
}: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error("RAZORPAY_KEY_SECRET is not configured.");
  }

  const payload = `${paymentId}|${subscriptionId}`;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(payload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

export function verifyRazorpayWebhookSignature({
  rawBody,
  signature,
}: {
  rawBody: string;
  signature: string;
}) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured.");
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

export function stableWebhookEventId(rawBody: string) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}
