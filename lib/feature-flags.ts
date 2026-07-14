export function isOutcomeAssistantClientEnabled() {
  return process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED !== "disabled";
}

export function isOutcomeAssistantEnabled() {
  return (
    process.env.OUTCOME_ASSISTANT_ENABLED !== "disabled" &&
    isOutcomeAssistantClientEnabled()
  );
}
