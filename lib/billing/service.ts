import crypto from "crypto";
import { getCreditBalance, ensureCurrentCreditGrant } from "@/lib/billing/account";
import { estimateCreditCost } from "@/lib/billing/credits";
import { getBillingFlags } from "@/lib/billing/flags";
import { getPlanDefinition } from "@/lib/billing/catalog";
import type {
  CreditBalance,
  CreditEstimate,
  CreditOperation,
  PlanId,
} from "@/lib/billing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { trackBillingEvent } from "@/lib/billing/analytics";

export class BillingOperationError extends Error {
  constructor(
    public readonly code:
      | "IDEMPOTENCY_KEY_REQUIRED"
      | "IDEMPOTENCY_KEY_REUSED"
      | "CREDIT_REQUEST_IN_PROGRESS"
      | "INSUFFICIENT_CREDITS"
      | "INPUT_LIMIT_EXCEEDED"
      | "CREDIT_RESERVATION_FAILED",
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "BillingOperationError";
  }
}

export type CreditOperationContext = {
  mode: "legacy" | "shadow" | "enforced";
  userId: string;
  requestId: string;
  estimate: CreditEstimate;
  plan: PlanId;
  reservationId: string | null;
  balance: CreditBalance | null;
};

function requestHash(userId: string, operation: CreditOperation, text: string) {
  return crypto
    .createHash("sha256")
    .update(`${userId}\u0000${operation}\u0000${text.replace(/\r\n?/g, "\n").trim()}`)
    .digest("hex");
}

function reservationError(
  error: { message?: string },
  balance: CreditBalance,
  requiredCredits: number,
) {
  const message = error.message ?? "";
  if (message.includes("INSUFFICIENT_CREDITS")) {
    trackBillingEvent("credits_insufficient", {
      currentPlan: balance.plan,
      operationType: "generation",
      remainingCreditBucket: balance.available === 0 ? "0" : "low",
      creditCostBucket: String(requiredCredits),
    });
    return new BillingOperationError(
      "INSUFFICIENT_CREDITS",
      `This message needs more credits than you currently have.`,
      {
        availableCredits: balance.available,
        requiredCredits,
        nextRefreshAt: balance.nextRefreshAt,
        currentPlan: balance.plan,
        recommendedPlan: balance.plan === "free" ? "plus" : "pro",
      },
    );
  }
  if (message.includes("IDEMPOTENCY_KEY_REUSED")) {
    return new BillingOperationError(
      "IDEMPOTENCY_KEY_REUSED",
      "This request key was already used for a different action.",
    );
  }
  return new BillingOperationError(
    "CREDIT_RESERVATION_FAILED",
    "Credits could not be reserved. Please try again.",
  );
}

export async function prepareCreditOperation({
  userId,
  operation,
  text,
  idempotencyKey,
  feature = operation,
  modelTier = "standard",
}: {
  userId: string;
  operation: CreditOperation;
  text: string;
  idempotencyKey: string | null;
  feature?: string;
  modelTier?: string;
}): Promise<CreditOperationContext> {
  const flags = getBillingFlags();
  const estimate = estimateCreditCost(operation, text);
  const requestId = crypto.randomUUID();
  if (!flags.creditBillingEnabled) {
    return {
      mode: "legacy",
      userId,
      requestId,
      estimate,
      plan: "free",
      reservationId: null,
      balance: null,
    };
  }

  const { account } = await ensureCurrentCreditGrant(userId);
  const plan = getPlanDefinition(account.plan);
  if (!flags.creditBillingShadowMode && estimate.billableCharacters > plan.maxInputCharacters) {
    const requiredPlan = estimate.billableCharacters <= 2500 ? "plus" : "pro";
    throw new BillingOperationError(
      "INPUT_LIMIT_EXCEEDED",
      `${plan.publicName} supports messages up to ${plan.maxInputCharacters.toLocaleString("en-IN")} characters. This message contains ${estimate.billableCharacters.toLocaleString("en-IN")} characters.`,
      {
        currentPlan: account.plan,
        requiredPlan,
        maxInputCharacters: plan.maxInputCharacters,
        billableCharacters: estimate.billableCharacters,
        estimatedCredits: estimate.creditCost,
      },
    );
  }

  const balance = await getCreditBalance(userId);
  const supabase = createSupabaseAdminClient();
  if (flags.creditBillingShadowMode) {
    await supabase.from("credit_shadow_estimates").upsert({
      user_id: userId,
      request_id: requestId,
      operation_type: operation,
      credit_cost: estimate.creditCost,
      billable_characters: estimate.billableCharacters,
      input_length_bucket: estimate.inputLengthBucket,
    }, { onConflict: "user_id,request_id", ignoreDuplicates: true });
    return {
      mode: "shadow",
      userId,
      requestId,
      estimate,
      plan: account.plan,
      reservationId: null,
      balance,
    };
  }

  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 120) {
    throw new BillingOperationError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid idempotency key is required for generation.",
    );
  }
  const { data, error } = await supabase.rpc("reserve_credits", {
    p_user_id: userId,
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash(userId, operation, text),
    p_operation_type: operation,
    p_credit_cost: estimate.creditCost,
    p_billable_characters: estimate.billableCharacters,
    p_input_length_bucket: estimate.inputLengthBucket,
    p_feature: feature,
    p_model_tier: modelTier,
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw reservationError(error, balance, estimate.creditCost);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new BillingOperationError(
    "CREDIT_RESERVATION_FAILED",
    "Credits could not be reserved. Please try again.",
  );
  if (row.duplicate && row.reservation_status === "reserved") {
    throw new BillingOperationError(
      "CREDIT_REQUEST_IN_PROGRESS",
      "This request is already processing.",
      { requestId },
    );
  }
  if (row.duplicate && row.reservation_status === "committed") {
    throw new BillingOperationError(
      "CREDIT_REQUEST_IN_PROGRESS",
      "This request was already completed. Refresh to see the result.",
      { requestId },
    );
  }
  trackBillingEvent("credit_reservation_created", {
    currentPlan: account.plan,
    operationType: operation,
    inputLengthBucket: estimate.inputLengthBucket,
    creditCostBucket: String(estimate.creditCost),
  });
  return {
    mode: "enforced",
    userId,
    requestId,
    estimate,
    plan: account.plan,
    reservationId: String(row.reservation_id),
    balance: {
      ...balance,
      available: Number(row.available_balance),
      reserved: Number(row.reserved_balance),
    },
  };
}

export async function commitCreditOperation(context: CreditOperationContext | null) {
  if (!context) return null;
  if (context.mode !== "enforced" || !context.reservationId) {
    return context.balance
      ? { charged: 0, remaining: context.balance.available, nextRefreshAt: context.balance.nextRefreshAt }
      : null;
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("commit_credit_reservation", {
    p_user_id: context.userId,
    p_reservation_id: context.reservationId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  trackBillingEvent("credit_usage_committed", {
    currentPlan: context.plan,
    operationType: context.estimate.operation,
    inputLengthBucket: context.estimate.inputLengthBucket,
    creditCostBucket: String(context.estimate.creditCost),
  });
  return {
    charged: Number(row.charged),
    remaining: Number(row.available_balance),
    nextRefreshAt: context.balance?.nextRefreshAt ?? null,
  };
}

export async function releaseCreditOperation(
  userId: string,
  context: CreditOperationContext | null,
  reason: string,
) {
  if (!context || context.mode !== "enforced" || !context.reservationId) return;
  const supabase = createSupabaseAdminClient();
  await supabase.rpc("release_credit_reservation", {
    p_user_id: userId,
    p_reservation_id: context.reservationId,
    p_reason: reason,
  });
  trackBillingEvent("credit_reservation_released", {
    currentPlan: context.plan,
    operationType: context.estimate.operation,
    errorCategory: reason,
  });
}

export async function creditFailureSummary(
  userId: string,
  context: CreditOperationContext | null,
) {
  if (!context || context.mode === "legacy") return null;
  try {
    const balance = await getCreditBalance(userId);
    return { charged: 0, remaining: balance.available, nextRefreshAt: balance.nextRefreshAt };
  } catch {
    return context.balance
      ? { charged: 0, remaining: context.balance.available, nextRefreshAt: context.balance.nextRefreshAt }
      : null;
  }
}
