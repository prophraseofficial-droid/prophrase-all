import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeOutcomeAnalytics } from "../lib/outcome-assistant/analytics.ts";
import {
  compareCommitments,
  detectCommitments,
} from "../lib/outcome-assistant/commitments.ts";
import {
  extractLockedFactCandidates,
  extractNumberLikeValues,
  findIntroducedNumbers,
  verifyLockedFacts,
} from "../lib/outcome-assistant/facts.ts";
import { deterministicRisks, sortRisks } from "../lib/outcome-assistant/risks.ts";
import { parseOutcomeAssistantJson } from "../lib/outcome-assistant/schema.ts";

const validResponse = {
  detectedLanguage: "English",
  understoodIntent: "Request additional time because requirements changed",
  variants: [
    {
      id: "safe",
      label: "Safe",
      explanation: "Careful and respectful.",
      message: "Friday is not possible because the scope changed.",
      readerInterpretation: "May sound respectful and clear.",
      risks: [],
      factVerification: [],
      commitmentWarnings: [],
    },
    {
      id: "balanced",
      label: "Balanced",
      explanation: "Natural and professional.",
      message: "The scope changed, so I need more time beyond Friday.",
      readerInterpretation: "Likely to sound confident and cooperative.",
      risks: [],
      factVerification: [],
      commitmentWarnings: [],
    },
    {
      id: "firm",
      label: "Firm",
      explanation: "Direct without being aggressive.",
      message: "Given the scope change, Friday is no longer realistic.",
      readerInterpretation: "May sound direct and serious.",
      risks: [],
      factVerification: [],
      commitmentWarnings: [],
    },
  ],
  globalWarnings: [],
  missingInformation: [],
};

test("extracts locked facts from workplace text", () => {
  const facts = extractLockedFactCandidates(
    "Invoice 458 for ₹25,000 is pending until Friday. PFM-22186 affects Version 7.4.",
  );
  assert.ok(facts.includes("Invoice 458"));
  assert.ok(facts.includes("₹25,000"));
  assert.ok(facts.includes("Friday"));
  assert.ok(facts.includes("PFM-22186"));
  assert.ok(facts.some((fact) => /Version 7\.4/i.test(fact)));
});

test("verifies locked facts exactly", () => {
  assert.deepEqual(
    verifyLockedFacts({
      lockedFacts: ["₹25,000", "Friday"],
      message: "Please confirm ₹25,000 by Friday.",
    }),
    [
      { value: "₹25,000", status: "preserved" },
      { value: "Friday", status: "preserved" },
    ],
  );
  assert.equal(
    verifyLockedFacts({
      lockedFacts: ["₹25,000"],
      message: "Please confirm around ₹20,000.",
    })[0]?.status,
    "missing",
  );
});

test("extracts and compares number-like values", () => {
  assert.ok(extractNumberLikeValues("Version 7.4 is 30% slower").includes("30%"));
  assert.deepEqual(
    findIntroducedNumbers({
      originalText: "Invoice 458 is pending.",
      generatedText: "Invoice 458 is pending for ₹25,000.",
      lockedFacts: ["Invoice 458"],
    }),
    ["₹25,000"],
  );
});

test("detects new commitment warnings", () => {
  const warnings = compareCommitments({
    originalText: "I need to check whether this can be completed by Friday.",
    generatedText: "I will complete this by Friday.",
  });
  assert.ok(warnings.length >= 1);
});

test("does not flag existing commitments that are merely rephrased", () => {
  const warnings = compareCommitments({
    originalText: "I will send the report by Friday.",
    generatedText: "I will share the report by Friday.",
  });
  assert.equal(warnings.length, 0);
});

test("ignores negated promises and questions", () => {
  assert.equal(detectCommitments("I cannot guarantee this by Friday.").length, 0);
  assert.equal(detectCommitments("Can we deliver this by Friday?").length, 0);
});

test("sorts risks by severity", () => {
  const risks = sortRisks([
    {
      type: "robotic_language",
      severity: "low",
      explanation: "Low",
      evidence: "Low",
    },
    {
      type: "changed_fact",
      severity: "high",
      explanation: "High",
      evidence: "High",
    },
  ]);
  assert.equal(risks[0]?.severity, "high");
});

test("adds deterministic risks for missing actions and long SMS messages", () => {
  const risks = deterministicRisks({
    message: "This issue happened.",
    intent: "request",
    channel: "sms",
    introducedNumbers: [],
    hasMissingFact: false,
    hasCommitmentWarning: false,
  });
  assert.ok(risks.some((risk) => risk.type === "missing_action"));
});

test("validates correct structured output and strips markdown fences", () => {
  const parsed = parseOutcomeAssistantJson(
    `\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``,
  );
  assert.equal(parsed.variants.length, 3);
});

test("rejects missing version, duplicate version, invalid severity and empty message", () => {
  assert.throws(() =>
    parseOutcomeAssistantJson(
      JSON.stringify({
        ...validResponse,
        variants: validResponse.variants.slice(0, 2),
      }),
    ),
  );
  assert.throws(() =>
    parseOutcomeAssistantJson(
      JSON.stringify({
        ...validResponse,
        variants: [
          validResponse.variants[0],
          validResponse.variants[0],
          validResponse.variants[2],
        ],
      }),
    ),
  );
  assert.throws(() =>
    parseOutcomeAssistantJson(
      JSON.stringify({
        ...validResponse,
        variants: [
          {
            ...validResponse.variants[0],
            risks: [
              {
                type: "changed_fact",
                severity: "critical",
                explanation: "Bad",
                evidence: "Bad",
              },
            ],
          },
          validResponse.variants[1],
          validResponse.variants[2],
        ],
      }),
    ),
  );
  assert.throws(() =>
    parseOutcomeAssistantJson(
      JSON.stringify({
        ...validResponse,
        variants: [
          { ...validResponse.variants[0], message: "" },
          validResponse.variants[1],
          validResponse.variants[2],
        ],
      }),
    ),
  );
});

test("sanitises analytics metadata", () => {
  const metadata = sanitizeOutcomeAnalytics({
    recipient: "manager",
    intent: "request",
    lockedFactCount: 2,
  });
  assert.deepEqual(metadata, {
    recipient: "manager",
    intent: "request",
    channel: undefined,
    selectedVariant: undefined,
    inputLengthBucket: undefined,
    outputLengthBucket: undefined,
    lockedFactCount: 2,
    riskCount: undefined,
    highestRiskSeverity: undefined,
    generationDurationMs: undefined,
    errorCategory: undefined,
    languageMode: undefined,
  });
});

