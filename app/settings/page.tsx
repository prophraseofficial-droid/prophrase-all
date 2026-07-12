import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/preferences/SettingsClient";
import { getUserPreferenceState } from "@/lib/preferences/service";
import { getCurrentUser } from "@/lib/supabase/server";
import { isPreferencesEnabled } from "@/lib/preferences/flags";

export default async function SettingsPage() {
  if (!isPreferencesEnabled()) redirect("/workspace");
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const state = await getUserPreferenceState(user, { tolerateUnavailable: true });
  return <SettingsClient initialPreferences={state.preferences} preferencesAvailable={state.available} />;
}
