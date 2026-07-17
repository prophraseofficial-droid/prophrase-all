import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getSafeExternalUrl } = require("../desktop/security.cjs") as {
  getSafeExternalUrl(value: string): string | null;
};

test("desktop external navigation allows only safe user-facing schemes", () => {
  assert.equal(getSafeExternalUrl("https://example.com/help"), "https://example.com/help");
  assert.equal(getSafeExternalUrl("mailto:help@prophrase.in"), "mailto:help@prophrase.in");
  assert.equal(getSafeExternalUrl("http://example.com"), null);
  assert.equal(getSafeExternalUrl("file:///etc/passwd"), null);
  assert.equal(getSafeExternalUrl("prophrase://auth/callback?code=secret"), null);
  assert.equal(getSafeExternalUrl("https://user@example.com/help"), null);
});
