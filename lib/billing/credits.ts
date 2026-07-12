import type {
  CreditEstimate,
  CreditOperation,
} from "@/lib/billing/types";

export class CreditCalculationError extends Error {
  readonly code: "EMPTY_INPUT" | "INPUT_TOO_LONG";
  constructor(
    code: "EMPTY_INPUT" | "INPUT_TOO_LONG",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "CreditCalculationError";
  }
}

export function normalizeForCreditCount(text: string) {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function countBillableCharacters(text: string) {
  return Array.from(normalizeForCreditCount(text)).length;
}

export function inputLengthBucket(
  count: number,
): CreditEstimate["inputLengthBucket"] {
  if (count <= 0) return "empty";
  if (count <= 500) return "1-500";
  if (count <= 1200) return "501-1200";
  if (count <= 2500) return "1201-2500";
  if (count <= 5000) return "2501-5000";
  return "over-5000";
}

export function calculateBaseCreditCost(text: string) {
  const count = countBillableCharacters(text);
  if (count === 0) {
    throw new CreditCalculationError("EMPTY_INPUT", "Enter a message to continue.");
  }
  if (count > 5000) {
    throw new CreditCalculationError(
      "INPUT_TOO_LONG",
      "Messages cannot exceed 5,000 characters.",
    );
  }
  if (count <= 500) return 1;
  if (count <= 1200) return 2;
  if (count <= 2500) return 4;
  return 8;
}

export function calculateOperationCreditCost(
  operation: CreditOperation,
  text: string,
) {
  if (operation === "voice_transcription") return 0;
  if (
    operation === "extra_variant" ||
    operation === "tone_explanation" ||
    operation === "edited_message_check"
  ) {
    const characters = countBillableCharacters(text);
    if (characters === 0) {
      throw new CreditCalculationError("EMPTY_INPUT", "Enter a message to continue.");
    }
    if (characters > 5000) {
      throw new CreditCalculationError(
        "INPUT_TOO_LONG",
        "Messages cannot exceed 5,000 characters.",
      );
    }
    return 1;
  }
  return calculateBaseCreditCost(text);
}

export function estimateCreditCost(
  operation: CreditOperation,
  text: string,
): CreditEstimate {
  const billableCharacters = countBillableCharacters(text);
  return {
    operation,
    billableCharacters,
    inputLengthBucket: inputLengthBucket(billableCharacters),
    creditCost: calculateOperationCreditCost(operation, text),
  };
}
