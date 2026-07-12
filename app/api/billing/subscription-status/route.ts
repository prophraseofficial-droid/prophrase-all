import { NextResponse } from "next/server";
import { requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";
import { getUserPlan } from "@/lib/usage/usage";
import { getBillingFlags } from "@/lib/billing/flags";
import { getBillingAccount, getCreditBalance } from "@/lib/billing/account";

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  try {
    if (getBillingFlags().creditBillingEnabled) {
      const [account, balance] = await Promise.all([
        getBillingAccount(user.id),
        getCreditBalance(user.id),
      ]);
      return NextResponse.json({ ...account, balance });
    }
    const profile = await getUserPlan(user.id);
    return NextResponse.json({
      plan: profile.plan,
      subscriptionStatus: profile.subscription_status,
      currentPeriodEnd: profile.current_period_end,
    });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load subscription status.", 500);
  }
}
