import {
  AiProviderError,
  generateOutcomeAssistantWithGemini,
  rewriteWithGemini,
} from "@/lib/ai/gemini";
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

async function generateReliableFallback(request: OutcomeAssistantRequest) {
  const metadata = [
    `Recipient: ${recipientLabels[request.recipient]}`,
    `Outcome: ${intentLabels[request.intent]}`,
    request.relationshipLevel
      ? `Relationship: ${relationshipLabels[request.relationshipLevel]}`
      : null,
    request.urgency ? `Urgency: ${urgencyLabels[request.urgency]}` : null,
    request.channel ? `Channel: ${channelLabels[request.channel]}` : null,
    request.desiredResponse
      ? `Desired response: ${request.desiredResponse}`
      : null,
    request.lockedFacts.length
      ? `Preserve these exact details: ${request.lockedFacts.join("; ")}`
      : null,
  ].filter(Boolean).join("\n");
  const versions = [
    {
      id: "safe" as const,
      label: "Safe",
      explanation: "Careful and low-risk while preserving your intention.",
      instruction: "Write a careful, respectful, low-risk version. Keep the request clear and do not weaken the intention.",
    },
    {
      id: "balanced" as const,
      label: "Balanced",
      explanation: "Natural, confident and professional.",
      instruction: "Write a natural, confident, concise professional version with a clear next action.",
    },
    {
      id: "firm" as const,
      label: "Firm",
      explanation: "Direct and assertive without becoming rude.",
      instruction: "Write a direct, assertive version that remains respectful and does not add threats, facts, deadlines or promises.",
    },
  ];
  const generated = await Promise.allSettled(
    versions.map((version) => rewriteWithGemini({
      text: request.originalText,
      tone: "Professional",
      instruction: `${version.instruction}\n${metadata}`,
    })),
  );
  const firstSuccess = generated.find(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof rewriteWithGemini>>> =>
      result.status === "fulfilled",
  );
  if (!firstSuccess) {
    const firstFailure = generated.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw firstFailure?.reason ?? new Error("OUTCOME_FALLBACK_FAILED");
  }

  return {
    response: postProcessResponse({
      request,
      response: {
        detectedLanguage: request.languageMode === "indian_workplace"
          ? "Indian workplace English"
          : "English",
        understoodIntent: `Prepare a message for ${recipientLabels[request.recipient]} to ${intentLabels[request.intent].toLowerCase()}.`,
        variants: versions.map((version, index) => {
          const result = generated[index];
          const message = result?.status === "fulfilled"
            ? result.value.text
            : firstSuccess.value.text;
          return {
            id: version.id,
            label: version.label,
            explanation: version.explanation,
            message,
            readerInterpretation: "This version communicates the requested outcome professionally.",
            risks: [],
            factVerification: [],
            commitmentWarnings: [],
          };
        }),
        globalWarnings: generated.some((result) => result.status === "rejected")
          ? ["One version was recovered from the available generation result."]
          : [],
        missingInformation: [],
      },
    }),
    model: firstSuccess.value.model,
    promptVersion: outcomeAssistantPromptVersion,
    repaired: true,
    fallback: true,
  };
}

export async function generateOutcomeAssistantResponse(
  request: OutcomeAssistantRequest,
) {
  const prompt = buildOutcomePrompt(request);

  try {
    const firstResponse = await generateOutcomeAssistantWithGemini({
      prompt,
      promptVersion: outcomeAssistantPromptVersion,
    });

    try {
      return {
        response: postProcessResponse({
          request,
          response: parseOutcomeAssistantJson(firstResponse.text),
        }),
        model: firstResponse.model,
        promptVersion: outcomeAssistantPromptVersion,
        repaired: false,
        fallback: false,
      };
    } catch (firstError) {
      const repair = await generateOutcomeAssistantWithGemini({
        prompt: `${prompt}

${buildRepairPrompt({
  invalidText: firstResponse.text,
  validationMessage:
    firstError instanceof Error ? firstError.message : "Invalid structured output.",
})}`,
        promptVersion: outcomeAssistantPromptVersion,
      });

      try {
        return {
          response: postProcessResponse({
            request,
            response: parseOutcomeAssistantJson(repair.text),
          }),
          model: repair.model,
          promptVersion: outcomeAssistantPromptVersion,
          repaired: true,
          fallback: false,
        };
      } catch {
        return {
          response: postProcessResponse({
            request,
            response: parseOutcomeAssistantJsonLenient(repair.text),
          }),
          model: repair.model,
          promptVersion: outcomeAssistantPromptVersion,
          repaired: true,
          fallback: false,
        };
      }
    }
  } catch (error) {
    if (error instanceof OutcomeAssistantError || error instanceof AiProviderError) {
      throw error;
    }
    try {
      return await generateReliableFallback(request);
    } catch (fallbackError) {
      if (fallbackError instanceof AiProviderError) throw fallbackError;
      throw new OutcomeAssistantError({
        code: "INVALID_AI_OUTPUT",
        message: fallbackError instanceof Error
          ? fallbackError.message
          : error instanceof Error
            ? error.message
            : "INVALID_OUTCOME_OUTPUT",
        userMessage: "We could not prepare the message because the AI service did not return usable text. No credits were used.",
        status: 502,
      });
    }
  }
}
