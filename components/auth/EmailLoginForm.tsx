"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  getAuthCallbackUrl,
  storeAuthRedirectContext,
} from "@/lib/app-config";
import {
  getMagicLinkErrorMessage,
  getPasswordLoginErrorMessage,
} from "@/lib/auth/errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function ArrowRight() {
  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function getSafeNextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/workspace";
  }

  return next;
}

export function EmailLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordMode, setPasswordMode] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    setIsLoading(true);
    setError("");
    setStatus("");

    try {
      const supabase = createSupabaseBrowserClient();
      const nextPath = getSafeNextPath();
      if (passwordMode) {
        if (!password) {
          setError("Enter your password.");
          return;
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) throw signInError;
        window.location.assign(nextPath);
        return;
      }
      storeAuthRedirectContext(nextPath);
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: getAuthCallbackUrl(window.location.origin),
        },
      });

      if (signInError) throw signInError;

      setStatus("Check your email for the sign-in link.");
    } catch (caughtError) {
      console.error(passwordMode ? "Unable to sign in with password" : "Unable to send magic link");
      setError(
        passwordMode
          ? getPasswordLoginErrorMessage(caughtError)
          : getMagicLinkErrorMessage(caughtError),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <label
          className="block px-1 text-sm font-medium leading-5 text-primary"
          htmlFor="email"
        >
          Email address
        </label>
        <input
          autoComplete="email"
          className="w-full rounded-full border border-border-subtle bg-white px-5 py-3.5 text-base leading-6 text-primary outline-none transition-all placeholder:text-text-muted focus:border-ai-purple focus:ring-2 focus:ring-ai-purple/20"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          type="email"
          value={email}
        />
      </div>

      {passwordMode ? (
        <div className="space-y-2">
          <label
            className="block px-1 text-sm font-medium leading-5 text-primary"
            htmlFor="password"
          >
            Password
          </label>
          <input
            autoComplete="current-password"
            className="w-full rounded-full border border-border-subtle bg-white px-5 py-3.5 text-base leading-6 text-primary outline-none transition-all placeholder:text-text-muted focus:border-ai-purple focus:ring-2 focus:ring-ai-purple/20"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            type="password"
            value={password}
          />
        </div>
      ) : null}

      <button
        className="group flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-sm font-medium leading-5 text-on-primary transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        disabled={isLoading}
        type="submit"
      >
        {isLoading
          ? passwordMode ? "Signing in..." : "Sending link..."
          : passwordMode ? "Sign in" : "Email me a sign-in link"}
        <ArrowRight />
      </button>

      <button
        className="mx-auto block text-sm font-medium text-text-muted underline decoration-border-subtle underline-offset-4 hover:text-primary"
        disabled={isLoading}
        onClick={() => {
          setPasswordMode((current) => !current);
          setError("");
          setStatus("");
        }}
        type="button"
      >
        {passwordMode ? "Use an email sign-in link" : "Sign in with a password"}
      </button>

      {status ? <p className="text-center text-sm text-green-700">{status}</p> : null}
      {error ? <p className="text-center text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
