import assert from "node:assert/strict";
import test from "node:test";
import { getSafeExtensionRedirect } from "../lib/extension/connect.ts";

test("the published Chrome Web Store callback is always accepted exactly", () => {
  const callback = "https://pmfgmjobfpmlnpkenehibfhmahgbgpmn.chromiumapp.org/connected";
  const officialOrigin = new URL(callback).origin;
  assert.equal(getSafeExtensionRedirect(callback), callback);
  assert.equal(
    getSafeExtensionRedirect(
      "https://pmfgmjobfpmlnpkenehibfhmahgbgpmn.chromiumapp.org.evil.test/connected",
      [officialOrigin],
    ),
    null,
  );
  assert.equal(
    getSafeExtensionRedirect(
      "https://pmfgmjobfpminpkenehibfhmahgbgpmn.chromiumapp.org/connected",
      [officialOrigin],
    ),
    null,
  );
});

test("extension callbacks require an exact configured origin and callback path", () => {
  const allowed = ["https://abcdefghijklmnop.chromiumapp.org"];
  assert.equal(
    getSafeExtensionRedirect("https://abcdefghijklmnop.chromiumapp.org/connected", allowed),
    "https://abcdefghijklmnop.chromiumapp.org/connected",
  );
  assert.equal(
    getSafeExtensionRedirect("https://other.chromiumapp.org/connected", allowed),
    null,
  );
  assert.equal(
    getSafeExtensionRedirect("https://abcdefghijklmnop.chromiumapp.org/not-connected", allowed),
    null,
  );
});

test("extension callbacks reject credentials and lookalike domains", () => {
  const allowed = ["https://abcdefghijklmnop.chromiumapp.org"];
  assert.equal(
    getSafeExtensionRedirect("https://user@abcdefghijklmnop.chromiumapp.org/connected", allowed),
    null,
  );
  assert.equal(
    getSafeExtensionRedirect("https://abcdefghijklmnop.chromiumapp.org.evil.test/connected", allowed),
    null,
  );
});
