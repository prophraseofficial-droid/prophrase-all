export type Tone =
  | "Professional"
  | "Polite"
  | "Shorter"
  | "Short & Crisp"
  | "Human"
  | "Email"
  | "Slack"
  | "Teams"
  | "Jira Comment"
  | "WhatsApp"
  | "Client-safe"
  | "Manager-friendly"
  | "Firmer";

export type QuickStyleId =
  | "professional" | "polite" | "shorter" | "short_crisp" | "human"
  | "email" | "slack" | "teams" | "jira_comment" | "whatsapp"
  | "client_safe" | "manager_friendly" | "firmer";

export type RecipientType =
  | "manager" | "senior_leader" | "client" | "customer" | "colleague"
  | "direct_report" | "recruiter" | "vendor" | "friend" | "family" | "other";

export type IntentType =
  | "request" | "follow_up" | "approval" | "status_update" | "escalation"
  | "disagreement" | "rejection" | "boundary" | "payment_request" | "apology"
  | "clarification" | "negotiation" | "extension_request" | "feedback"
  | "criticism_response" | "other";

export type CommunicationChannel = "whatsapp" | "email" | "slack_teams" | "sms" | "linkedin" | "other";
export type OutcomeVersionId = "safe" | "balanced" | "firm";

export type UserPreferences = {
  preferencesVersion: 1;
  onboardingCompleted: boolean;
  existingNoticeDismissed: boolean;
  rephrase: { quickStyles: QuickStyleId[]; defaultStyle: QuickStyleId };
  outcomeAssistant: {
    favoriteRecipients: RecipientType[];
    favoriteIntents: IntentType[];
    defaultChannel: CommunicationChannel | "auto";
    defaultVariant: OutcomeVersionId;
  };
};

export type PreferenceOptions = {
  quickStyles: Array<{ id: QuickStyleId; tone: Tone; label: string; description: string; group: "tone" | "length" | "channel" | "audience" }>;
  quickStyleGroups: Array<{ id: "tone" | "length" | "channel" | "audience"; label: string }>;
  recipients: Array<{ id: RecipientType; label: string }>;
  intents: Array<{ id: IntentType; label: string }>;
  channels: Array<{ id: CommunicationChannel; label: string }>;
};

export type PreferenceState = {
  preferences: UserPreferences;
  available: boolean;
  onboardingRequired: boolean;
  existingNoticeRequired: boolean;
};

export type OutcomeAssistantResponse = {
  understoodIntent: string;
  variants: Array<{
    id: OutcomeVersionId;
    label: string;
    explanation: string;
    message: string;
    readerInterpretation: string;
  }>;
};

export type WorkspaceProfile = {
  plan: "free" | "plus" | "pro" | "pro_monthly" | "pro_yearly";
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
};

export type UsageSummary = {
  plan: "free" | "plus" | "pro" | "pro_monthly" | "pro_yearly";
  isPro: boolean;
  rewriteCount: number;
  rewriteLimit: number;
  threadCount: number;
  threadLimit: number;
  rewriteRemaining: number;
  threadRemaining: number;
  creditBalance?: {
    plan: "free" | "plus" | "pro";
    available: number;
    allowance: number;
    nextRefreshAt: string | null;
  } | null;
};

export type ThreadSummary = {
  id: string;
  title: string;
  tone?: Tone | null;
  is_favorite?: boolean | null;
  updated_at?: string | null;
};

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: Tone | null;
  created_at?: string | null;
};

export type RewriteTemplate = {
  id: string;
  title: string;
  category: string;
  tone: Tone;
  body: string;
};

export type UniversalClipboardMetadata = {
  id: string;
  sourceDeviceId: string;
  sourceDeviceLabel: string;
  preview: string;
  status: "available" | "claimed" | "expired";
  claimedByDeviceId: string | null;
  claimedByDeviceLabel: string | null;
  claimedAt: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
};

export type AppSession = {
  accessToken: string;
  email: string;
  name: string;
  userId: string;
};

export type ViewName =
  | "splash"
  | "onboarding-value"
  | "onboarding-tone"
  | "onboarding-start"
  | "quick-styles"
  | "home"
  | "outcome"
  | "history"
  | "templates"
  | "settings";
