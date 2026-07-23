import type {
  RewriteTemplate,
  ThreadMessage,
  ThreadSummary,
  Tone,
  UserPreferences,
  PreferenceOptions,
  PreferenceState,
  RecipientType,
  IntentType,
  CommunicationChannel,
  OutcomeAssistantResponse,
  UniversalClipboardMetadata,
  UsageSummary,
  WorkspaceProfile,
} from "./types";
import { appConfig } from "./config";
import { Platform } from "react-native";

const apiBaseUrl = appConfig.apiBaseUrl;

type ApiError = {
  error?: string;
  message?: string;
  usage?: UsageSummary;
  upgrade?: {
    monthly: string;
    yearly: string;
  };
};

export type MobileBillingInterval = "monthly" | "annual";

export type MobileBillingPlan = {
  id: "free" | "plus" | "pro";
  publicName: string;
  description: string;
  monthlyPricePaise: number | null;
  annualPricePaise: number | null;
  dailyCredits: number | null;
  monthlyCredits: number | null;
  maxInputCharacters: number;
};

async function requestJson<T>({
  path,
  token,
  method = "GET",
  body,
  idempotencyKey,
}: {
  path: string;
  token?: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (caught) {
    const message = caught instanceof Error && caught.name === "AbortError"
      ? "The request took too long. Check your connection and try again."
      : "Unable to reach ProPhrase. Check your connection and try again.";
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }

  const data = (await response.json().catch(() => null)) as (T & ApiError) | null;

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Request failed.");
    Object.assign(error, { payload: data, status: response.status });
    throw error;
  }

  if (!data) throw new Error("ProPhrase returned an empty response. Please try again.");
  return data;
}

export async function loadWorkspace(token: string) {
  const data = await requestJson<{
    profile: WorkspaceProfile;
    usage: UsageSummary;
    creditBilling?: {
      enabled: boolean;
      shadowMode: boolean;
      planFeatureGatingEnabled: boolean;
      balance: UsageSummary["creditBalance"];
    };
    threads: ThreadSummary[];
    templates: RewriteTemplate[];
    user: {
      email: string;
      name: string;
    };
    preferences: PreferenceState;
    preferenceOptions: PreferenceOptions;
  }>({ path: "/api/workspace/bootstrap", token });
  return {
    ...data,
    usage: {
      ...data.usage,
      creditBalance: data.creditBilling?.enabled ? data.creditBilling.balance : null,
    },
    planFeatureGatingEnabled: Boolean(data.creditBilling?.planFeatureGatingEnabled),
  };
}

export async function loadBillingPlans() {
  return requestJson<{
    currency: string;
    plans: MobileBillingPlan[];
    checkoutEnabled: boolean;
    taxNote: string;
  }>({ path: "/api/billing/plans" });
}

export async function createBillingCheckout({
  token,
  plan,
  interval,
  idempotencyKey,
}: {
  token: string;
  plan: "plus" | "pro";
  interval: MobileBillingInterval;
  idempotencyKey: string;
}) {
  return requestJson<{
    subscriptionId: string;
    razorpayKeyId: string;
    amount: number;
    currency: string;
    plan: "plus" | "pro";
    interval: MobileBillingInterval;
    user?: { name?: string; email?: string };
  }>({
    path: "/api/billing/checkout",
    token,
    method: "POST",
    body: { plan, interval, idempotencyKey, returnTo: "/account/billing" },
  });
}

export async function verifyBillingPayment({
  token,
  payment,
}: {
  token: string;
  payment: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  };
}) {
  return requestJson<{
    ok: boolean;
    processing?: boolean;
    plan?: "plus" | "pro";
    interval?: MobileBillingInterval;
  }>({
    path: "/api/billing/verify-payment",
    token,
    method: "POST",
    body: payment,
  });
}

export async function updatePreferences({
  token,
  patch,
}: {
  token: string;
  patch: Partial<UserPreferences> & {
    rephrase?: Partial<UserPreferences["rephrase"]>;
    outcomeAssistant?: Partial<UserPreferences["outcomeAssistant"]>;
  };
}) {
  return requestJson<PreferenceState>({
    path: "/api/user/preferences",
    token,
    method: "PATCH",
    body: patch as Record<string, unknown>,
  });
}

export async function prepareOutcomeMessage({
  token,
  originalText,
  recipient,
  intent,
  channel,
}: {
  token: string;
  originalText: string;
  recipient: RecipientType;
  intent: IntentType;
  channel: CommunicationChannel;
}) {
  return requestJson<OutcomeAssistantResponse>({
    path: "/api/outcome-assistant",
    token,
    method: "POST",
    idempotencyKey: `mobile-outcome-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    body: {
      originalText,
      recipient,
      intent,
      channel,
      urgency: "none",
      lockedFacts: [],
      languageMode: "standard",
    },
  });
}

export async function rewriteMessage({
  token,
  text,
  tone,
  threadId,
  instruction,
}: {
  token: string;
  text: string;
  tone: Tone;
  threadId?: string | null;
  instruction?: string;
}) {
  return requestJson<{
    result: string;
    threadId: string;
    thread: ThreadSummary;
    userMessage: ThreadMessage;
    assistantMessage: ThreadMessage;
    usage: UsageSummary;
    credits?: { charged: number; remaining: number; nextRefreshAt: string | null };
  }>({
    path: "/api/rewrite",
    token,
    method: "POST",
    idempotencyKey: `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    body: {
      text,
      tone,
      ...(threadId ? { threadId } : {}),
      ...(instruction ? { instruction } : {}),
    },
  });
}

export async function loadThread(token: string, threadId: string) {
  return requestJson<{ thread: ThreadSummary; messages: ThreadMessage[] }>({
    path: `/api/threads/${threadId}`,
    token,
  });
}

export async function createUniversalCopy({
  token,
  deviceId,
  deviceLabel,
  text,
}: {
  token: string;
  deviceId: string;
  deviceLabel: string;
  text: string;
}) {
  return requestJson<{ item: UniversalClipboardMetadata }>({
    path: "/api/universal-clipboard",
    token,
    method: "POST",
    body: {
      deviceId,
      deviceLabel,
      text,
      expiresInSeconds: 300,
      platform: Platform.OS === "ios" ? "ios" : "android",
    },
  });
}

export async function loadUniversalCopy({
  token,
  deviceId,
}: {
  token: string;
  deviceId: string;
}) {
  return requestJson<{ item: UniversalClipboardMetadata | null; serverTime: string }>({
    path: `/api/universal-clipboard?deviceId=${encodeURIComponent(deviceId)}`,
    token,
  });
}

export async function claimUniversalCopy({
  token,
  deviceId,
  deviceLabel,
  clipId,
}: {
  token: string;
  deviceId: string;
  deviceLabel: string;
  clipId: string;
}) {
  return requestJson<{ item: UniversalClipboardMetadata; text: string }>({
    path: `/api/universal-clipboard/${encodeURIComponent(clipId)}/claim`,
    token,
    method: "POST",
    body: {
      deviceId,
      deviceLabel,
      platform: Platform.OS === "ios" ? "ios" : "android",
    },
  });
}
