import {
  channelOptions,
  intentLabels,
  intentOptions,
  recipientLabels,
  recipientOptions,
  type CommunicationChannel,
  type IntentType,
  type OutcomeVersionId,
  type RecipientType,
} from "../outcome-assistant/types.ts";
import type { Tone } from "../tones.ts";

export const quickStyleIds = [
  "professional",
  "polite",
  "shorter",
  "short_crisp",
  "human",
  "email",
  "slack",
  "teams",
  "jira_comment",
  "whatsapp",
  "client_safe",
  "manager_friendly",
  "firmer",
] as const;

export type QuickStyleId = (typeof quickStyleIds)[number];
export type QuickStyleGroup = "tone" | "length" | "channel" | "audience";
export type PreferenceChannel = CommunicationChannel | "auto";

export type QuickStyleDefinition = {
  id: QuickStyleId;
  tone: Tone;
  label: string;
  description: string;
  group: QuickStyleGroup;
};

export const quickStyleRegistry: readonly QuickStyleDefinition[] = [
  { id: "professional", tone: "Professional", label: "Professional", description: "Clear, confident and workplace-ready", group: "tone" },
  { id: "polite", tone: "Polite", label: "Polite", description: "Respectful without sounding weak", group: "tone" },
  { id: "human", tone: "Human", label: "Human", description: "Natural and conversational", group: "tone" },
  { id: "firmer", tone: "Firmer", label: "Firmer", description: "Direct and boundary-conscious", group: "tone" },
  { id: "shorter", tone: "Shorter", label: "Shorter", description: "Less repetition, same meaning", group: "length" },
  { id: "short_crisp", tone: "Short & Crisp", label: "Short & Crisp", description: "Main point first", group: "length" },
  { id: "email", tone: "Email", label: "Email", description: "Structured for email", group: "channel" },
  { id: "slack", tone: "Slack", label: "Slack", description: "Concise internal chat", group: "channel" },
  { id: "teams", tone: "Teams", label: "Teams", description: "Professional team chat", group: "channel" },
  { id: "jira_comment", tone: "Jira Comment", label: "Jira Comment", description: "Factual and traceable", group: "channel" },
  { id: "whatsapp", tone: "WhatsApp", label: "WhatsApp", description: "Short and mobile-friendly", group: "channel" },
  { id: "client_safe", tone: "Client-safe", label: "Client-safe", description: "Calm and external-facing", group: "audience" },
  { id: "manager_friendly", tone: "Manager-friendly", label: "Manager-friendly", description: "Impact and decision first", group: "audience" },
] as const;

export const quickStyleGroups: Array<{ id: QuickStyleGroup; label: string }> = [
  { id: "tone", label: "Tone" },
  { id: "length", label: "Length" },
  { id: "channel", label: "Channel" },
  { id: "audience", label: "Audience" },
];

export const quickStyleById = Object.fromEntries(
  quickStyleRegistry.map((style) => [style.id, style]),
) as Record<QuickStyleId, QuickStyleDefinition>;

export const quickStyleIdByTone = Object.fromEntries(
  quickStyleRegistry.map((style) => [style.tone, style.id]),
) as Record<Tone, QuickStyleId>;

export const defaultQuickStyles: QuickStyleId[] = [
  "professional",
  "polite",
  "shorter",
  "human",
  "firmer",
];

export const defaultFavoriteRecipients: RecipientType[] = [
  "manager",
  "client",
  "colleague",
];

export const defaultFavoriteIntents: IntentType[] = [
  "request",
  "follow_up",
  "approval",
  "status_update",
  "extension_request",
  "rejection",
];

export { channelOptions, intentLabels, intentOptions, recipientLabels, recipientOptions };

export type UserPreferences = {
  preferencesVersion: 1;
  onboardingCompleted: boolean;
  existingNoticeDismissed: boolean;
  rephrase: {
    quickStyles: QuickStyleId[];
    defaultStyle: QuickStyleId;
  };
  outcomeAssistant: {
    favoriteRecipients: RecipientType[];
    favoriteIntents: IntentType[];
    defaultChannel: PreferenceChannel;
    defaultVariant: OutcomeVersionId;
  };
};

export function recommendedPreferences(): UserPreferences {
  return {
    preferencesVersion: 1,
    onboardingCompleted: false,
    existingNoticeDismissed: false,
    rephrase: {
      quickStyles: [...defaultQuickStyles],
      defaultStyle: "professional",
    },
    outcomeAssistant: {
      favoriteRecipients: [...defaultFavoriteRecipients],
      favoriteIntents: [...defaultFavoriteIntents],
      defaultChannel: "auto",
      defaultVariant: "balanced",
    },
  };
}
