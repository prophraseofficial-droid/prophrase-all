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

test("mobile development endpoints allow private LAN devices without weakening production", () => {
  assert.equal(resolvePublicUrl("http://192.168.1.10:3000", false), "http://192.168.1.10:3000");
  assert.equal(resolvePublicUrl("http://10.0.0.8:3000", false), "http://10.0.0.8:3000");
  assert.equal(resolvePublicUrl("http://172.20.10.2:3000", false), "http://172.20.10.2:3000");
  assert.equal(resolvePublicUrl("http://192.168.1.10:3000", true), "https://prophrase.in");
  assert.equal(resolvePublicUrl("http://example.com:3000", false), "http://localhost:3000");
});
