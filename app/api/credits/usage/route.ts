import { NextResponse } from "next/server";
import { getBillingFlags } from "@/lib/billing/flags";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const flags = getBillingFlags();
  if (!flags.creditUsageHistoryEnabled) {
    return apiError("FEATURE_DISABLED", "Credit usage history is not enabled.", 404);
  }
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const supabase = createSupabaseAdminClient();
  const [usageResult, bucketResult, adjustmentResult] = await Promise.all([
    supabase.from("credit_usage")
      .select("operation_type, credit_cost, created_at", { count: "exact" })
      .eq("user_id", user.id).order("created_at", { ascending: false })
      .range(from, from + pageSize - 1),
    page === 1 ? supabase.from("credit_buckets")
      .select("source_type, original_amount, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
    page === 1 ? supabase.from("credit_adjustments")
      .select("amount, reason_code, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (usageResult.error || bucketResult.error || adjustmentResult.error) {
    return apiError("INTERNAL_ERROR", "Unable to load credit activity.", 500);
  }
  const activities = [
    ...(usageResult.data ?? []).map((row) => ({
      date: row.created_at, activity: row.operation_type, credits: -row.credit_cost,
    })),
    ...(bucketResult.data ?? []).map((row) => ({
      date: row.created_at, activity: row.source_type, credits: row.original_amount,
    })),
    ...(adjustmentResult.data ?? []).map((row) => ({
      date: row.created_at, activity: row.reason_code, credits: row.amount,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, pageSize);
  return NextResponse.json({ activities, page, hasMore: (usageResult.count ?? 0) > from + pageSize });
}
