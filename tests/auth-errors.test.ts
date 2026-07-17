import assert from "node:assert/strict";
import test from "node:test";
import { getMagicLinkErrorMessage } from "../lib/auth/errors.ts";

test("maps magic-link provider and rate-limit errors to useful messages", () => {
  assert.match(
    getMagicLinkErrorMessage({ code: "over_email_send_rate_limit", status: 429 }),
    /60 seconds/,
  );
  assert.match(
    getMagicLinkErrorMessage({ code: "email_address_not_authorized", status: 403 }),
    /not authorized/,
  );
});

test("replaces opaque SMTP failures with configuration guidance", () => {
  assert.match(
    getMagicLinkErrorMessage({ code: "unexpected_failure", message: "{}", status: 500 }),
    /SMTP credentials/,
  );
  assert.match(getMagicLinkErrorMessage(new Error("{}")), /verified sender domain/);
});

test("preserves specific non-opaque authentication messages", () => {
  assert.equal(
    getMagicLinkErrorMessage(new Error("Email sign-in is temporarily unavailable.")),
    "Email sign-in is temporarily unavailable.",
  );
});
