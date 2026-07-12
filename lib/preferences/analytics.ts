type PreferenceEventMetadata = {
  modeId?: string;
  selectedCount?: number;
  recipientCategory?: string;
  intentCategory?: string;
  source?: "onboarding" | "settings" | "workspace" | "more_menu";
};

export function trackPreferenceEvent(
  _eventName: string,
  metadata: PreferenceEventMetadata = {},
) {
  return {
    modeId: metadata.modeId,
    selectedCount: metadata.selectedCount,
    recipientCategory: metadata.recipientCategory,
    intentCategory: metadata.intentCategory,
    source: metadata.source,
  };
}
