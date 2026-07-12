import { compareCommitments } from "../outcome-assistant/commitments.ts";
import {
  dedupeValues,
  extractLockedFactCandidates,
  extractNumberLikeValues,
} from "../outcome-assistant/facts.ts";
import type { Tone } from "../tones.ts";

export type SemanticMetadata = {
  protectedValues: string[];
  numbers: string[];
  temporalValues: string[];
  negations: string[];
  uncertainty: string[];
  conditions: string[];
  commitments: string[];
  hasQuestion: boolean;
  hasRefusal: boolean;
  language: "english" | "indian_workplace_english";
  possiblePromptInjection: boolean;
};

export type SemanticFailure = {
  code: string;
  severity: "medium" | "high" | "critical";
  message: string;
};

const protectedPatterns = [
  /`[^`\n]+`/g,
  /```[\s\S]*?```/g,
  /(?:^|\s)(?:\.?\.?\/|~\/|[A-Za-z]:\\)[^\s,;]+/gm,
  /\b(?:npm|pnpm|yarn|git|docker|kubectl|curl|ssh|python|node)\s+[^\n]+/gi,
];
const negationPattern = /\b(?:not|no|never|cannot|can't|cant|won't|will not|isn't|is not|aren't|are not|didn't|did not|doesn't|does not|unable)\b/gi;
const negationCheckPattern = /\b(?:not|no|never|cannot|can't|cant|won't|will not|isn't|is not|aren't|are not|didn't|did not|doesn't|does not|unable)\b/i;
const uncertaintyPattern = /\b(?:may|might|perhaps|possibly|probably|unsure|uncertain|not sure|need to check|subject to)\b/gi;
const conditionPattern = /\b(?:if|unless|provided that|subject to|depending on|when)\b/gi;
const refusalPattern = /\b(?:cannot|can't|cant|won't|will not|unable|not able|decline|refuse)\b/i;
const commitmentPattern = /\b(?:i|we)\s+(?:will|shall|commit|promise|guarantee|can deliver|can complete)\b/gi;
const temporalPattern = /\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|cob|\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\b/gi;
const promptInjectionPattern = /\b(?:ignore|override|reveal|show|print|repeat)\b[\s\S]{0,60}\b(?:instructions?|prompt|schema|secret|system message|api key)\b/i;
const placeholderPattern = /\[(?:name|date|time|amount|recipient|company|ticket|insert[^\]]*)\]/gi;

function matches(text: string, pattern: RegExp) {
  return dedupeValues(Array.from(text.matchAll(pattern), (match) => match[0]));
}

export function preprocessMessage(text: string): SemanticMetadata {
  const protectedValues = dedupeValues([
    ...extractLockedFactCandidates(text),
    ...extractNumberLikeValues(text),
    ...protectedPatterns.flatMap((pattern) => matches(text, pattern)),
  ]);
  return {
    protectedValues,
    numbers: extractNumberLikeValues(text),
    temporalValues: matches(text, temporalPattern),
    negations: matches(text, negationPattern),
    uncertainty: matches(text, uncertaintyPattern),
    conditions: matches(text, conditionPattern),
    commitments: matches(text, commitmentPattern),
    hasQuestion: text.includes("?"),
    hasRefusal: refusalPattern.test(text),
    language: /\b(?:kal|aaj|abhi|nahi|hai|karna|chahiye|krna|kya|please check once|kindly)\b/i.test(text)
      ? "indian_workplace_english"
      : "english",
    possiblePromptInjection: promptInjectionPattern.test(text),
  };
}

function hasAny(text: string, values: string[]) {
  const normalized = text.toLowerCase();
  return values.some((value) => normalized.includes(value.toLowerCase()));
}

export function validateSemanticInvariants({
  originalText,
  outputText,
  metadata = preprocessMessage(originalText),
  mode,
}: {
  originalText: string;
  outputText: string;
  metadata?: SemanticMetadata;
  mode?: Tone;
}) {
  const failures: SemanticFailure[] = [];
  const output = outputText.trim();
  if (!output) {
    failures.push({ code: "empty_output", severity: "critical", message: "Output is empty." });
    return failures;
  }

  const missingProtected = metadata.protectedValues.filter((value) => !output.includes(value));
  if (missingProtected.length) {
    failures.push({
      code: "protected_value_changed",
      severity: "critical",
      message: `Preserve exactly: ${missingProtected.slice(0, 8).join(", ")}.`,
    });
  }
  const outputNumbers = extractNumberLikeValues(output);
  const introducedNumbers = outputNumbers.filter((value) =>
    !metadata.numbers.some((original) => original.toLowerCase() === value.toLowerCase()));
  if (introducedNumbers.length) {
    failures.push({
      code: "number_introduced",
      severity: "critical",
      message: `Remove introduced numbers or deadlines: ${introducedNumbers.join(", ")}.`,
    });
  }
  const introducedTemporal = matches(output, temporalPattern).filter((value) =>
    !metadata.temporalValues.some((original) => original.toLowerCase() === value.toLowerCase()));
  if (introducedTemporal.length) {
    failures.push({
      code: "deadline_introduced",
      severity: "critical",
      message: `Remove introduced dates or times: ${introducedTemporal.join(", ")}.`,
    });
  }
  if (metadata.negations.length && !negationCheckPattern.test(output)) {
    failures.push({ code: "negation_removed", severity: "critical", message: "Preserve the original negation." });
  }
  if (metadata.uncertainty.length && !hasAny(output, ["may", "might", "possibly", "perhaps", "not sure", "uncertain", "need to check", "subject to"])) {
    failures.push({ code: "certainty_increased", severity: "critical", message: "Preserve the original uncertainty; do not turn may or might into will." });
  }
  if (metadata.conditions.length && !hasAny(output, metadata.conditions)) {
    failures.push({ code: "condition_removed", severity: "high", message: "Preserve the original condition." });
  }
  if (metadata.hasQuestion && !output.includes("?")) {
    failures.push({ code: "question_changed", severity: "critical", message: "Keep the original question as a question." });
  }
  if (metadata.hasRefusal && !refusalPattern.test(output)) {
    failures.push({ code: "refusal_changed", severity: "critical", message: "Preserve the refusal or boundary." });
  }
  if (compareCommitments({ originalText, generatedText: output }).length) {
    failures.push({ code: "commitment_added", severity: "critical", message: "Remove the new promise, guarantee, deadline or ownership." });
  }
  const originalPlaceholders = matches(originalText, placeholderPattern);
  const newPlaceholders = matches(output, placeholderPattern).filter((value) => !originalPlaceholders.includes(value));
  if (newPlaceholders.length) {
    failures.push({ code: "placeholder_added", severity: "high", message: "Remove invented placeholders." });
  }
  if (/\b(?:system instruction|response schema|internal prompt|api key|prophrase-prompt-v2)\b/i.test(output)) {
    failures.push({ code: "internal_content_exposed", severity: "critical", message: "Remove internal prompt or schema content." });
  }
  if (mode === "Jira Comment" && !/\b(?:root cause|eta)\b/i.test(originalText) && /\b(?:root cause|eta)\b/i.test(output)) {
    failures.push({ code: "jira_fact_invented", severity: "critical", message: "Do not invent a root cause or ETA." });
  }
  if (mode === "Client-safe" && !/\b(?:resolved|no impact|under control|rest assured)\b/i.test(originalText) && /\b(?:resolved|no impact|under control|rest assured)\b/i.test(output)) {
    failures.push({ code: "false_reassurance", severity: "critical", message: "Remove reassurance or resolution claims absent from the input." });
  }
  if (mode === "Firmer" && !/\b(?:consequence|escalat|report)\b/i.test(originalText) && /\b(?:face consequences|escalate this|report you)\b/i.test(output)) {
    failures.push({ code: "threat_added", severity: "critical", message: "Remove threats or invented consequences." });
  }
  if (mode === "Shorter" && output.length > originalText.trim().length) {
    failures.push({ code: "not_shorter", severity: "medium", message: "Make the output shorter without removing facts." });
  }
  if (mode === "Short & Crisp" && output.length > Math.max(180, originalText.trim().length * 0.75)) {
    failures.push({ code: "not_crisp", severity: "medium", message: "Put the main point first and shorten to one to three sentences." });
  }
  return failures;
}
