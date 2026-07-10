import type { Tone } from "@/lib/tones";
import { buildRewritePrompt as buildStructuredRewritePrompt } from "@/lib/ai/prompts";

export function buildRewritePrompt(text: string, tone: Tone) {
  return buildStructuredRewritePrompt({ text, tone });
}
