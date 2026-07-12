import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingFlags } from "@/lib/billing/flags";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  free_daily_grant: "Daily credit refresh",
  plus_monthly_grant: "Plus monthly credits",
  pro_monthly_grant: "Pro monthly credits",
  rephrase: "Rephrase",
  outcome_assistant: "Outcome Assistant",
  extra_variant: "Extra version",
  tone_explanation: "Message explanation",
  edited_message_check: "Edited-message check",
  upgrade_adjustment: "Upgrade credit adjustment",
  promotion: "Promotional credits",
  admin_adjustment: "Support adjustment",
};

export default async function BillingUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/billing/usage");
  if (!getBillingFlags().creditUsageHistoryEnabled) redirect("/account/billing");

  const rawPage = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const supabase = createSupabaseAdminClient();
  const [usage, buckets, adjustments] = await Promise.all([
    supabase.from("credit_usage")
      .select("operation_type, credit_cost, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1),
    page === 1
      ? supabase.from("credit_buckets")
        .select("source_type, original_amount, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
      : Promise.resolve({ data: [], error: null }),
    page === 1
      ? supabase.from("credit_adjustments")
        .select("reason_code, amount, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (usage.error || buckets.error || adjustments.error) {
    throw new Error("Unable to load credit activity.");
  }

  const rows = [
    ...(usage.data ?? []).map((row) => ({
      date: row.created_at,
      activity: row.operation_type,
      credits: -row.credit_cost,
    })),
    ...(buckets.data ?? []).map((row) => ({
      date: row.created_at,
      activity: row.source_type,
      credits: row.original_amount,
    })),
    ...(adjustments.data ?? []).map((row) => ({
      date: row.created_at,
      activity: row.reason_code,
      credits: row.amount,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const hasMore = (usage.count ?? 0) > from + pageSize;

  return (
    <main className="min-h-screen bg-surface px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold underline" href="/account/billing">Back to billing</Link>
        <h1 className="mt-5 text-4xl font-bold">Credit activity</h1>
        <p className="mt-2 text-text-muted">Usage metadata only. Your messages are never stored in billing records.</p>
        <div className="mt-8 overflow-hidden rounded-lg border border-border-subtle bg-white">
          {rows.map((row, index) => (
            <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4 last:border-0" key={`${row.date}-${index}`}>
              <div>
                <p className="font-semibold">{labels[row.activity] ?? row.activity.replaceAll("_", " ")}</p>
                <p className="text-xs text-text-muted">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.date))}</p>
              </div>
              <span className="font-semibold">{row.credits > 0 ? "+" : ""}{row.credits}</span>
            </div>
          ))}
          {!rows.length ? <p className="p-8 text-center text-text-muted">No credit activity yet.</p> : null}
        </div>
        <nav aria-label="Credit activity pages" className="mt-6 flex items-center justify-between">
          {page > 1
            ? <Link className="rounded-full border border-border-subtle bg-white px-5 py-3 text-sm font-semibold" href={`/account/billing/usage?page=${page - 1}`}>Previous</Link>
            : <span />}
          <span className="text-sm text-text-muted">Page {page}</span>
          {hasMore
            ? <Link className="rounded-full border border-border-subtle bg-white px-5 py-3 text-sm font-semibold" href={`/account/billing/usage?page=${page + 1}`}>Next</Link>
            : <span />}
        </nav>
      </div>
    </main>
  );
}
