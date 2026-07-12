export const tones = [
  "Professional",
  "Polite",
  "Shorter",
  "Short & Crisp",
  "Human",
  "Email",
  "Slack",
  "Teams",
  "Jira Comment",
  "WhatsApp",
  "Client-safe",
  "Manager-friendly",
  "Firmer",
] as const;

export const TONES = tones;

export type Tone = (typeof tones)[number];

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && tones.includes(value as Tone);
}
