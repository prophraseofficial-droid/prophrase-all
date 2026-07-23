import assert from "node:assert/strict";
import test from "node:test";
import { parseAuthCallback } from "../src/auth-callback.ts";
import {
  resolveRazorpayCheckoutEnabled,
  resolvePublicUrl,
  resolveSupabaseUrl,
} from "../src/config.ts";
import { classifyRewriteError } from "../src/rewrite-error.ts";

const APP_URL = "https://prophrase.in";
const SUPABASE_URL = "https://einsripvtpylhyhxyfsk.supabase.co";
const CALLBACK_URL = "prophrase://auth/callback";

test("production API URLs cannot be redirected by build-time environment values", () => {
  assert.equal(resolvePublicUrl("https://attacker.example", true), APP_URL);
  assert.equal(resolvePublicUrl("https://prophrase.in.attacker.example", true), APP_URL);
  assert.equal(resolvePublicUrl("https://user@attacker.example", true), APP_URL);
  assert.equal(resolvePublicUrl("http://localhost:3000", true), APP_URL);
  assert.equal(resolvePublicUrl("https://prophrase.in/", true), APP_URL);
});

test("development API URLs allow only ProPhrase or private/local origins", () => {
  assert.equal(resolvePublicUrl("http://localhost:3000/", false), "http://localhost:3000");
  assert.equal(resolvePublicUrl("http://192.168.1.20:3000", false), "http://192.168.1.20:3000");
  assert.equal(resolvePublicUrl("https://prophrase.in", false), APP_URL);
  assert.equal(resolvePublicUrl("http://public.example", false), "http://localhost:3000");
  assert.equal(resolvePublicUrl("https://attacker.example", false), "http://localhost:3000");
});

test("production Supabase URL is fixed to the intended project", () => {
  assert.equal(resolveSupabaseUrl("https://attacker.example", true), SUPABASE_URL);
  assert.equal(resolveSupabaseUrl("https://other.supabase.co", true), SUPABASE_URL);
  assert.equal(resolveSupabaseUrl("http://localhost:54321", true), SUPABASE_URL);
});

test("development Supabase configuration fails closed", () => {
  assert.equal(resolveSupabaseUrl(`${SUPABASE_URL}/`, false), SUPABASE_URL);
  assert.equal(resolveSupabaseUrl("http://localhost:54321", false), "http://localhost:54321");
  assert.equal(resolveSupabaseUrl("https://attacker.example", false), "");
  assert.equal(resolveSupabaseUrl("https://project.supabase.co/path", false), "");
  assert.equal(resolveSupabaseUrl(`https://user@${new URL(SUPABASE_URL).hostname}`, false), "");
});

test("native Razorpay checkout is opt-in and cannot be enabled by a truthy-looking value", () => {
  assert.equal(resolveRazorpayCheckoutEnabled(undefined), false);
  assert.equal(resolveRazorpayCheckoutEnabled("false"), false);
  assert.equal(resolveRazorpayCheckoutEnabled("1"), false);
  assert.equal(resolveRazorpayCheckoutEnabled("true"), true);
});

test("auth callback accepts only the exact PKCE callback route", () => {
  assert.deepEqual(parseAuthCallback(`${CALLBACK_URL}?code=one-time-code`, CALLBACK_URL), {
    code: "one-time-code",
  });
  assert.equal(parseAuthCallback("prophrase://settings?code=one-time-code", CALLBACK_URL), null);
  assert.equal(parseAuthCallback("otherapp://auth/callback?code=one-time-code", CALLBACK_URL), null);
  assert.equal(parseAuthCallback("prophrase://auth/other?code=one-time-code", CALLBACK_URL), null);
});

test("auth callback rejects token fragments, missing codes, and provider errors", () => {
  assert.throws(
    () => parseAuthCallback(`${CALLBACK_URL}#access_token=secret&refresh_token=secret`, CALLBACK_URL),
    /Token-bearing authentication callbacks are not accepted/,
  );
  assert.throws(() => parseAuthCallback(CALLBACK_URL, CALLBACK_URL), /Authentication code is missing/);
  assert.throws(
    () => parseAuthCallback(`${CALLBACK_URL}?error=access_denied`, CALLBACK_URL),
    /access_denied/,
  );
});

test("rewrite validation errors are not presented as plan limits", () => {
  const error = Object.assign(new Error("validation failed"), {
    status: 422,
    payload: {
      error: "INVALID_AI_OUTPUT",
      message: "The rewrite could not safely preserve meaning.",
    },
  });
  const notice = classifyRewriteError(error);
  assert.equal(notice.title, "Rewrite needs another try");
  assert.match(notice.hint, /not a plan or credit limit/i);
});

test("actual credit errors retain the plan-limit message", () => {
  const error = Object.assign(new Error("no credits"), {
    status: 402,
    payload: {
      error: "INSUFFICIENT_CREDITS",
      message: "You have no credits remaining.",
    },
  });
  assert.equal(classifyRewriteError(error).title, "Plan limit reached");
});
