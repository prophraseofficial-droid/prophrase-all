import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthCallbackUrl,
  getSafeAuthOrigin,
  getSafeInternalPath,
} from "../lib/app-config.ts";

test("local auth callbacks stay on the local origin", () => {
  const callback = new URL(
    getAuthCallbackUrl("http://localhost:3000"),
  );

  assert.equal(callback.origin, "http://localhost:3000");
  assert.equal(callback.pathname, "/api/auth/callback");
  assert.equal(callback.search, "");
});

test("auth redirects reject URL-parser slash and control-character tricks", () => {
  assert.equal(getSafeInternalPath("/workspace?tab=history"), "/workspace?tab=history");
  assert.equal(getSafeInternalPath("//evil.example"), "/workspace");
  assert.equal(getSafeInternalPath("/\\evil.example"), "/workspace");
  assert.equal(getSafeInternalPath("/%5cevil.example"), "/workspace");
  assert.equal(getSafeInternalPath("/%0Aevil.example"), "/workspace");
  assert.equal(getSafeInternalPath("https://evil.example"), "/workspace");
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
  assert.equal(getSafeAuthOrigin("http://localhost:3000", true), null);
  assert.equal(getSafeAuthOrigin("https://prophrase.in", true), "https://prophrase.in");
});
