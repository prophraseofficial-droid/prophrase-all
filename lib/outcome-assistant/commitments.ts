import type { CommitmentWarning } from "./types";

type CommitmentCategory = CommitmentWarning["type"];

type CommitmentMatch = {
  category: CommitmentCategory;
  evidence: string;
  normalized: string;
};

const sentencePattern = /[^.!?\n]+[.!?]?/g;
const negationPattern =
  /\b(?:cannot|can't|cant|won't|will not|not able|unable|not sure|need to check|whether|if possible)\b/i;
const questionPattern = /\?\s*$/;

const commitmentPatterns: Array<{
  category: CommitmentCategory;
  pattern: RegExp;
}> = [
  {
    category: "new_guarantee",
    pattern: /\b(?:guarantee|promise|definitely|without fail|assure)\b/i,
  },
  {
    category: "new_deadline",
    pattern:
      /\b(?:by|before)\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|the deadline|\d{1,2}\s+[a-z]+)\b/i,
  },
  {
    category: "new_ownership",
    pattern: /\b(?:i|we)\s+(?:will|shall|can)\s+(?:complete|deliver|finish|send|fix|resolve|handle|take care)\b/i,
  },
  {
    category: "new_commitment",
    pattern: /\b(?:i|we)\s+(?:will|shall|confirm|commit|can complete|can deliver)\b/i,
  },
];

function sentences(text: string) {
  return Array.from(text.matchAll(sentencePattern), (match) => match[0].trim()).filter(
    Boolean,
  );
}

function isNegatedOrQuestion(sentence: string) {
  return negationPattern.test(sentence) || questionPattern.test(sentence.trim());
}

export function detectCommitments(text: string): CommitmentMatch[] {
  return sentences(text).flatMap((sentence) => {
    if (isNegatedOrQuestion(sentence)) return [];

    return commitmentPatterns
      .filter(({ pattern }) => pattern.test(sentence))
      .map(({ category }) => ({
        category,
        evidence: sentence,
        normalized: `${category}:${sentence.toLowerCase().replace(/\s+/g, " ")}`,
      }));
  });
}

export function compareCommitments({
  originalText,
  generatedText,
}: {
  originalText: string;
  generatedText: string;
}): CommitmentWarning[] {
  const originalCategories = new Set(
    detectCommitments(originalText).map((match) => match.category),
  );

  return detectCommitments(generatedText)
    .filter((match) => !originalCategories.has(match.category))
    .map((match) => ({
      type: match.category,
      severity: match.category === "new_guarantee" ? "high" : "medium",
      explanation:
        "The rewritten message may create a commitment that was not clearly present in the original message.",
      evidence: match.evidence,
    }));
}
