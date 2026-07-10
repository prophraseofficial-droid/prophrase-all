import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile, UsageDaily } from "@/lib/db/types";
import {
  FREE_DAILY_REWRITE_LIMIT,
  FREE_DAILY_THREAD_LIMIT,
  FREE_MAX_FOLLOWUPS_PER_THREAD,
  PRO_DAILY_REWRITE_LIMIT,
  PRO_DAILY_THREAD_LIMIT,
  PRO_MAX_MESSAGES_PER_THREAD,
} from "@/lib/usage/limits";

const ensuredProfileIds = new Map<string, number>();
const PROFILE_ENSURE_TTL_MS = 5 * 60 * 1000;

export function getUsageDate() {
  return new Date().toISOString().slice(0, 10);
}

export function isProUser(profile: Pick<Profile, "plan" | "subscription_status">) {
  return (
    (profile.plan === "pro_monthly" || profile.plan === "pro_yearly") &&
    profile.subscription_status === "active"
  );
}

export function getPlanLimits(profile: Pick<Profile, "plan" | "subscription_status">) {
  const isPro = isProUser(profile);

  return {
    plan: isPro ? profile.plan : "free",
    rewriteLimit: isPro ? PRO_DAILY_REWRITE_LIMIT : FREE_DAILY_REWRITE_LIMIT,
    threadLimit: isPro ? PRO_DAILY_THREAD_LIMIT : FREE_DAILY_THREAD_LIMIT,
    maxMessagesPerThread: isPro
      ? PRO_MAX_MESSAGES_PER_THREAD
      : FREE_MAX_FOLLOWUPS_PER_THREAD + 1,
    isPro,
  };
}

export async function getUserPlan(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single<Profile>();

  if (error || !data) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  return data;
}

export async function ensureProfileForUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const lastEnsuredAt = ensuredProfileIds.get(user.id);
  const now = Date.now();
  if (lastEnsuredAt && now - lastEnsuredAt < PROFILE_ENSURE_TTL_MS) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;
  const avatarUrl =
    typeof user.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;

  await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: fullName,
      avatar_url: avatarUrl,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  ensuredProfileIds.set(user.id, now);
}

export async function getTodayUsage(userId: string) {
  const supabase = createSupabaseAdminClient();
  const usageDate = getUsageDate();

  const { data, error } = await supabase
    .from("usage_daily")
    .select("*")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .maybeSingle<UsageDaily>();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("usage_daily")
    .insert({ user_id: userId, usage_date: usageDate })
    .select("*")
    .single<UsageDaily>();

  if (insertError || !inserted) {
    throw insertError ?? new Error("USAGE_INSERT_FAILED");
  }

  return inserted;
}

export async function getUsageSummary(userId: string) {
  const [profile, usage] = await Promise.all([
    getUserPlan(userId),
    getTodayUsage(userId),
  ]);

  return buildUsageSummary(profile, usage);
}

export function buildUsageSummary(
  profile: Pick<Profile, "plan" | "subscription_status">,
  usage: Pick<UsageDaily, "rewrite_count" | "thread_count">,
) {
  const limits = getPlanLimits(profile);
  return {
    plan: limits.plan,
    isPro: limits.isPro,
    rewriteCount: usage.rewrite_count,
    rewriteLimit: limits.rewriteLimit,
    threadCount: usage.thread_count,
    threadLimit: limits.threadLimit,
    rewriteRemaining: Math.max(0, limits.rewriteLimit - usage.rewrite_count),
    threadRemaining: Math.max(0, limits.threadLimit - usage.thread_count),
  };
}

export async function getProfileAndUsageSummary(userId: string) {
  const [profile, dailyUsage] = await Promise.all([
    getUserPlan(userId),
    getTodayUsage(userId),
  ]);

  return {
    profile,
    usage: buildUsageSummary(profile, dailyUsage),
  };
}

export async function canCreateThread(userId: string) {
  const summary = await getUsageSummary(userId);
  return {
    allowed: summary.threadCount < summary.threadLimit,
    summary,
  };
}

export async function canRewrite(userId: string) {
  const summary = await getUsageSummary(userId);
  return {
    allowed: summary.rewriteCount < summary.rewriteLimit,
    summary,
  };
}

export async function canSendFollowup(threadId: string, userId: string) {
  const profile = await getUserPlan(userId);
  return canSendFollowupForProfile(threadId, userId, profile);
}

export async function canSendFollowupForProfile(
  threadId: string,
  userId: string,
  profile: Pick<Profile, "plan" | "subscription_status">,
) {
  const supabase = createSupabaseAdminClient();
  const limits = getPlanLimits(profile);

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .eq("role", "user");

  if (error) {
    throw error;
  }

  const userMessageCount = count ?? 0;
  return {
    allowed: userMessageCount < limits.maxMessagesPerThread,
    userMessageCount,
    maxMessagesPerThread: limits.maxMessagesPerThread,
    isPro: limits.isPro,
  };
}

export async function incrementThreadUsage(userId: string) {
  const supabase = createSupabaseAdminClient();
  const usage = await getTodayUsage(userId);

  const { data, error } = await supabase
    .from("usage_daily")
    .update({ thread_count: usage.thread_count + 1 })
    .eq("id", usage.id)
    .select("*")
    .single<UsageDaily>();

  if (error || !data) {
    throw error ?? new Error("THREAD_USAGE_INCREMENT_FAILED");
  }

  return data;
}

export async function incrementRewriteUsage(userId: string) {
  return incrementUsage(userId, { rewriteDelta: 1 });
}

export async function incrementUsage(
  userId: string,
  {
    rewriteDelta = 0,
    threadDelta = 0,
  }: {
    rewriteDelta?: number;
    threadDelta?: number;
  },
) {
  const supabase = createSupabaseAdminClient();
  const usage = await getTodayUsage(userId);

  const { data, error } = await supabase
    .from("usage_daily")
    .update({
      rewrite_count: usage.rewrite_count + rewriteDelta,
      thread_count: usage.thread_count + threadDelta,
    })
    .eq("id", usage.id)
    .select("*")
    .single<UsageDaily>();

  if (error || !data) {
    throw error ?? new Error("USAGE_INCREMENT_FAILED");
  }

  return data;
}
