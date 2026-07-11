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
