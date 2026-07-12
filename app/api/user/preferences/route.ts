import { NextResponse } from "next/server";
import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { apiError } from "@/lib/security/validation";
import { preferenceErrorCode, preferencesPatchSchema } from "@/lib/preferences/schema";
import { getUserPreferenceState, updateUserPreferences } from "@/lib/preferences/service";
import { isPreferencesEnabled } from "@/lib/preferences/flags";

export async function GET(request: Request) {
  if (!isPreferencesEnabled()) return apiError("FEATURE_DISABLED", "Preferences are disabled.", 404);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    return NextResponse.json(await getUserPreferenceState(user, { tolerateUnavailable: true }));
  } catch {
    return apiError("PREFERENCES_UNAVAILABLE", "Preferences are temporarily unavailable.", 503);
  }
}

export async function PATCH(request: Request) {
  if (!isPreferencesEnabled()) return apiError("FEATURE_DISABLED", "Preferences are disabled.", 404);
  const trustError = requireTrustedMutation(request);
  if (trustError) return trustError;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const rateLimit = checkRateLimit(`preferences:${user.id}`, 20, 60_000);
  if (!rateLimit.allowed) return apiError("RATE_LIMITED", "Please wait before saving again.", 429);

  const parsed = preferencesPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      preferenceErrorCode(parsed.error),
      parsed.error.issues[0]?.message ?? "Invalid preferences.",
      400,
    );
  }
  try {
    return NextResponse.json(await updateUserPreferences(user, parsed.data));
  } catch {
    return apiError("PREFERENCES_UNAVAILABLE", "Preferences could not be saved. Please retry.", 503);
  }
}
