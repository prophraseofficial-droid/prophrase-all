import { NextResponse } from "next/server";
import { requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";
import { getUserPlan } from "@/lib/usage/usage";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
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
