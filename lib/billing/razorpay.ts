import crypto from "crypto";
import Razorpay from "razorpay";

export function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay environment variables are not configured.");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
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
