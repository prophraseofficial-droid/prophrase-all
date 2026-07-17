"use client";

import { useEffect, useRef, useState } from "react";
import {
  getAuthCallbackUrl,
  getSafeInternalPath,
  storeAuthRedirectContext,
} from "@/lib/app-config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      shape?: "pill" | "rectangular" | "circle" | "square";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      theme?: "outline" | "filled_blue" | "filled_black";
      type?: "standard" | "icon";
      width?: string;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
    prophraseDesktop?: {
      isDesktop: boolean;
      platform: string;
      openExternalAuth: (url: string) => Promise<void>;
    };
  }
}

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function GoogleMark() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleLoginButton() {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    return authError ? "Unable to complete sign-in. Please try again." : "";
  });
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const [fallbackAvailable, setFallbackAvailable] = useState(
    () => typeof window !== "undefined" && Boolean(window.prophraseDesktop?.isDesktop),
  );
  const isDesktop =
    typeof window !== "undefined" && Boolean(window.prophraseDesktop?.isDesktop);

  function getSafeNextPath() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");

    return getSafeInternalPath(next);
  }

  useEffect(() => {
    if (window.prophraseDesktop?.isDesktop) {
      return;
    }
    if (!googleClientId || !googleButtonRef.current) return;

    const clientId = googleClientId;
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setFallbackAvailable(true);
    }, 3500);

    async function handleCredential(response: GoogleCredentialResponse) {
      setIsLoading(true);
      setError("");

      try {
        if (!response.credential) {
          throw new Error("Google did not return an identity token.");
        }

        const supabase = createSupabaseBrowserClient();
        const { error: authError } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
        });

        if (authError) throw authError;

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          throw sessionError ?? new Error("Google sign-in did not create a session.");
        }

        window.location.href = getSafeNextPath();
      } catch {
        setError(
          "Unable to complete Google sign-in. Try the redirect sign-in option below.",
        );
        setFallbackAvailable(true);
        setIsLoading(false);
      }
    }

    function renderGoogleButton() {
      if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) {
        return;
      }

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => void handleCredential(response),
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        shape: "pill",
        size: "large",
        text: "continue_with",
        theme: "outline",
        type: "standard",
        width: "360",
      });
      setGoogleButtonReady(true);
      window.clearTimeout(fallbackTimer);
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimer);
      };
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = renderGoogleButton;
    script.onerror = () => {
      if (!cancelled) {
        setError("Unable to load Google sign-in. Try the redirect sign-in option.");
        setFallbackAvailable(true);
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  async function signInWithGoogle() {
    setIsLoading(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const nextPath = getSafeNextPath();
      storeAuthRedirectContext(nextPath);
      const desktop = window.prophraseDesktop;
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: desktop?.isDesktop
            ? "prophrase://auth/callback"
            : getAuthCallbackUrl(window.location.origin),
          skipBrowserRedirect: Boolean(desktop?.isDesktop),
        },
      });

      if (authError) {
        throw authError;
      }
      if (desktop?.isDesktop) {
        if (!data.url) throw new Error("Google did not return a sign-in URL.");
        await desktop.openExternalAuth(data.url);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to start Google sign-in. Please check configuration.",
      );
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {googleClientId && !isDesktop ? (
        <div className="relative flex min-h-[54px] w-full items-center justify-center overflow-hidden rounded-full">
          {!googleButtonReady ? (
            <span className="text-sm font-medium leading-5 text-text-muted">
              Loading Google...
            </span>
          ) : null}
          <div
            className={googleButtonReady ? "" : "invisible absolute"}
            ref={googleButtonRef}
          />
        </div>
      ) : null}
      {(googleClientId && fallbackAvailable) || isDesktop ? (
        <button
          className="flex w-full items-center justify-center gap-3 rounded-full border border-border-subtle bg-white py-4 text-sm font-medium leading-5 text-primary transition-colors hover:bg-surface active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          disabled={isLoading}
          onClick={() => void signInWithGoogle()}
          type="button"
        >
          <GoogleMark />
          {isLoading
            ? "Opening Google..."
            : isDesktop
              ? "Continue with Google"
              : "Continue with Google redirect"}
        </button>
      ) : null}
      {!googleClientId && !isDesktop ? (
        <button
          className="flex w-full items-center justify-center gap-3 rounded-full border border-border-subtle bg-white py-4 text-sm font-medium leading-5 text-primary transition-colors hover:bg-surface active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          disabled={isLoading}
          onClick={() => void signInWithGoogle()}
          type="button"
        >
          <GoogleMark />
          {isLoading ? "Opening Google..." : "Continue with Google"}
        </button>
      ) : (
        null
      )}
      {error ? <p className="text-center text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
