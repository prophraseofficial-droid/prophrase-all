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
} from "./types";
import { appConfig } from "./config";

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

async function requestJson<T>({
  path,
  token,
  method = "GET",
  body,
  idempotencyKey,
}: {
  path: string;
  token: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as T & ApiError;

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Request failed.");
    Object.assign(error, { payload: data, status: response.status });
    throw error;
  }

  return data;
}

export async function loadWorkspace(token: string) {
  const data = await requestJson<{
    profile: {
      plan: "free" | "plus" | "pro" | "pro_monthly" | "pro_yearly";
      subscriptionStatus: string;
      currentPeriodEnd: string | null;
    };
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
    },
  });
}

export function pricingUrl() {
  return `${apiBaseUrl}/pricing`;
}
