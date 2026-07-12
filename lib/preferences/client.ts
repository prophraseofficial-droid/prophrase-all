import type { PreferencesPatch } from "./schema";
import type { PreferenceState } from "./service";

export async function fetchPreferences(token?: string) {
  const response = await fetch("/api/user/preferences", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const data = await response.json().catch(() => null) as PreferenceState & { message?: string };
  if (!response.ok || !data) throw new Error(data?.message || "Preferences are unavailable.");
  return data;
}

export async function patchPreferences(patch: PreferencesPatch, token?: string) {
  const response = await fetch("/api/user/preferences", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(patch),
  });
  const data = await response.json().catch(() => null) as PreferenceState & { message?: string };
  if (!response.ok || !data) throw new Error(data?.message || "Preferences could not be saved.");
  return data;
}
