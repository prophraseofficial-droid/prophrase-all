import { NextResponse } from "next/server";
import { requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";
import { getProfileAndUsageSummary } from "@/lib/usage/usage";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    const { profile, usage } = await getProfileAndUsageSummary(user.id);

    return NextResponse.json({
      profile: {
        plan: profile.plan,
        subscriptionStatus: profile.subscription_status,
        currentPeriodEnd: profile.current_period_end,
      },
      usage,
    });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load usage.", 500);
  }
}
