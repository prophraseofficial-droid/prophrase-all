import type { Tone } from "@/lib/tones";
import { buildRewritePrompt, type AiContextMessage } from "@/lib/ai/prompts";
import {
  buildV2RewriteRepairRequest,
  buildV2RewriteRequest,
  isPromptV2Enabled,
  parseV2RewriteResponse,
  prophrasePromptVersion,
  rewriteResponseSchema,
} from "@/lib/ai/prompt-engine";
import { validateSemanticInvariants } from "@/lib/ai/semantics";
import {
  defaultGeminiRewriteModel,
  GeminiModelPolicyError,
  getGeminiModelChain,
} from "@/lib/ai/model-policy";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

type GeminiErrorResponse = {
  error?: { code?: number; message?: string; status?: string };
};

type GeminiJsonSchema = Record<string, unknown>;

const GEMINI_TIMEOUT_MS = 20_000;
const OUTCOME_GEMINI_TIMEOUT_MS = 30_000;

export class AiProviderError extends Error {
  providerStatus?: string;
  statusCode?: number;
  userMessage: string;

  constructor({
    message,
    providerStatus,
    statusCode,
    userMessage,
  }: {
    message: string;
    providerStatus?: string;
    statusCode?: number;
    userMessage: string;
  }) {
    super(message);
    this.name = "AiProviderError";
    this.providerStatus = providerStatus;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

export class AiValidationError extends Error {
  readonly userMessage =
    "ProPhrase could not reliably preserve the meaning of this message. Your text is unchanged and no credits were used.";

  constructor(public readonly failureCodes: string[]) {
    super(`AI_VALIDATION_FAILED:${failureCodes.join(",")}`);
    this.name = "AiValidationError";
  }
}

function providerUserMessage(statusCode: number, providerStatus?: string) {
  if (statusCode === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    return "The free Gemini quota is currently exhausted. Please try again after the quota resets.";
  }
  if (statusCode === 400 || statusCode === 403) {
    return "Gemini is not configured correctly. Please check the API key, model, and project permissions.";
  }
  return "Unable to rewrite message right now. Please try again.";
}

function configuredTokens(name: string, fallback: number, min: number, max: number) {
  const configured = Number(process.env[name] || fallback);
  return Number.isSafeInteger(configured)
    ? Math.min(max, Math.max(min, configured))
    : fallback;
}

function thinkingConfig(model: string, level: "low" | "medium") {
  if (/^gemini-3(?:\.|-)/i.test(model)) {
    return { thinkingLevel: level };
  }
  if (!/^gemini-2\.5-/i.test(model)) return undefined;
  return {
    thinkingBudget: level === "low"
      ? configuredTokens("GEMINI_REWRITE_THINKING_BUDGET", 0, 0, 1024)
      : configuredTokens("GEMINI_OUTCOME_THINKING_BUDGET", 1024, 0, 4096),
  };
}

async function callGeminiModel({
  model,
  prompt,
  systemInstruction,
  responseSchema,
  maxOutputTokens,
  thinkingLevel,
  timeoutMs,
}: {
  model: string;
  prompt: string;
  systemInstruction?: string;
  responseSchema?: GeminiJsonSchema;
  maxOutputTokens: number;
  thinkingLevel: "low" | "medium";
  timeoutMs: number;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiProviderError({
      message: "GEMINI_API_KEY_MISSING",
      statusCode: 500,
      userMessage: "AI is not configured for this environment.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const modelThinkingConfig = thinkingConfig(model, thinkingLevel);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
            : {}),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens,
            ...(responseSchema
              ? { responseMimeType: "application/json", responseSchema }
              : {}),
            ...(modelThinkingConfig ? { thinkingConfig: modelThinkingConfig } : {}),
          },
        }),
      },
    );
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as GeminiErrorResponse | null;
      const providerStatus = errorBody?.error?.status;
      const providerMessage = errorBody?.error?.message;
      throw new AiProviderError({
        message: `GEMINI_PROVIDER_${response.status}${providerStatus ? `_${providerStatus}` : ""}${providerMessage ? `: ${providerMessage}` : ""}`,
        providerStatus,
        statusCode: response.status,
        userMessage: providerUserMessage(response.status, providerStatus),
      });
    }
    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("")
      .trim() ?? "";
    if (!text) throw new Error("GEMINI_EMPTY_RESPONSE");
    return {
      text,
      model,
      inputTokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
      outputTokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isQuotaError(error: unknown) {
  return error instanceof AiProviderError
    && (error.statusCode === 429 || error.providerStatus === "RESOURCE_EXHAUSTED");
}

async function callGemini(
  {
    primaryModel,
    ...options
  }: Omit<Parameters<typeof callGeminiModel>[0], "model"> & {
    primaryModel?: string;
  },
) {
  let lastError: unknown;
  let models: string[];
  try {
    models = getGeminiModelChain(process.env, primaryModel);
  } catch (error) {
    if (!(error instanceof GeminiModelPolicyError)) throw error;
    throw new AiProviderError({
      message: error.message,
      statusCode: 500,
      userMessage: "AI is configured with a model that is not approved for free-only use.",
    });
  }

  for (const [index, model] of models.entries()) {
    try {
      return await callGeminiModel({ ...options, model });
    } catch (error) {
      lastError = error;
      if (!isQuotaError(error) || index === models.length - 1) throw error;
    }
  }

  throw lastError;
}

export async function rewriteWithGemini({
  text,
  tone,
  instruction,
  contextMessages,
}: {
  text: string;
  tone: Tone;
  instruction?: string;
  contextMessages?: AiContextMessage[];
}) {
  const rewriteModel =
    process.env.GEMINI_REWRITE_MODEL?.trim() || defaultGeminiRewriteModel;
  if (!isPromptV2Enabled()) {
    const legacy = await callGemini({
      prompt: buildRewritePrompt({ text, tone, instruction, contextMessages }),
      maxOutputTokens: 360,
      thinkingLevel: "low",
      timeoutMs: GEMINI_TIMEOUT_MS,
      primaryModel: rewriteModel,
    });
    return { ...legacy, warnings: [], repaired: false, promptVersion: "legacy" };
  }

  const request = buildV2RewriteRequest({ text, tone, instruction, contextMessages });
  const maxOutputTokens = configuredTokens(
    "REWRITE_GEMINI_MAX_OUTPUT_TOKENS",
    1200,
    400,
    2000,
  );
  const first = await callGemini({
    prompt: request.userPrompt,
    systemInstruction: request.systemInstruction,
    responseSchema: request.responseSchema,
    maxOutputTokens,
    thinkingLevel: "low",
    timeoutMs: GEMINI_TIMEOUT_MS,
    primaryModel: rewriteModel,
  });

  let candidate = "";
  let warnings: Array<{ type: string; severity: "low" | "medium" | "high"; message: string }> = [];
  let failures;
  try {
    const parsed = parseV2RewriteResponse(first.text);
    candidate = parsed.rewrittenText;
    warnings = parsed.warnings;
    failures = validateSemanticInvariants({
      originalText: text,
      outputText: candidate,
      metadata: request.metadata,
      mode: tone,
    });
  } catch {
    failures = [{ code: "invalid_schema", severity: "critical" as const, message: "Return valid structured JSON with rewrittenText and warnings." }];
  }

  if (!failures.length) {
    return {
      ...first,
      text: candidate,
      warnings,
      repaired: false,
      promptVersion: prophrasePromptVersion,
    };
  }

  const repair = await callGemini({
    prompt: buildV2RewriteRepairRequest({
      originalText: text,
      failedCandidate: candidate || first.text.slice(0, 6000),
      tone,
      metadata: request.metadata,
      failures,
    }),
    systemInstruction: request.systemInstruction,
    responseSchema: rewriteResponseSchema,
    maxOutputTokens,
    thinkingLevel: "low",
    timeoutMs: GEMINI_TIMEOUT_MS,
    primaryModel: rewriteModel,
  });
  let repaired;
  try {
    repaired = parseV2RewriteResponse(repair.text);
  } catch {
    throw new AiValidationError(["invalid_repair_schema"]);
  }
  const remainingFailures = validateSemanticInvariants({
    originalText: text,
    outputText: repaired.rewrittenText,
    metadata: request.metadata,
    mode: tone,
  });
  if (remainingFailures.length) {
    throw new AiValidationError(remainingFailures.map((failure) => failure.code));
  }
  return {
    ...repair,
    text: repaired.rewrittenText,
    warnings: repaired.warnings,
    repaired: true,
    promptVersion: prophrasePromptVersion,
    inputTokens: first.inputTokens + repair.inputTokens,
    outputTokens: first.outputTokens + repair.outputTokens,
  };
}

export async function generateOutcomeAssistantWithGemini({
  prompt,
  promptVersion,
  systemInstruction,
  responseSchema,
}: {
  prompt: string;
  promptVersion: string;
  systemInstruction?: string;
  responseSchema?: GeminiJsonSchema;
}) {
  const result = await callGemini({
    prompt,
    systemInstruction,
    responseSchema,
    maxOutputTokens: configuredTokens(
      "OUTCOME_GEMINI_MAX_OUTPUT_TOKENS",
      2800,
      1200,
      5000,
    ),
    thinkingLevel: "medium",
    timeoutMs: OUTCOME_GEMINI_TIMEOUT_MS,
  });
  return { ...result, promptVersion };
}
