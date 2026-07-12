import type {
  RewriteTemplate,
  ThreadMessage,
  ThreadSummary,
  Tone,
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
    const error = new Error(data?.message || "Request failed.");
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
      expiresInSeconds: 600,
    },
  });
}

export function pricingUrl() {
  return `${apiBaseUrl}/pricing`;
}
