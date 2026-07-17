import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublicUrl } from "../mobile/src/config.ts";

test("mobile production endpoints cannot downgrade bearer traffic to HTTP", () => {
  assert.equal(resolvePublicUrl("https://api.example.com", true), "https://api.example.com");
  assert.equal(resolvePublicUrl("http://api.example.com", true), "https://prophrase.in");
  assert.equal(resolvePublicUrl("http://localhost:3000", true), "https://prophrase.in");
  assert.equal(resolvePublicUrl("http://localhost:3000", false), "http://localhost:3000");
  assert.equal(resolvePublicUrl("not a url", true), "https://prophrase.in");
});
