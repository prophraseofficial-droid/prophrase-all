import type { CreditsResponse, OutcomeResponse } from "./types";

export const APP_URL = (import.meta.env.VITE_PROPHRASE_APP_URL || "https://prophrase.in")
  .replace(/\/$/, "");

type ApiErrorBody = {
  message?: string;
  error?: string;
};

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
    throw new Error(body.message || body.error || "ProPhrase could not complete this request.");
  }
  return body;
}

export function rephrase(token: string, text: string, tone: string) {
  return apiRequest<{ result: string }>("/api/v1/rephrase", token, {
    method: "POST",
    body: JSON.stringify({ text, tone }),
  });
}

export function prepareOutcome(token: string, payload: Record<string, unknown>) {
  return apiRequest<OutcomeResponse>("/api/v1/outcome-assistant", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loadCredits(token: string) {
  return apiRequest<CreditsResponse>("/api/v1/credits", token);
}

export async function revokeToken(token: string) {
  await apiRequest<void>("/api/extension/token", token, { method: "DELETE" });
}
