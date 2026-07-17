import assert from "node:assert/strict";
import test from "node:test";
import { readTextBodyWithLimit } from "../lib/security/request-body.ts";

test("bounded body reader rejects oversized chunked requests", async () => {
  const encoder = new TextEncoder();
  const request = new Request("https://prophrase.in/api/webhooks/razorpay", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("12345"));
        controller.enqueue(encoder.encode("67890"));
        controller.close();
      },
    }),
    // Required by Node when a ReadableStream is used as a request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  assert.deepEqual(await readTextBodyWithLimit(request, 8), {
    ok: false,
    reason: "too_large",
  });
});

test("bounded body reader preserves an allowed UTF-8 payload", async () => {
  const request = new Request("https://prophrase.in/api/webhooks/razorpay", {
    method: "POST",
    body: '{"event":"payment.captured"}',
  });
  assert.deepEqual(await readTextBodyWithLimit(request, 100), {
    ok: true,
    text: '{"event":"payment.captured"}',
  });
});
