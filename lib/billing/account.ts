import { addEntitlementMonth, freeCreditPeriod } from "@/lib/billing/dates";
import { getPlanDefinition } from "@/lib/billing/catalog";
import type {
  BillingInterval,
  CreditBalance,
  PlanId,
  SubscriptionStatus,
} from "@/lib/billing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ProfileBillingRow = {
  plan?: string | null;
  subscription_status?: string | null;
  billing_interval?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
};

type SubscriptionBillingRow = {
  id: string;
  plan_id: PlanId;
  billing_interval: BillingInterval;
  internal_status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  entitlement_cycle_start: string | null;
  entitlement_cycle_end: string | null;
  cancel_at_period_end: boolean;
};

function internalPlan(value?: string | null): PlanId {
  if (value === "plus" || value === "pro") return value;
  if (value === "pro_monthly" || value === "pro_yearly") return "plus";
  return "free";
}

function internalInterval(
  value?: string | null,
  legacyPlan?: string | null,
): BillingInterval {
  if (value === "monthly" || value === "annual") return value;
  if (legacyPlan === "pro_yearly") return "annual";
  if (legacyPlan === "pro_monthly") return "monthly";
  return "none";
}

function internalStatus(value?: string | null): SubscriptionStatus {
  if (value === "cancelled") return "canceled";
  if (
    value === "free" || value === "pending" || value === "active" ||
    value === "past_due" || value === "grace_period" || value === "canceled" ||
    value === "expired" || value === "refunded" || value === "chargeback"
  ) return value;
  return "free";
}

export async function getBillingAccount(userId: string) {
  const supabase = createSupabaseAdminClient();
  const [profileResult, subscriptionResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, subscription_status, billing_interval, current_period_start, current_period_end")
      .eq("id", userId)
      .single(),
    supabase
      .from("subscriptions")
      .select("id, plan_id, billing_interval, internal_status, current_period_start, current_period_end, entitlement_cycle_start, entitlement_cycle_end, cancel_at_period_end")
      .eq("user_id", userId)
      .in("internal_status", ["active", "grace_period", "past_due", "canceled"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profileResult.error || !profileResult.data) {
    throw profileResult.error ?? new Error("PROFILE_NOT_FOUND");
  }
  const profile = profileResult.data as ProfileBillingRow;
  const subscription = subscriptionResult.data as SubscriptionBillingRow | null;
  const paidPeriodElapsed = Boolean(
    subscription?.current_period_end &&
      new Date(subscription.current_period_end).getTime() <= Date.now(),
  );
  const paidActive = Boolean(
    subscription &&
      ["active", "grace_period", "past_due", "canceled"].includes(
        subscription.internal_status,
      ) &&
      (!subscription.current_period_end ||
        new Date(subscription.current_period_end).getTime() > Date.now()),
  );

  return {
    plan: paidActive
      ? subscription!.plan_id
      : paidPeriodElapsed
        ? "free" as const
        : internalPlan(profile.plan),
    billingInterval: paidActive
      ? subscription!.billing_interval
      : paidPeriodElapsed
        ? "none" as const
      : internalInterval(profile.billing_interval, profile.plan),
    subscriptionStatus: paidActive
      ? subscription!.internal_status
      : paidPeriodElapsed
        ? "expired" as const
      : internalStatus(profile.subscription_status),
    currentPeriodStart:
      subscription?.current_period_start ?? profile.current_period_start ?? null,
    currentPeriodEnd:
      subscription?.current_period_end ?? profile.current_period_end ?? null,
    entitlementCycleStart: subscription?.entitlement_cycle_start ?? null,
    entitlementCycleEnd: subscription?.entitlement_cycle_end ?? null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    subscriptionId: subscription?.id ?? null,
  };
}

function paidCycle(
  account: Awaited<ReturnType<typeof getBillingAccount>>,
  now = new Date(),
) {
  if (account.entitlementCycleStart && account.entitlementCycleEnd) {
    const start = new Date(account.entitlementCycleStart);
    const end = new Date(account.entitlementCycleEnd);
    if (start <= now && end > now) return { start, end };
  }
  const anchor = new Date(account.currentPeriodStart ?? now.toISOString());
  if (account.billingInterval === "monthly") {
    return {
      start: anchor,
      end: new Date(account.currentPeriodEnd ?? addEntitlementMonth(anchor, 1)),
    };
  }
  let start = anchor;
  let end = addEntitlementMonth(anchor, 1);
  for (let index = 0; index < 12 && end <= now; index += 1) {
    start = end;
    end = addEntitlementMonth(anchor, index + 2);
  }
  const paidEnd = account.currentPeriodEnd
    ? new Date(account.currentPeriodEnd)
    : null;
  if (paidEnd && end > paidEnd) end = paidEnd;
  return { start, end };
}

export async function ensureCurrentCreditGrant(userId: string, now = new Date()) {
  const account = await getBillingAccount(userId);
  const plan = getPlanDefinition(account.plan);
  const supabase = createSupabaseAdminClient();

  if (account.plan === "free" || account.subscriptionStatus === "expired") {
    const period = freeCreditPeriod(now);
    const { error } = await supabase.rpc("grant_credit_bucket", {
      p_user_id: userId,
      p_source_type: "free_daily_grant",
      p_source_reference_id: null,
      p_amount: plan.dailyCredits,
      p_valid_from: period.validFrom,
      p_expires_at: period.expiresAt,
      p_plan_id: "free",
      p_grant_period_key: period.periodKey,
    });
    if (error) throw error;
    return { account: { ...account, plan: "free" as const }, period };
  }

  const cycle = paidCycle(account, now);
  const periodKey = `${account.plan}:${cycle.start.toISOString()}`;
  if (account.subscriptionStatus === "grace_period" || account.subscriptionStatus === "past_due") {
    const { error: walletError } = await supabase.rpc("ensure_credit_wallet", { p_user_id: userId });
    if (walletError) throw walletError;
    return {
      account,
      period: { periodKey, validFrom: cycle.start.toISOString(), expiresAt: cycle.end.toISOString() },
    };
  }
  const { data: existingPeriodBucket, error: existingPeriodError } = await supabase
    .from("credit_buckets")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", account.plan)
    .eq("grant_period_key", periodKey)
    .limit(1)
    .maybeSingle();
  if (existingPeriodError) throw existingPeriodError;
  if (existingPeriodBucket) {
    return {
      account,
      period: { periodKey, validFrom: cycle.start.toISOString(), expiresAt: cycle.end.toISOString() },
    };
  }
  const { error } = await supabase.rpc("grant_credit_bucket", {
    p_user_id: userId,
    p_source_type:
      account.plan === "plus" ? "plus_monthly_grant" : "pro_monthly_grant",
    p_source_reference_id: account.subscriptionId,
    p_amount: plan.monthlyCredits,
    p_valid_from: cycle.start.toISOString(),
    p_expires_at: cycle.end.toISOString(),
    p_plan_id: account.plan,
    p_grant_period_key: periodKey,
  });
  if (error) throw error;
  return {
    account,
    period: {
      periodKey,
      validFrom: cycle.start.toISOString(),
      expiresAt: cycle.end.toISOString(),
    },
  };
}

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const { account, period } = await ensureCurrentCreditGrant(userId);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("credit_wallets")
    .select("cached_available_balance, cached_reserved_balance")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw error ?? new Error("CREDIT_WALLET_NOT_FOUND");
  const plan = getPlanDefinition(account.plan);
  return {
    plan: account.plan,
    billingInterval: account.billingInterval,
    subscriptionStatus: account.subscriptionStatus,
    available: Number(data.cached_available_balance),
    reserved: Number(data.cached_reserved_balance),
    allowance: plan.dailyCredits ?? plan.monthlyCredits ?? 0,
    nextRefreshAt: period.expiresAt,
    periodKey: period.periodKey,
  };
}
