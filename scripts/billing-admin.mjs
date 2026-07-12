import { createClient } from "@supabase/supabase-js";

const [command, userId, ...rest] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase service environment is required.");
if (!command || (command !== "reconcile-all" && !userId)) {
  throw new Error("Usage: billing-admin <inspect|reconcile|reconcile-all|grant|remove> [user-id] [...args]");
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

if (command === "reconcile-all") {
  const apply = [userId, ...rest].includes("--apply");
  const { data: wallets, error: walletError } = await supabase
    .from("credit_wallets")
    .select("user_id")
    .order("user_id")
    .limit(1000);
  if (walletError) throw walletError;
  const reports = [];
  for (const wallet of wallets ?? []) {
    const { data, error } = await supabase.rpc("reconcile_credit_wallet", {
      p_user_id: wallet.user_id,
      p_apply: apply,
    });
    if (error) reports.push({ userId: wallet.user_id, error: error.message });
    else if (data?.mismatch || apply) reports.push({ userId: wallet.user_id, report: data });
  }
  console.log(JSON.stringify({ apply, scanned: wallets?.length ?? 0, reports }, null, 2));
} else if (command === "inspect") {
  const [profile, subscriptions, wallet, buckets, usage] = await Promise.all([
    supabase.from("profiles").select("id, plan, subscription_status, billing_interval, current_period_end").eq("id", userId).single(),
    supabase.from("subscriptions").select("plan_id, billing_interval, internal_status, current_period_end, cancel_at_period_end").eq("user_id", userId).order("updated_at", { ascending: false }).limit(5),
    supabase.from("credit_wallets").select("cached_available_balance, cached_reserved_balance, version").eq("user_id", userId).maybeSingle(),
    supabase.from("credit_buckets").select("source_type, original_amount, remaining_amount, expires_at, grant_period_key").eq("user_id", userId).order("expires_at"),
    supabase.from("credit_usage").select("operation_type, credit_cost, billable_characters, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(25),
  ]);
  console.log(JSON.stringify({ profile: profile.data, subscriptions: subscriptions.data, wallet: wallet.data, buckets: buckets.data, usage: usage.data }, null, 2));
} else if (command === "reconcile") {
  const apply = rest.includes("--apply");
  const { data, error } = await supabase.rpc("reconcile_credit_wallet", { p_user_id: userId, p_apply: apply });
  if (error) throw error;
  console.log(JSON.stringify({ apply, report: data }, null, 2));
} else if (command === "grant" || command === "remove") {
  const [amountText, actorId, reasonCode, supportReference, ...reasonParts] = rest;
  const amount = Number(amountText) * (command === "remove" ? -1 : 1);
  const reasonText = reasonParts.join(" ");
  if (!Number.isSafeInteger(amount) || !actorId || !reasonCode || reasonText.length < 3) {
    throw new Error("Adjustment usage: <grant|remove> <user-id> <amount> <actor-id> <reason-code> <support-ref> <reason text>");
  }
  const { data, error } = await supabase.rpc("admin_adjust_credits", {
    p_user_id: userId, p_amount: amount, p_reason_code: reasonCode,
    p_reason_text: reasonText, p_created_by: actorId,
    p_support_reference: supportReference === "-" ? null : supportReference,
  });
  if (error) throw error;
  console.log(JSON.stringify({ availableBalance: data }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}
