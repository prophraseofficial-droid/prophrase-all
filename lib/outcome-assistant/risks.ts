import type {
  CommunicationChannel,
  IntentType,
  MessageRisk,
  RiskSeverity,
} from "./types";

const severityRank: Record<RiskSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const requestIntents: IntentType[] = [
  "request",
  "follow_up",
  "approval",
  "escalation",
  "payment_request",
  "extension_request",
  "clarification",
  "negotiation",
];

const channelSoftLimits: Record<CommunicationChannel, number> = {
  sms: 320,
  whatsapp: 800,
  slack_teams: 1000,
  linkedin: 1200,
  email: 2000,
  other: 1200,
};

export function sortRisks(risks: MessageRisk[]) {
  const seen = new Set<string>();

  return [...risks]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .filter((risk) => {
      const key = `${risk.type}:${risk.evidence.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function hasClearAction(message: string) {
  return /\b(?:please|can you|could you|confirm|share|send|approve|review|let me know|provide|complete|pay|update|acknowledge)\b/i.test(
    message,
  );
}

export function deterministicRisks({
  message,
  intent,
  channel = "other",
  introducedNumbers,
  hasMissingFact,
  hasCommitmentWarning,
}: {
  message: string;
  intent: IntentType;
  channel?: CommunicationChannel;
  introducedNumbers: string[];
  hasMissingFact: boolean;
  hasCommitmentWarning: boolean;
}): MessageRisk[] {
  const risks: MessageRisk[] = [];

  if (requestIntents.includes(intent) && !hasClearAction(message)) {
    risks.push({
      type: "missing_action",
      severity: "high",
      explanation: "The message does not clearly state the action or response needed.",
      evidence: message.slice(0, 160),
      suggestion: "Add a direct request or expected next step.",
    });
  }

  if (hasMissingFact || introducedNumbers.length) {
    risks.push({
      type: "changed_fact",
      severity: "high",
      explanation: "An important detail may be missing or changed.",
      evidence: introducedNumbers.slice(0, 3).join(", ") || "Protected detail missing",
      suggestion: "Review the protected details before sending.",
    });
  }

  if (hasCommitmentWarning) {
    risks.push({
      type: "unintended_commitment",
      severity: "medium",
      explanation: "The message may add a promise that was not in the original.",
      evidence: "Commitment wording detected",
      suggestion: "Keep uncertainty or conditions if they were present in the original.",
    });
  }

  if (message.length > channelSoftLimits[channel]) {
    risks.push({
      type: "too_long",
      severity: channel === "sms" ? "high" : "medium",
      explanation: "The message may be too long for the selected channel.",
      evidence: `${message.length} characters`,
      suggestion: "Shorten the message or choose a channel suited for longer context.",
    });
  }

  if (/\b(?:ridiculous|useless|terrible|stupid|angry|fed up)\b/i.test(message)) {
    risks.push({
      type: "emotionally_charged",
      severity: "medium",
      explanation: "The message may sound emotionally charged.",
      evidence: message.slice(0, 160),
      suggestion: "Make the issue specific and action-oriented.",
    });
  }

  if (/\b(?:it|this|that|they)\b/i.test(message) && message.length < 80) {
    risks.push({
      type: "ambiguous_pronoun",
      severity: "low",
      explanation: "A short message with pronouns may be unclear without context.",
      evidence: message,
      suggestion: "Name the task, issue, invoice or decision directly.",
    });
  }

  return sortRisks(risks);
}

export function findMissingInformation({
  originalText,
  intent,
}: {
  originalText: string;
  intent: IntentType;
}) {
  const missing: string[] = [];

  if (intent === "payment_request") {
    if (!/(?:₹|Rs\.?|INR|USD|EUR|GBP|\b\d+%?\b)/i.test(originalText)) {
      missing.push("Payment amount");
    }
    if (!/\b(?:today|tomorrow|by|before|due|eod|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s+[a-z]+)\b/i.test(originalText)) {
      missing.push("Expected payment date");
    }
  }

  if (intent === "extension_request" && !/\b(?:one more day|more time|until|by|deadline|date|tomorrow|friday|monday)\b/i.test(originalText)) {
    missing.push("Requested revised timeline");
  }

  if (intent === "approval" && !/\b(?:approve|approval|sign off|permission|review)\b/i.test(originalText)) {
    missing.push("What needs approval");
  }

  if (intent === "escalation" && originalText.length < 40) {
    missing.push("Specific issue being escalated");
  }

  return missing.slice(0, 3);
}
