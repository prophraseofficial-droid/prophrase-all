import Razorpay from "razorpay";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const integer = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer in paise.`);
  }
  return value;
};

const mode = required("RAZORPAY_MODE");
const keyId = required("RAZORPAY_KEY_ID");
const keySecret = required("RAZORPAY_KEY_SECRET");
const publicKeyId = required("NEXT_PUBLIC_RAZORPAY_KEY_ID");
required("RAZORPAY_WEBHOOK_SECRET");

if (mode !== "test" && mode !== "live") {
  throw new Error("RAZORPAY_MODE must be test or live.");
}
if (!keyId.startsWith(`rzp_${mode}_`)) {
  throw new Error("RAZORPAY_MODE does not match RAZORPAY_KEY_ID.");
}
if (keyId !== publicKeyId) {
  throw new Error("NEXT_PUBLIC_RAZORPAY_KEY_ID must equal RAZORPAY_KEY_ID.");
}

const currency = process.env.BILLING_CURRENCY || "INR";
const definitions = [
  ["RAZORPAY_PLUS_MONTHLY_PLAN_ID", "PLUS_MONTHLY_PRICE_PAISE", 9900, "monthly"],
  ["RAZORPAY_PLUS_ANNUAL_PLAN_ID", "PLUS_ANNUAL_PRICE_PAISE", 89900, "yearly"],
  ["RAZORPAY_PRO_MONTHLY_PLAN_ID", "PRO_MONTHLY_PRICE_PAISE", 24900, "monthly"],
  ["RAZORPAY_PRO_ANNUAL_PLAN_ID", "PRO_ANNUAL_PRICE_PAISE", 199900, "yearly"],
];
const ids = definitions.map(([planVariable]) => required(planVariable));
if (new Set(ids).size !== ids.length) throw new Error("Every sellable Razorpay plan ID must be unique.");

const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
for (const [planVariable, priceVariable, fallback, period] of definitions) {
  const providerPlan = await client.plans.fetch(required(planVariable));
  const expectedAmount = integer(priceVariable, fallback);
  const actualAmount = Number(providerPlan.item?.amount);
  if (
    actualAmount !== expectedAmount ||
    providerPlan.item?.currency?.toUpperCase() !== currency.toUpperCase() ||
    providerPlan.period !== period ||
    providerPlan.interval !== 1
  ) {
    throw new Error(`${planVariable} does not match ${priceVariable}, ${currency}, or its billing interval.`);
  }
  console.log(`Verified ${planVariable}.`);
}

console.log(`Razorpay ${mode} configuration is internally consistent.`);
