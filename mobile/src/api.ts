import type {
  RewriteTemplate,
  ThreadMessage,
  ThreadSummary,
  Tone,
  UniversalClipboardMetadata,
  UsageSummary,
} from "./types";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

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
}: {
  path: string;
  token: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
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
  return requestJson<{
    profile: {
      plan: "free" | "pro_monthly" | "pro_yearly";
      subscriptionStatus: string;
      currentPeriodEnd: string | null;
    };
    usage: UsageSummary;
    threads: ThreadSummary[];
    templates: RewriteTemplate[];
    user: {
      email: string;
      name: string;
    };
  }>({ path: "/api/workspace/bootstrap", token });
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
  }>({
    path: "/api/rewrite",
    token,
    method: "POST",
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

export async function startSubscription(token: string, plan: "pro_monthly" | "pro_yearly") {
  return requestJson<{
    subscriptionId: string;
    razorpayKeyId: string;
    amount: number;
    currency: string;
    plan: "pro_monthly" | "pro_yearly";
    user: {
      name: string;
      email: string;
    };
  }>({
    path: "/api/billing/create-subscription",
    token,
    method: "POST",
    body: { plan },
  });
}

export function pricingUrl() {
  return `${apiBaseUrl}/pricing`;
}
