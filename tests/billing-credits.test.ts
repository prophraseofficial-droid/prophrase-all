import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBaseCreditCost,
  calculateOperationCreditCost,
  countBillableCharacters,
  CreditCalculationError,
  normalizeForCreditCount,
} from "../lib/billing/credits.ts";
import { getPlanCatalog } from "../lib/billing/catalog.ts";
import { formatInrFromPaise } from "../lib/billing/format.ts";
import { addEntitlementMonth, freeCreditPeriod } from "../lib/billing/dates.ts";
import {
  allocateByEarliestExpiry,
  remainingAfterDuplicateGrantRepair,
} from "../lib/billing/ledger-model.ts";
import { resolvePaidCreditCycle } from "../lib/billing/dates.ts";
import { sanitizeBillingAnalyticsMetadata } from "../lib/billing/analytics.ts";
import crypto from "node:crypto";
import {
  stableWebhookEventId,
  verifyRazorpayWebhookSignature,
} from "../lib/billing/razorpay.ts";
import { subscriptionStatusForEvent } from "../lib/billing/provider-events.ts";

test("calculates exact credit boundaries", () => {
  const cases = [[1, 1], [500, 1], [501, 2], [1200, 2], [1201, 4], [2500, 4], [2501, 8], [5000, 8]] as const;
  for (const [length, cost] of cases) assert.equal(calculateBaseCreditCost("x".repeat(length)), cost);
  assert.throws(() => calculateBaseCreditCost(""), (error) => error instanceof CreditCalculationError && error.code === "EMPTY_INPUT");
  assert.throws(() => calculateBaseCreditCost("x".repeat(5001)), (error) => error instanceof CreditCalculationError && error.code === "INPUT_TOO_LONG");
});

test("normalizes whitespace and line endings only for counting", () => {
  assert.equal(normalizeForCreditCount("  Hello  "), "Hello");
  assert.equal(countBillableCharacters("  Hello  "), 5);
  assert.equal(countBillableCharacters("a\r\nb"), countBillableCharacters("a\nb"));
  assert.equal(countBillableCharacters("😀"), 1);
  assert.equal(countBillableCharacters("नमस्ते"), Array.from("नमस्ते").length);
  assert.equal(countBillableCharacters("Please kal update bhejo"), 23);
  assert.equal(countBillableCharacters("e\u0301"), 2);
  assert.throws(() => calculateBaseCreditCost(" \n\t "));
});

test("uses fixed operation costs without charging retries or variants", () => {
  assert.equal(calculateOperationCreditCost("outcome_assistant", "x".repeat(900)), 2);
  assert.equal(calculateOperationCreditCost("regenerate_all", "x".repeat(2000)), 4);
  assert.equal(calculateOperationCreditCost("extra_variant", "x".repeat(2000)), 1);
  assert.equal(calculateOperationCreditCost("tone_explanation", "hello"), 1);
  assert.equal(calculateOperationCreditCost("edited_message_check", "hello"), 1);
  assert.equal(calculateOperationCreditCost("voice_transcription", "hello"), 0);
});

test("catalog contains the fixed commercial model and configurable Free allowance", () => {
  const catalog = getPlanCatalog({});
  assert.equal(catalog.free.dailyCredits, 15);
  assert.equal(catalog.free.maxInputCharacters, 1200);
  assert.equal(catalog.plus.monthlyPricePaise, 9900);
  assert.equal(catalog.plus.annualPricePaise, 89900);
  assert.equal(catalog.plus.monthlyCredits, 300);
  assert.equal(catalog.pro.monthlyPricePaise, 24900);
  assert.equal(catalog.pro.annualPricePaise, 199900);
  assert.equal(catalog.pro.monthlyCredits, 1500);
  assert.equal(getPlanCatalog({ FREE_DAILY_CREDITS: "20" }).free.dailyCredits, 20);
  assert.throws(() => getPlanCatalog({ FREE_DAILY_CREDITS: "21" }));
  assert.match(formatInrFromPaise(199900), /1,999/);
});

test("catalog gates paid features without weakening safety features", () => {
  const catalog = getPlanCatalog({});
  assert.equal(catalog.free.entitlements.voice_input, false);
  assert.equal(catalog.plus.entitlements.voice_input, true);
  assert.equal(catalog.plus.entitlements.saved_presets, 3);
  assert.equal(catalog.plus.entitlements.history_days, 30);
  assert.equal(catalog.pro.entitlements.saved_presets, 20);
  assert.equal(catalog.pro.entitlements.history_days, 365);
  assert.equal(catalog.pro.entitlements.priority_generation, true);
  assert.equal(catalog.free.entitlements.outcome_assistant, true);
});

test("Free credit periods reset at midnight IST without rollover", () => {
  const before = freeCreditPeriod(new Date("2026-07-11T18:29:59.000Z"));
  const after = freeCreditPeriod(new Date("2026-07-11T18:30:01.000Z"));
  assert.equal(before.periodKey, "2026-07-11@Asia/Kolkata");
  assert.equal(after.periodKey, "2026-07-12@Asia/Kolkata");
  assert.equal(before.expiresAt, "2026-07-11T18:30:00.000Z");
});

test("monthly entitlement anchors handle month ends and leap years", () => {
  assert.equal(addEntitlementMonth(new Date("2026-01-31T10:00:00Z"), 1).toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(addEntitlementMonth(new Date("2024-01-31T10:00:00Z"), 1).toISOString(), "2024-02-29T10:00:00.000Z");
  assert.equal(addEntitlementMonth(new Date("2026-01-31T10:00:00Z"), 2).toISOString(), "2026-03-31T10:00:00.000Z");
  assert.equal(addEntitlementMonth(new Date("2026-08-31T10:00:00Z"), 1).toISOString(), "2026-09-30T10:00:00.000Z");
});

test("allocates from earliest expiry and oldest bucket", () => {
  const allocations = allocateByEarliestExpiry([
    { id: "later", remaining: 4, expiresAt: "2026-09-01", createdAt: "2026-07-01" },
    { id: "oldest", remaining: 2, expiresAt: "2026-08-01", createdAt: "2026-06-01" },
    { id: "newer", remaining: 3, expiresAt: "2026-08-01", createdAt: "2026-07-01" },
  ], 4);
  assert.deepEqual(allocations, [
    { bucketId: "oldest", amount: 2 },
    { bucketId: "newer", amount: 2 },
  ]);
  assert.throws(() => allocateByEarliestExpiry([], 1), /INSUFFICIENT_CREDITS/);
});

test("legacy paid accounts use one stable cycle throughout the month", () => {
  const account = {
    billingInterval: "annual" as const,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    entitlementCycleStart: null,
    entitlementCycleEnd: null,
  };
  const morning = resolvePaidCreditCycle(account, new Date("2026-07-12T05:00:00Z"));
  const evening = resolvePaidCreditCycle(account, new Date("2026-07-12T19:00:00Z"));

  assert.equal(morning.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(evening.start.toISOString(), morning.start.toISOString());
  assert.equal(evening.end.toISOString(), morning.end.toISOString());
});

test("duplicate paid grants preserve usage but never exceed one allowance", () => {
  assert.equal(
    remainingAfterDuplicateGrantRepair(
      Array.from({ length: 9 }, () => ({ original_amount: 300, remaining_amount: 300 })),
      300,
    ),
    300,
  );
  assert.equal(
    remainingAfterDuplicateGrantRepair(
      [
        { original_amount: 300, remaining_amount: 285 },
        { original_amount: 300, remaining_amount: 300 },
      ],
      300,
    ),
    285,
  );
});

test("billing analytics excludes message and identity content", () => {
  assert.deepEqual(sanitizeBillingAnalyticsMetadata({
    currentPlan: "free",
    operationType: "rephrase",
    inputLengthBucket: "1-500",
    message: "private workplace text",
    email: "person@example.test",
    lockedFacts: ["private"],
  }), {
    currentPlan: "free",
    operationType: "rephrase",
    inputLengthBucket: "1-500",
  });
});

test("maps provider lifecycle events without granting unknown events", () => {
  assert.equal(subscriptionStatusForEvent("subscription.activated"), "active");
  assert.equal(subscriptionStatusForEvent("subscription.charged"), "active");
  assert.equal(subscriptionStatusForEvent("payment.failed"), "grace_period");
  assert.equal(subscriptionStatusForEvent("subscription.cancelled"), "canceled");
  assert.equal(subscriptionStatusForEvent("payment.refunded"), "refunded");
  assert.equal(subscriptionStatusForEvent("payment.dispute.created"), "chargeback");
  assert.equal(subscriptionStatusForEvent("unrecognized.event"), null);
});

test("verifies Razorpay webhook signatures over the exact raw body", () => {
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  try {
    const rawBody = JSON.stringify({ event: "subscription.charged", value: "नमस्ते" });
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature }), true);
    assert.equal(verifyRazorpayWebhookSignature({ rawBody: `${rawBody} `, signature }), false);
    assert.equal(stableWebhookEventId(rawBody), stableWebhookEventId(rawBody));
    assert.notEqual(stableWebhookEventId(rawBody), stableWebhookEventId(`${rawBody} `));
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previous;
  }
});
