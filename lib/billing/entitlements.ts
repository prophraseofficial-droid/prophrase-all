import { getPlanDefinition } from "@/lib/billing/catalog";
import { getBillingAccount } from "@/lib/billing/account";
import type { EntitlementKey, PlanId } from "@/lib/billing/types";

export class PlanUpgradeRequiredError extends Error {
  readonly code = "PLAN_UPGRADE_REQUIRED";
  constructor(
    public readonly feature: EntitlementKey,
    public readonly requiredPlan: Exclude<PlanId, "free">,
    message: string,
  ) {
    super(message);
    this.name = "PlanUpgradeRequiredError";
  }
}

export async function hasEntitlement(userId: string, key: EntitlementKey) {
  const account = await getBillingAccount(userId);
  const value = getPlanDefinition(account.plan).entitlements[key];
  return typeof value === "number" ? value > 0 : value;
}

export async function requireEntitlement(
  userId: string,
  key: EntitlementKey,
  requiredPlan: Exclude<PlanId, "free"> = "plus",
) {
  if (await hasEntitlement(userId, key)) return;
  const label = key.replaceAll("_", " ");
  throw new PlanUpgradeRequiredError(
    key,
    requiredPlan,
    `${label[0]?.toUpperCase()}${label.slice(1)} is available on ${requiredPlan === "plus" ? "Plus and Pro" : "Pro"}.`,
  );
}

export async function historyCutoffForUser(userId: string) {
  const account = await getBillingAccount(userId);
  const value = getPlanDefinition(account.plan).entitlements.history_days;
  const days = typeof value === "number" ? value : 0;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
