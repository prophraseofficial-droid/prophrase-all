import { z } from "zod";
import {
  riskTypes,
  severityOptions,
  versionIds,
  type OutcomeAssistantResponse,
} from "./types.ts";

const messageRiskSchema = z.object({
  type: z.enum(riskTypes),
  severity: z.enum(severityOptions),
  explanation: z.string().trim().min(1).max(280),
  evidence: z.string().trim().min(1).max(300),
  suggestion: z.string().trim().min(1).max(220).optional(),
});

const factVerificationSchema = z.object({
  value: z.string().trim().min(1).max(120),
  status: z.enum(["preserved", "missing", "changed"]),
});

const commitmentWarningSchema = z.object({
  type: z.enum(["new_commitment", "new_deadline", "new_guarantee", "new_ownership"]),
  severity: z.enum(severityOptions),
  explanation: z.string().trim().min(1).max(280),
  evidence: z.string().trim().min(1).max(300),
});

const outcomeVersionSchema = z.object({
  id: z.enum(versionIds),
  label: z.string().trim().min(1).max(40),
  explanation: z.string().trim().min(1).max(220),
  message: z.string().trim().min(1).max(2400),
  readerInterpretation: z.string().trim().min(1).max(260),
  risks: z.array(messageRiskSchema).max(12).default([]),
  factVerification: z.array(factVerificationSchema).max(30).default([]),
  commitmentWarnings: z.array(commitmentWarningSchema).max(10).default([]),
});

export const outcomeAssistantResponseSchema = z
  .object({
    detectedLanguage: z.string().trim().min(1).max(80).optional(),
    understoodIntent: z.string().trim().min(1).max(280),
    variants: z.array(outcomeVersionSchema).length(3),
    globalWarnings: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
    missingInformation: z
      .array(z.string().trim().min(1).max(120))
      .max(3)
      .optional(),
  })
  .superRefine((value, context) => {
    const ids = value.variants.map((variant) => variant.id);
    const uniqueIds = new Set(ids);

    if (uniqueIds.size !== 3) {
      context.addIssue({
        code: "custom",
        message: "Response must include safe, balanced and firm exactly once.",
        path: ["variants"],
      });
    }

    versionIds.forEach((id) => {
      if (!uniqueIds.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Missing ${id} variant.`,
          path: ["variants"],
        });
      }
    });
  });

export function stripJsonMarkdown(rawText: string) {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseOutcomeAssistantJson(rawText: string): OutcomeAssistantResponse {
  const jsonText = stripJsonMarkdown(rawText);
  const parsed = JSON.parse(jsonText) as unknown;
  return outcomeAssistantResponseSchema.parse(parsed);
}

function textValue(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function arrayValue(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function recoverJsonObject(rawText: string) {
  const stripped = stripJsonMarkdown(rawText);
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1)) as unknown;
    }
    throw new Error("Outcome response did not contain a complete JSON object.");
  }
}

export function parseOutcomeAssistantJsonLenient(
  rawText: string,
): OutcomeAssistantResponse {
  const raw = recoverJsonObject(rawText);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Outcome response must be a JSON object.");
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.variants) || record.variants.length !== 3) {
    throw new Error("Outcome response must contain exactly three variants.");
  }

  const expectedIds = ["safe", "balanced", "firm"] as const;
  const variants = record.variants.map((rawVariant, index) => {
    if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) {
      throw new Error("Outcome variant must be an object.");
    }
    const variant = rawVariant as Record<string, unknown>;
    const labelId = typeof variant.label === "string"
      ? variant.label.trim().toLowerCase()
      : "";
    const suppliedId = typeof variant.id === "string"
      ? variant.id.trim().toLowerCase()
      : "";
    const id = expectedIds.includes(suppliedId as (typeof expectedIds)[number])
      ? suppliedId as (typeof expectedIds)[number]
      : expectedIds.includes(labelId as (typeof expectedIds)[number])
        ? labelId as (typeof expectedIds)[number]
        : expectedIds[index];
    const message = textValue(variant.message, "", 2400);
    if (!message) throw new Error(`Missing ${id} message.`);

    const risks = Array.isArray(variant.risks)
      ? variant.risks.flatMap((risk) => {
        const result = messageRiskSchema.safeParse(risk);
        return result.success ? [result.data] : [];
      }).slice(0, 12)
      : [];
    const commitments = Array.isArray(variant.commitmentWarnings)
      ? variant.commitmentWarnings.flatMap((warning) => {
        const result = commitmentWarningSchema.safeParse(warning);
        return result.success ? [result.data] : [];
      }).slice(0, 10)
      : [];

    return {
      id,
      label: textValue(variant.label, id[0].toUpperCase() + id.slice(1), 40),
      explanation: textValue(
        variant.explanation,
        `${id[0].toUpperCase()}${id.slice(1)} version`,
        220,
      ),
      message,
      readerInterpretation: textValue(
        variant.readerInterpretation,
        "This version communicates the requested outcome professionally.",
        260,
      ),
      risks,
      factVerification: [],
      commitmentWarnings: commitments,
    };
  });

  if (new Set(variants.map((variant) => variant.id)).size !== 3) {
    throw new Error("Outcome response contained duplicate variants.");
  }

  return outcomeAssistantResponseSchema.parse({
    detectedLanguage: typeof record.detectedLanguage === "string"
      ? record.detectedLanguage.slice(0, 80)
      : undefined,
    understoodIntent: textValue(
      record.understoodIntent,
      "Prepare a clear message for the selected recipient and outcome.",
      280,
    ),
    variants,
    globalWarnings: arrayValue(record.globalWarnings, 8, 240),
    missingInformation: arrayValue(record.missingInformation, 3, 120),
  });
}

export function buildRepairPrompt({
  invalidText,
  validationMessage,
}: {
  invalidText: string;
  validationMessage: string;
}) {
  return `The previous response was invalid for this reason: ${validationMessage}

Return only corrected JSON matching the required schema. Do not include markdown, comments, or extra text.

Invalid response:
${invalidText.slice(0, 12000)}`;
}
