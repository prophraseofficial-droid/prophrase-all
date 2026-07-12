export function isPreferencesEnabled() {
  return process.env.NEXT_PUBLIC_PREFERENCES_ENABLED !== "false";
}
