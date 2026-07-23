export type RewriteNotice = {
  title: string;
  message: string;
  hint: string;
};

type ApiLikeError = Error & {
  status?: number;
  payload?: {
    error?: string;
    message?: string;
  };
};

const planLimitCodes = new Set([
  "FREE_REWRITE_LIMIT_REACHED",
  "FREE_THREAD_LIMIT_REACHED",
  "FREE_FOLLOWUP_LIMIT_REACHED",
  "PRO_FAIR_USE_LIMIT_REACHED",
  "INSUFFICIENT_CREDITS",
  "PLAN_UPGRADE_REQUIRED",
]);

export function planLimitNotice(message: string): RewriteNotice {
  return {
    title: "Plan limit reached",
    message,
    hint: "Plan access is synced securely with your ProPhrase account.",
  };
}

export function classifyRewriteError(caught: unknown): RewriteNotice {
  const error = caught instanceof Error ? caught as ApiLikeError : null;
  const code = error?.payload?.error ?? "";
  const message = error?.payload?.message ?? error?.message ?? "Unable to rewrite message right now.";

  if (planLimitCodes.has(code)) return planLimitNotice(message);

  if (code === "INVALID_AI_OUTPUT" || error?.status === 422) {
    return {
      title: "Rewrite needs another try",
      message,
      hint: "This is a rewrite-quality safeguard, not a plan or credit limit.",
    };
  }

  if (code === "RATE_LIMITED" || error?.status === 429) {
    return {
      title: "Please wait a moment",
      message,
      hint: "Your text is unchanged. Try again shortly.",
    };
  }

  if (!error?.payload && /connection|reach|too long/i.test(message)) {
    return {
      title: "Connection problem",
      message,
      hint: "Your text is unchanged. Check your internet connection and try again.",
    };
  }

  return {
    title: "Rewrite unavailable",
    message,
    hint: "Your text is unchanged and no completed rewrite was charged.",
  };
}
