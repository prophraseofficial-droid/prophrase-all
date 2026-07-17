"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSafeAuthOrigin, getSafeInternalPath } from "@/lib/app-config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function friendlyAuthError(message: string) {
  if (/code verifier|pkce/i.test(message)) {
    return "This sign-in was started from a different domain or browser session. Start again from the same page you are using now.";
  }

  return message || "Unable to complete sign-in. Please try again.";
}

export function AuthFinishClient() {
  const searchParams = useSearchParams();
  const hasStartedRef = useRef(false);
  const [message, setMessage] = useState("Completing sign-in...");
  const [failed, setFailed] = useState(false);
  const nextPath = useMemo(
    () => getSafeInternalPath(searchParams.get("next")),
    [searchParams],
  );
  const intendedOrigin = useMemo(
    () => getSafeAuthOrigin(searchParams.get("origin")),
    [searchParams],
  );
  const restartHref = `${intendedOrigin ?? ""}/login?next=${encodeURIComponent(nextPath)}`;

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    async function finishAuth() {
      if (intendedOrigin && window.location.origin !== intendedOrigin) {
        window.location.replace(
          `${intendedOrigin}${window.location.pathname}${window.location.search}`,
        );
        return;
      }

      const authError =
        searchParams.get("error_description") ?? searchParams.get("error");
      if (authError) {
        setFailed(true);
        setMessage(friendlyAuthError(authError));
        return;
      }

      const code = searchParams.get("code");
      if (!code) {
        setFailed(true);
        setMessage("No sign-in code was found. Please start sign-in again.");
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) throw error;
        window.location.replace(nextPath);
      } catch (caughtError) {
        setFailed(true);
        setMessage(
          friendlyAuthError(
            caughtError instanceof Error ? caughtError.message : "",
          ),
        );
      }
    }

    void finishAuth();
  }, [intendedOrigin, nextPath, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5">
      <section className="w-full max-w-md rounded-[28px] border border-border-subtle bg-white p-8 text-center shadow-lg">
        <h1 className="mb-3 text-2xl font-semibold text-primary">
          {failed ? "Sign-in needs a fresh start" : "Signing you in"}
        </h1>
        <p className="mb-6 text-sm leading-6 text-text-muted">{message}</p>
        {failed ? (
          <Link
            className="inline-flex rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary"
            href={restartHref}
          >
            Start sign-in again
          </Link>
        ) : null}
      </section>
    </main>
  );
}
