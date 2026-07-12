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
};

export type ViewName =
  | "splash"
  | "onboarding-value"
  | "onboarding-tone"
  | "onboarding-start"
  | "home"
  | "history"
  | "templates"
  | "settings";
