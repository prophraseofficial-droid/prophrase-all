export function isOutcomeAssistantClientEnabled() {
  return process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED === "true";
}

export function isOutcomeAssistantEnabled() {
  return (
    isOutcomeAssistantClientEnabled() ||
    process.env.OUTCOME_ASSISTANT_ENABLED === "true"
  );
}
