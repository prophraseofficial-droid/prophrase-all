import assert from "node:assert/strict";
import test from "node:test";
import {
  isOutcomeAssistantClientEnabled,
  isOutcomeAssistantEnabled,
} from "../lib/feature-flags.ts";

test("Outcome Assistant ships enabled without deployment flags", () => {
  const client = process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED;
  const server = process.env.OUTCOME_ASSISTANT_ENABLED;
  delete process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED;
  delete process.env.OUTCOME_ASSISTANT_ENABLED;

  try {
    assert.equal(isOutcomeAssistantClientEnabled(), true);
    assert.equal(isOutcomeAssistantEnabled(), true);
  } finally {
    if (client === undefined) delete process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED;
    else process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED = client;
    if (server === undefined) delete process.env.OUTCOME_ASSISTANT_ENABLED;
    else process.env.OUTCOME_ASSISTANT_ENABLED = server;
  }
});

test("legacy false values do not hide the released Outcome Assistant", () => {
  process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED = "false";
  process.env.OUTCOME_ASSISTANT_ENABLED = "false";
  assert.equal(isOutcomeAssistantEnabled(), true);
});

test("Outcome Assistant can still be explicitly disabled", () => {
  process.env.NEXT_PUBLIC_OUTCOME_ASSISTANT_ENABLED = "disabled";
  process.env.OUTCOME_ASSISTANT_ENABLED = "disabled";
  assert.equal(isOutcomeAssistantClientEnabled(), false);
  assert.equal(isOutcomeAssistantEnabled(), false);
});
