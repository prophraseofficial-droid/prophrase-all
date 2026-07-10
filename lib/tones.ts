export const tones = [
  "Professional",
  "Short & Crisp",
  "Human",
  "Email",
  "Jira Comment",
] as const;

export const TONES = tones;

export type Tone = (typeof tones)[number];

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && tones.includes(value as Tone);
}
