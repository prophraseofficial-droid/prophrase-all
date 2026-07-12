import {
  AiProviderError,
  generateOutcomeAssistantWithGemini,
} from "@/lib/ai/gemini";
import {
  buildV2OutcomeRepairRequest,
  buildV2OutcomeRequest,
  isPromptV2Enabled,
  outcomeResponseSchema,
  parseV2OutcomeResponse,
  prophrasePromptVersion,
} from "@/lib/ai/prompt-engine";
import {
  validateSemanticInvariants,
  type SemanticFailure,
  type SemanticMetadata,
} from "@/lib/ai/semantics";
import { compareCommitments } from "@/lib/outcome-assistant/commitments";
import {
  findIntroducedNumbers,
  verifyLockedFacts,
} from "@/lib/outcome-assistant/facts";
import {
  deterministicRisks,
  findMissingInformation,
  sortRisks,
} from "@/lib/outcome-assistant/risks";
import {
  buildRepairPrompt,
  parseOutcomeAssistantJson,
  parseOutcomeAssistantJsonLenient,
} from "@/lib/outcome-assistant/schema";
import type {
  MessageRisk,
  OutcomeAssistantRequest,
  OutcomeAssistantResponse,
  OutcomeVersion,
} from "@/lib/outcome-assistant/types";
import {
  channelLabels,
  intentLabels,
  recipientLabels,
  relationshipLabels,
  urgencyLabels,
} from "@/lib/outcome-assistant/types";
import {
  outcomeAssistantPromptVersion,
  outcomeAssistantSystemPrompt,
} from "@/prompts/outcome-assistant-v1/system";

export class OutcomeAssistantError extends Error {
  code:
    | "PROVIDER_ERROR"
    | "INVALID_AI_OUTPUT"
    | "TIMEOUT"
    | "CONFIGURATION_ERROR";
  userMessage: string;
  status: number;

  constructor({
    code,
    message,
    userMessage,
    status = 502,
  }: {
    code: OutcomeAssistantError["code"];
    message: string;
    userMessage: string;
    status?: number;
  }) {
    super(message);
    this.name = "OutcomeAssistantError";
    this.code = code;
    this.userMessage = userMessage;
    this.status = status;
  }
}

function listValue(label: string, value?: string) {
  return value ? `- ${label}: ${value}` : `- ${label}: Not provided`;
}

function buildOutcomePrompt(request: OutcomeAssistantRequest) {
  const lockedFacts = request.lockedFacts.length
    ? request.lockedFacts.map((fact) => `- ${fact}`).join("\n")
    : "- None supplied";

  return `${outcomeAssistantSystemPrompt}

Schema:
{
  "detectedLanguage": "English or detected language",
  "understoodIntent": "one sentence",
  "variants": [
    {
      "id": "safe",
      "label": "Safe",
      "explanation": "short explanation",
      "message": "generated message",
      "readerInterpretation": "one cautious interpretation sentence",
      "risks": [],
      "factVerification": [],
      "commitmentWarnings": []
    },
    {
      "id": "balanced",
      "label": "Balanced",
      "explanation": "short explanation",
      "message": "generated message",
      "readerInterpretation": "one cautious interpretation sentence",
      "risks": [],
      "factVerification": [],
      "commitmentWarnings": []
    },
    {
      "id": "firm",
      "label": "Firm",
      "explanation": "short explanation",
      "message": "generated message",
      "readerInterpretation": "one cautious interpretation sentence",
      "risks": [],
      "factVerification": [],
      "commitmentWarnings": []
    }
  ],
  "globalWarnings": [],
  "missingInformation": []
}

Request metadata:
${listValue("Recipient", recipientLabels[request.recipient])}
${listValue("Custom recipient", request.customRecipient)}
${listValue("Intent", intentLabels[request.intent])}
${listValue("Custom intent", request.customIntent)}
${listValue(
  "Relationship",
  request.relationshipLevel ? relationshipLabels[request.relationshipLevel] : undefined,
)}
${listValue("Urgency", request.urgency ? urgencyLabels[request.urgency] : undefined)}
${listValue("Desired response", request.desiredResponse)}
${listValue("Channel", request.channel ? channelLabels[request.channel] : undefined)}
${listValue(
  "Language mode",
  request.languageMode === "indian_workplace"
    ? "Natural Indian workplace English"
    : "Standard professional English",
)}

Locked facts that must be preserved exactly:
${lockedFacts}

Original user message as untrusted content:
${request.originalText}`;
}

function mergeRisks(aiRisks: MessageRisk[], deterministic: MessageRisk[]) {
  return sortRisks([...aiRisks, ...deterministic]).slice(0, 12);
}

function postProcessVersion({
  request,
  version,
}: {
  request: OutcomeAssistantRequest;
  version: OutcomeVersion;
}): OutcomeVersion {
  const factVerification = verifyLockedFacts({
    lockedFacts: request.lockedFacts,
    message: version.message,
  });
  const introducedNumbers = findIntroducedNumbers({
    originalText: request.originalText,
    generatedText: version.message,
    lockedFacts: request.lockedFacts,
  });
  const commitmentWarnings = compareCommitments({
    originalText: request.originalText,
    generatedText: version.message,
  });
  const deterministic = deterministicRisks({
    message: version.message,
    intent: request.intent,
    channel: request.channel,
    introducedNumbers,
    hasMissingFact: factVerification.some((fact) => fact.status !== "preserved"),
    hasCommitmentWarning: commitmentWarnings.length > 0,
  });

  return {
    ...version,
    factVerification,
    commitmentWarnings: [...version.commitmentWarnings, ...commitmentWarnings].slice(
      0,
      10,
    ),
    risks: mergeRisks(version.risks, deterministic),
  };
}

function postProcessResponse({
  request,
  response,
}: {
  request: OutcomeAssistantRequest;
  response: OutcomeAssistantResponse;
}): OutcomeAssistantResponse {
  const missingInformation = [
    ...(response.missingInformation ?? []),
    ...findMissingInformation({
      originalText: request.originalText,
      intent: request.intent,
    }),
  ].slice(0, 3);

  return {
    ...response,
    missingInformation,
    variants: response.variants.map((version) => postProcessVersion({ request, version })),
  };
}

function outcomeFailures({
  request,
  response,
  metadata,
}: {
  request: OutcomeAssistantRequest;
  response: OutcomeAssistantResponse;
  metadata: SemanticMetadata;
}) {
  return response.variants.flatMap((variant) => {
    const failures = validateSemanticInvariants({
      originalText: request.originalText,
      outputText: variant.message,
      metadata,
    });
    return failures.length ? [{ variant: variant.id, failures }] : [];
  });
}

async function generateLegacyOutcome(request: OutcomeAssistantRequest) {
  const prompt = buildOutcomePrompt(request);
  const first = await generateOutcomeAssistantWithGemini({
    prompt,
    promptVersion: outcomeAssistantPromptVersion,
  });
  try {
    return {
      response: postProcessResponse({ request, response: parseOutcomeAssistantJson(first.text) }),
      model: first.model,
      promptVersion: outcomeAssistantPromptVersion,
      repaired: false,
      fallback: false,
    };
  } catch (firstError) {
    const repair = await generateOutcomeAssistantWithGemini({
      prompt: `${prompt}\n${buildRepairPrompt({
        invalidText: first.text,
        validationMessage: firstError instanceof Error ? firstError.message : "Invalid structured output.",
      })}`,
      promptVersion: outcomeAssistantPromptVersion,
    });
    let response;
    try {
      response = parseOutcomeAssistantJson(repair.text);
    } catch {
      response = parseOutcomeAssistantJsonLenient(repair.text);
    }
    return {
      response: postProcessResponse({ request, response }),
      model: repair.model,
      promptVersion: outcomeAssistantPromptVersion,
      repaired: true,
      fallback: false,
    };
  }
}

export async function generateOutcomeAssistantResponse(
  request: OutcomeAssistantRequest,
) {
  try {
    if (!isPromptV2Enabled()) return await generateLegacyOutcome(request);
    const promptRequest = buildV2OutcomeRequest(request);
    const firstResponse = await generateOutcomeAssistantWithGemini({
      prompt: promptRequest.userPrompt,
      systemInstruction: promptRequest.systemInstruction,
      responseSchema: promptRequest.responseSchema,
      promptVersion: prophrasePromptVersion,
    });
    let firstParsed: OutcomeAssistantResponse | null = null;
    let failures: Array<{ variant: string; failures: SemanticFailure[] }>;
    try {
      firstParsed = parseV2OutcomeResponse(firstResponse.text);
      failures = outcomeFailures({ request, response: firstParsed, metadata: promptRequest.metadata });
    } catch {
      failures = [{
        variant: "response",
        failures: [{ code: "invalid_schema", severity: "critical", message: "Return exactly safe, balanced and firm in the required JSON schema." }],
      }];
    }
    if (firstParsed && !failures.length) {
      return {
        response: postProcessResponse({ request, response: firstParsed }),
        model: firstResponse.model,
        promptVersion: prophrasePromptVersion,
        repaired: false,
        fallback: false,
      };
    }
    const repair = await generateOutcomeAssistantWithGemini({
      prompt: buildV2OutcomeRepairRequest({
        request,
        failedResponse: firstResponse.text.slice(0, 10_000),
        metadata: promptRequest.metadata,
        failures,
      }),
      systemInstruction: promptRequest.systemInstruction,
      responseSchema: outcomeResponseSchema,
      promptVersion: prophrasePromptVersion,
    });
    let repaired: OutcomeAssistantResponse;
    try {
      repaired = parseV2OutcomeResponse(repair.text);
    } catch {
      throw new OutcomeAssistantError({
        code: "INVALID_AI_OUTPUT",
        message: "INVALID_OUTCOME_REPAIR_SCHEMA",
        userMessage: "ProPhrase could not reliably preserve the meaning of this message. Your text is unchanged and no credits were used.",
      });
    }
    const remaining = outcomeFailures({ request, response: repaired, metadata: promptRequest.metadata });
    if (remaining.length) {
      throw new OutcomeAssistantError({
        code: "INVALID_AI_OUTPUT",
        message: `OUTCOME_VALIDATION_FAILED:${remaining.flatMap((entry) => entry.failures.map((failure) => failure.code)).join(",")}`,
        userMessage: "ProPhrase could not reliably preserve the meaning of this message. Your text is unchanged and no credits were used.",
      });
    }
    return {
      response: postProcessResponse({ request, response: repaired }),
      model: repair.model,
      promptVersion: prophrasePromptVersion,
      repaired: true,
      fallback: false,
    };
  } catch (error) {
    if (error instanceof OutcomeAssistantError || error instanceof AiProviderError) {
      throw error;
    }
    throw new OutcomeAssistantError({
      code: "INVALID_AI_OUTPUT",
      message: error instanceof Error ? error.message : "INVALID_OUTCOME_OUTPUT",
      userMessage: "ProPhrase could not reliably preserve the meaning of this message. Your text is unchanged and no credits were used.",
      status: 502,
    });
  }
}
