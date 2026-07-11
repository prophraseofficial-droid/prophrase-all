type OutcomeAnalyticsMetadata = {
  recipient?: string;
  intent?: string;
  channel?: string;
  selectedVariant?: string;
  inputLengthBucket?: string;
  outputLengthBucket?: string;
  lockedFactCount?: number;
  riskCount?: number;
  highestRiskSeverity?: string;
  generationDurationMs?: number;
  errorCategory?: string;
  languageMode?: string;
};

export function lengthBucket(length: number) {
  if (length < 80) return "short";
  if (length < 800) return "medium";
  if (length < 3000) return "long";
  return "very_long";
}

export function sanitizeOutcomeAnalytics(metadata: OutcomeAnalyticsMetadata) {
  return {
    recipient: metadata.recipient,
    intent: metadata.intent,
    channel: metadata.channel,
    selectedVariant: metadata.selectedVariant,
    inputLengthBucket: metadata.inputLengthBucket,
    outputLengthBucket: metadata.outputLengthBucket,
    lockedFactCount: metadata.lockedFactCount,
    riskCount: metadata.riskCount,
    highestRiskSeverity: metadata.highestRiskSeverity,
    generationDurationMs: metadata.generationDurationMs,
    errorCategory: metadata.errorCategory,
    languageMode: metadata.languageMode,
  };
}

export function trackOutcomeEvent(
  _eventName: string,
  metadata: OutcomeAnalyticsMetadata = {},
) {
  return sanitizeOutcomeAnalytics(metadata);
}

