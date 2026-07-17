import type { FactVerification } from "./types";

const factPatterns: RegExp[] = [
  /\b[A-Z]{2,10}-\d{2,8}\b/g,
  /\b(?:invoice|order|ticket|case|ref)\s*#?\s*[A-Z0-9-]{2,}\b/gi,
  /\bversion\s+\d+(?:\.\d+){0,3}\b/gi,
  /\bv?\d+(?:\.\d+){1,3}\b/g,
  /₹\s?\d[\d,]*(?:\.\d+)?/g,
  /\b(?:Rs\.?|INR|USD|EUR|GBP)\s?\d[\d,]*(?:\.\d+)?\b/gi,
  /\b\d+(?:\.\d+)?%/g,
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|AM|PM)\b/g,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\b/gi,
  /\b(?:today|tomorrow|yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|EOD)\b/gi,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g,
  /\b[A-Z][A-Za-z0-9]+(?:\s+(?:Alpha|Beta|Project|App|API|Service|Platform))\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bhttps?:\/\/[^\s)]+/gi,
  /\b\+?\d[\d\s-]{7,}\d\b/g,
];

const numberLikePattern =
  /(?:₹\s?)?\b\d[\d,]*(?:\.\d+)?(?:%|\s?(?:am|pm|AM|PM))?|(?:Rs\.?|INR|USD|EUR|GBP)\s?\d[\d,]*(?:\.\d+)?/g;

// The capitalized-name pattern also sees ordinary words at the start of a
// sentence. These words may be legitimately removed or restructured by a
// rewrite and must not become exact-match protected facts.
const genericCapitalizedWords = new Set([
  "a", "an", "the", "my", "our", "your", "his", "her", "its", "their",
  "we", "you", "he", "she", "it", "they", "this", "that", "these", "those",
  "hi", "hello", "hey", "dear", "thanks", "thank", "please",
  "can", "could", "will", "would", "may", "might", "should",
]);

function cleanFact(value: string) {
  return value.trim().replace(/^[,.;:()[\]{}"']+|[,.;:()[\]{}"']+$/g, "");
}

export function dedupeValues(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  values.forEach((rawValue) => {
    const value = cleanFact(rawValue);
    const key = value.toLowerCase();
    if (!value || value.length > 80 || seen.has(key)) return;
    seen.add(key);
    deduped.push(value);
  });

  return deduped;
}

export function extractLockedFactCandidates(text: string) {
  if (!text.trim()) return [];
  const values = factPatterns.flatMap((pattern) =>
    Array.from(text.matchAll(pattern), (match) => match[0]),
  );

  return dedupeValues(values)
    .filter((value) => value.includes(" ") || !genericCapitalizedWords.has(value.toLowerCase()))
    .slice(0, 18);
}

export function extractNumberLikeValues(text: string) {
  return dedupeValues(Array.from(text.matchAll(numberLikePattern), (match) => match[0]));
}

export function verifyLockedFacts({
  lockedFacts,
  message,
}: {
  lockedFacts: string[];
  message: string;
}): FactVerification[] {
  return dedupeValues(lockedFacts).map((value) => ({
    value,
    status: message.includes(value) ? "preserved" : "missing",
  }));
}

export function findIntroducedNumbers({
  originalText,
  generatedText,
  lockedFacts,
}: {
  originalText: string;
  generatedText: string;
  lockedFacts: string[];
}) {
  const allowed = new Set(
    [...extractNumberLikeValues(originalText), ...lockedFacts].map((value) =>
      value.toLowerCase(),
    ),
  );

  return extractNumberLikeValues(generatedText).filter(
    (value) => !allowed.has(value.toLowerCase()),
  );
}
