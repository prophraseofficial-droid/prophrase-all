import type {
  CreditsResponse,
  UniversalClipboardClaimResponse,
  UniversalClipboardResponse,
} from "./types";

export const APP_URL = (import.meta.env.VITE_PROPHRASE_APP_URL || "https://prophrase.in")
  .replace(/\/$/, "");

type ApiErrorBody = {
  message?: string;
  error?: string;
  code?: string;
};

export class ProPhraseApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ProPhraseApiError";
    this.status = status;
    this.code = code;
  }
}

export function isAuthenticationError(error: unknown) {
  return error instanceof ProPhraseApiError && error.status === 401;
}

async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ProPhraseApiError(
      body.message || body.error || "ProPhrase could not complete this request.",
      response.status,
      body.code,
    );
  }
  return body;
}

export function rephrase(token: string, text: string, tone: string) {
  return apiRequest<{ result: string }>("/api/v1/rephrase", token, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ text, tone }),
  });
}

export function loadCredits(token: string) {
  return apiRequest<CreditsResponse>("/api/v1/credits", token);
}

export function loadUniversalCopy(token: string, deviceId: string) {
  return apiRequest<UniversalClipboardResponse>(
    `/api/universal-clipboard?deviceId=${encodeURIComponent(deviceId)}`,
    token,
  );
}

export function createUniversalCopy(
  token: string,
  payload: { deviceId: string; deviceLabel: string; text: string },
) {
  return apiRequest<UniversalClipboardResponse>("/api/universal-clipboard", token, {
    method: "POST",
    body: JSON.stringify({ ...payload, expiresInSeconds: 300, platform: "extension" }),
  });
}

export function claimUniversalCopy(
  token: string,
  clipId: string,
  payload: { deviceId: string; deviceLabel: string },
) {
  return apiRequest<UniversalClipboardClaimResponse>(
    `/api/universal-clipboard/${encodeURIComponent(clipId)}/claim`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ ...payload, platform: "extension" }),
    },
  );
}

export async function revokeToken(token: string) {
  await apiRequest<void>("/api/extension/token", token, { method: "DELETE" });
}
