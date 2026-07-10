import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";
import { rewriteTemplates } from "@/lib/templates";
import { getProfileAndUsageSummary } from "@/lib/usage/usage";

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  try {
    const supabase = createSupabaseAdminClient();
    const [planData, threadsResult] = await Promise.all([
      getProfileAndUsageSummary(user.id),
      supabase
        .from("threads")
        .select("id, title, tone, is_favorite, updated_at")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    if (threadsResult.error) throw threadsResult.error;

    const metadata = user.user_metadata ?? {};
    const displayName =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : user.email?.split("@")[0] || "ProPhrase user";

    return NextResponse.json({
      profile: {
        plan: planData.profile.plan,
        subscriptionStatus: planData.profile.subscription_status,
        currentPeriodEnd: planData.profile.current_period_end,
      },
      usage: planData.usage,
      threads: threadsResult.data ?? [],
      templates: rewriteTemplates,
      user: {
        email: user.email ?? "",
        name: displayName,
      },
    });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load workspace.", 500);
  }
}
