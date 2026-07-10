import type { Tone } from "@/lib/tones";
import { buildRewritePrompt, type AiContextMessage } from "@/lib/ai/prompts";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite";
const GEMINI_TIMEOUT_MS = 20_000;

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

function providerUserMessage(statusCode: number, providerStatus?: string) {
  if (statusCode === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    return "Gemini quota is exhausted for this project. Please check your Google AI Studio billing or rate limits, then try again.";
  }

  if (statusCode === 400 || statusCode === 403) {
    return "Gemini is not configured correctly. Please check the API key, model, and project permissions.";
  }

  return "Unable to rewrite message right now. Please try again.";
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
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const prompt = buildRewritePrompt({ text, tone, instruction, contextMessages });
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 360,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as
        | GeminiErrorResponse
        | null;
      const providerStatus = errorBody?.error?.status;
      const providerMessage = errorBody?.error?.message;

      throw new AiProviderError({
        message: `GEMINI_PROVIDER_${response.status}${
          providerStatus ? `_${providerStatus}` : ""
        }${providerMessage ? `: ${providerMessage}` : ""}`,
        providerStatus,
        statusCode: response.status,
        userMessage: providerUserMessage(response.status, providerStatus),
      });
    }

    const data = (await response.json()) as GeminiResponse;
    const result =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter(Boolean)
        .join("")
        .trim() ?? "";

    if (!result) {
      throw new Error("GEMINI_EMPTY_RESPONSE");
    }

    return {
      text: result,
      model,
      inputTokens: 0,
      outputTokens: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
