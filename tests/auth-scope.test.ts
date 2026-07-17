import assert from "node:assert/strict";
import test from "node:test";
import { isExtensionTokenRouteAllowed } from "../lib/security/auth-scope.ts";

function request(path: string) {
  return new Request(`https://prophrase.in${path}`);
}

test("device tokens are limited to extension product APIs", () => {
  assert.equal(isExtensionTokenRouteAllowed(request("/api/v1/rephrase")), true);
  assert.equal(isExtensionTokenRouteAllowed(request("/api/v1/credits")), true);
  assert.equal(isExtensionTokenRouteAllowed(request("/api/universal-clipboard")), true);
  assert.equal(
    isExtensionTokenRouteAllowed(
      request("/api/universal-clipboard/8b531921-6f0d-4d23-a7e0-096aad446d74/claim"),
    ),
    true,
  );

  assert.equal(isExtensionTokenRouteAllowed(request("/api/threads")), false);
  assert.equal(isExtensionTokenRouteAllowed(request("/api/workspace/bootstrap")), false);
  assert.equal(isExtensionTokenRouteAllowed(request("/api/billing/cancel")), false);
  assert.equal(isExtensionTokenRouteAllowed(request("/api/user/preferences")), false);
});
