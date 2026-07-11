export const recipientOptions = [
  "manager",
  "senior_leader",
  "client",
  "customer",
  "colleague",
  "direct_report",
  "recruiter",
  "vendor",
  "friend",
  "family",
  "other",
] as const;

export const intentOptions = [
  "request",
  "follow_up",
  "approval",
  "status_update",
  "escalation",
  "disagreement",
  "rejection",
  "boundary",
  "payment_request",
  "apology",
  "clarification",
  "negotiation",
  "extension_request",
  "feedback",
  "criticism_response",
  "other",
] as const;

export const relationshipOptions = [
  "new",
  "formal",
  "regular",
  "comfortable",
  "difficult",
] as const;

export const urgencyOptions = [
  "none",
  "today",
  "few_days",
  "urgent",
  "critical",
] as const;

export const channelOptions = [
  "whatsapp",
  "email",
  "slack_teams",
  "sms",
  "linkedin",
  "other",
] as const;

export const riskTypes = [
  "blaming",
  "aggressive",
  "passive_aggressive",
  "too_apologetic",
  "unclear_request",
  "missing_action",
  "unclear_deadline",
  "weak_ownership",
  "unintended_commitment",
  "changed_fact",
  "missing_context",
  "overly_formal",
  "robotic_language",
  "too_long",
  "emotionally_charged",
  "ambiguous_pronoun",
  "possible_misinterpretation",
] as const;

export const severityOptions = ["low", "medium", "high"] as const;
export const versionIds = ["safe", "balanced", "firm"] as const;

export type RecipientType = (typeof recipientOptions)[number];
export type IntentType = (typeof intentOptions)[number];
export type RelationshipLevel = (typeof relationshipOptions)[number];
export type UrgencyLevel = (typeof urgencyOptions)[number];
export type CommunicationChannel = (typeof channelOptions)[number];
export type RiskType = (typeof riskTypes)[number];
export type RiskSeverity = (typeof severityOptions)[number];
export type OutcomeVersionId = (typeof versionIds)[number];

export type OutcomeAssistantRequest = {
  originalText: string;
  recipient: RecipientType;
  customRecipient?: string;
  intent: IntentType;
  customIntent?: string;
  relationshipLevel?: RelationshipLevel;
  urgency?: UrgencyLevel;
  desiredResponse?: string;
  channel?: CommunicationChannel;
  lockedFacts: string[];
  languageMode?: "standard" | "indian_workplace";
};

export type MessageRisk = {
  type: RiskType;
  severity: RiskSeverity;
  explanation: string;
  evidence: string;
  suggestion?: string;
};

export type FactVerification = {
  value: string;
  status: "preserved" | "missing" | "changed";
};

export type CommitmentWarning = {
  type: "new_commitment" | "new_deadline" | "new_guarantee" | "new_ownership";
  severity: RiskSeverity;
  explanation: string;
  evidence: string;
};

export type OutcomeVersion = {
  id: OutcomeVersionId;
  label: string;
  explanation: string;
  message: string;
  readerInterpretation: string;
  risks: MessageRisk[];
  factVerification: FactVerification[];
  commitmentWarnings: CommitmentWarning[];
};

export type OutcomeAssistantResponse = {
  detectedLanguage?: string;
  understoodIntent: string;
  variants: OutcomeVersion[];
  globalWarnings: string[];
  missingInformation?: string[];
};

export const recipientLabels: Record<RecipientType, string> = {
  manager: "Manager",
  senior_leader: "Senior leader",
  client: "Client",
  customer: "Customer",
  colleague: "Colleague",
  direct_report: "Direct report",
  recruiter: "Recruiter",
  vendor: "Vendor",
  friend: "Friend",
  family: "Family member",
  other: "Other",
};

export const intentLabels: Record<IntentType, string> = {
  request: "Request something",
  follow_up: "Follow up",
  approval: "Ask for approval",
  status_update: "Give an update",
  escalation: "Escalate a problem",
  disagreement: "Disagree respectfully",
  rejection: "Say no",
  boundary: "Set a boundary",
  payment_request: "Request payment",
  apology: "Apologize",
  clarification: "Correct a misunderstanding",
  negotiation: "Negotiate",
  extension_request: "Ask for more time",
  feedback: "Give feedback",
  criticism_response: "Respond to criticism",
  other: "Other",
};

export const relationshipLabels: Record<RelationshipLevel, string> = {
  new: "New relationship",
  formal: "Formal relationship",
  regular: "Regular working relationship",
  comfortable: "Comfortable relationship",
  difficult: "Difficult relationship",
};

export const urgencyLabels: Record<UrgencyLevel, string> = {
  none: "No urgency",
  today: "Today",
  few_days: "Within a few days",
  urgent: "Urgent",
  critical: "Critical",
};

export const channelLabels: Record<CommunicationChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  slack_teams: "Slack or Teams",
  sms: "SMS",
  linkedin: "LinkedIn",
  other: "Other",
};

export const riskLabels: Record<RiskType, string> = {
  blaming: "May sound blaming",
  aggressive: "May sound aggressive",
  passive_aggressive: "May sound passive-aggressive",
  too_apologetic: "May sound overly apologetic",
  unclear_request: "Request is unclear",
  missing_action: "Missing clear action",
  unclear_deadline: "Deadline is unclear",
  weak_ownership: "Ownership may sound weak",
  unintended_commitment: "Possible new promise",
  changed_fact: "Important detail may have changed",
  missing_context: "Context may be missing",
  overly_formal: "May sound overly formal",
  robotic_language: "May sound AI-generated",
  too_long: "May be too long",
  emotionally_charged: "May sound emotional",
  ambiguous_pronoun: "Pronoun may be ambiguous",
  possible_misinterpretation: "Possible misinterpretation",
};
