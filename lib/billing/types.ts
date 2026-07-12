export type PlanId = "free" | "plus" | "pro";
export type BillingInterval = "none" | "monthly" | "annual";

export type SubscriptionStatus =
  | "free"
  | "pending"
  | "active"
  | "past_due"
  | "grace_period"
  | "canceled"
  | "expired"
  | "refunded"
  | "chargeback";

export type EntitlementKey =
  | "core_rephrase"
  | "outcome_assistant"
  | "all_tones"
  | "channel_modes"
  | "voice_input"
  | "message_risk_check"
  | "protect_important_details"
  | "promise_lock"
  | "saved_presets"
  | "saved_personal_style"
  | "advanced_personalization"
  | "advanced_tone_controls"
  | "priority_generation"
  | "early_access"
  | "history_days";

export type PlanEntitlements = Record<EntitlementKey, boolean | number>;

export type PlanDefinition = {
  id: PlanId;
  publicName: string;
  description: string;
  monthlyPricePaise: number | null;
  annualPricePaise: number | null;
  dailyCredits: number | null;
  monthlyCredits: number | null;
  maxInputCharacters: number;
  entitlements: PlanEntitlements;
};

export type CreditOperation =
  | "rephrase"
  | "outcome_assistant"
  | "regenerate_all"
  | "extra_variant"
  | "tone_explanation"
  | "edited_message_check"
  | "voice_transcription";

export type CreditEstimate = {
  operation: CreditOperation;
  billableCharacters: number;
  inputLengthBucket: "empty" | "1-500" | "501-1200" | "1201-2500" | "2501-5000" | "over-5000";
  creditCost: number;
};

export type CreditBalance = {
  plan: PlanId;
  billingInterval: BillingInterval;
  subscriptionStatus: SubscriptionStatus;
  available: number;
  reserved: number;
  allowance: number;
  nextRefreshAt: string | null;
  periodKey: string | null;
};
