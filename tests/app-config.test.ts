import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthCallbackUrl,
  getSafeAuthOrigin,
} from "../lib/app-config.ts";

test("local auth callbacks stay on the local origin", () => {
  const callback = new URL(
    getAuthCallbackUrl("http://localhost:3000"),
  );

  assert.equal(callback.origin, "http://localhost:3000");
  assert.equal(callback.pathname, "/api/auth/callback");
  assert.equal(callback.search, "");
});

test("production auth callbacks stay on the production origin", () => {
  const callback = new URL(
    getAuthCallbackUrl("https://prophrase.in"),
  );

  assert.equal(callback.origin, "https://prophrase.in");
  assert.equal(callback.pathname, "/api/auth/callback");
  assert.equal(callback.search, "");
});

test("auth recovery accepts only known application origins", () => {
  assert.equal(getSafeAuthOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(getSafeAuthOrigin("https://prophrase.in"), "https://prophrase.in");
  assert.equal(getSafeAuthOrigin("https://evil.example"), null);
  assert.equal(getSafeAuthOrigin("not a URL"), null);
});
