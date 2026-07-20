export const defaultGeminiModel = "gemini-2.5-flash";
export const defaultGeminiRewriteModel = "gemini-3.1-flash-lite";
export const defaultGeminiFallbackModels = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

const freeTierModels = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.1-flash-lite",
]);

export class GeminiModelPolicyError extends Error {
  constructor(model: string) {
    super(`GEMINI_FREE_ONLY_MODEL_NOT_ALLOWED:${model}`);
    this.name = "GeminiModelPolicyError";
  }
}

export function getGeminiModelChain(
  environment: Record<string, string | undefined> = process.env,
  primaryOverride?: string,
) {
  const primary =
    primaryOverride?.trim() || environment.GEMINI_MODEL?.trim() || defaultGeminiModel;
  const configuredFallbacks = environment.GEMINI_FALLBACK_MODELS
    || environment.GEMINI_FALLBACK_MODEL;
  const fallbacks = configuredFallbacks
    ? configuredFallbacks.split(",").map((model) => model.trim()).filter(Boolean)
    : defaultGeminiFallbackModels;
  const models = Array.from(new Set([primary, ...fallbacks])).slice(0, 5);

  if (environment.GEMINI_FREE_ONLY !== "false") {
    for (const model of models) {
      if (!freeTierModels.has(model)) throw new GeminiModelPolicyError(model);
    }
  }

  return models;
}
