import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mergePreferences, normalizePreferences, type PreferencesPatch } from "./schema";
import { recommendedPreferences, type UserPreferences } from "./registry";

type PreferenceRow = {
  preferences: unknown;
  onboarding_completed: boolean;
  existing_notice_dismissed: boolean;
};

export type PreferenceState = {
  preferences: UserPreferences;
  available: boolean;
  onboardingRequired: boolean;
  existingNoticeRequired: boolean;
};

function isMissingPreferencesTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || error?.message?.includes("user_preferences");
}

function onboardingCutoff() {
  const configured = process.env.QUICK_STYLES_ONBOARDING_CUTOFF;
  const parsed = configured ? new Date(configured) : new Date("2026-07-12T00:00:00.000Z");
  return Number.isNaN(parsed.getTime())
    ? new Date("2026-07-12T00:00:00.000Z")
    : parsed;
}

function stateFromPreferences(preferences: UserPreferences, available = true): PreferenceState {
  return {
    preferences,
    available,
    onboardingRequired: available && !preferences.onboardingCompleted,
    existingNoticeRequired: available
      && preferences.onboardingCompleted
      && !preferences.existingNoticeDismissed,
  };
}

function rowPreferences(row: PreferenceRow) {
  return normalizePreferences({
    ...(row.preferences && typeof row.preferences === "object" ? row.preferences : {}),
    onboardingCompleted: row.onboarding_completed,
    existingNoticeDismissed: row.existing_notice_dismissed,
  });
}

export async function getUserPreferenceState(
  user: User,
  options: { tolerateUnavailable?: boolean } = {},
): Promise<PreferenceState> {
  const supabase = createSupabaseAdminClient();
  const result = await supabase
    .from("user_preferences")
    .select("preferences, onboarding_completed, existing_notice_dismissed")
    .eq("user_id", user.id)
    .maybeSingle();

  if (result.error) {
    if (options.tolerateUnavailable && isMissingPreferencesTable(result.error)) {
      const defaults = recommendedPreferences();
      defaults.onboardingCompleted = true;
      defaults.existingNoticeDismissed = true;
      return stateFromPreferences(defaults, false);
    }
    throw result.error;
  }
  if (result.data) return stateFromPreferences(rowPreferences(result.data as PreferenceRow));

  const isNewUser = new Date(user.created_at) >= onboardingCutoff();
  const defaults = recommendedPreferences();
  defaults.onboardingCompleted = !isNewUser;
  defaults.existingNoticeDismissed = isNewUser;

  const insert = await supabase.from("user_preferences").upsert({
    user_id: user.id,
    preferences_version: 1,
    preferences: {
      rephrase: defaults.rephrase,
      outcomeAssistant: defaults.outcomeAssistant,
    },
    onboarding_completed: defaults.onboardingCompleted,
    existing_notice_dismissed: defaults.existingNoticeDismissed,
  }, { onConflict: "user_id", ignoreDuplicates: true });
  if (insert.error) throw insert.error;

  const persisted = await supabase
    .from("user_preferences")
    .select("preferences, onboarding_completed, existing_notice_dismissed")
    .eq("user_id", user.id)
    .single();
  if (persisted.error) throw persisted.error;
  return stateFromPreferences(rowPreferences(persisted.data as PreferenceRow));
}

export async function updateUserPreferences(user: User, patch: PreferencesPatch) {
  const currentState = await getUserPreferenceState(user);
  const updated = mergePreferences(currentState.preferences, patch);
  const supabase = createSupabaseAdminClient();
  const result = await supabase
    .from("user_preferences")
    .update({
      preferences_version: updated.preferencesVersion,
      preferences: {
        rephrase: updated.rephrase,
        outcomeAssistant: updated.outcomeAssistant,
      },
      onboarding_completed: updated.onboardingCompleted,
      existing_notice_dismissed: updated.existingNoticeDismissed,
    })
    .eq("user_id", user.id)
    .select("preferences, onboarding_completed, existing_notice_dismissed")
    .single();
  if (result.error) throw result.error;
  return stateFromPreferences(rowPreferences(result.data as PreferenceRow));
}
