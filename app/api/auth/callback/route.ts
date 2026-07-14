import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_NEXT_COOKIE, getSafeAuthOrigin } from "@/lib/app-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value) {
    return "/workspace";
  }

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) {
      return "/workspace";
    }
    return decoded;
  } catch {
    return "/workspace";
  }
}

function authFinishUrl(requestUrl: URL, next: string) {
  const finishUrl = new URL("/auth/finish", requestUrl.origin);
  requestUrl.searchParams.forEach((value, key) => {
    finishUrl.searchParams.set(key, value);
  });
  finishUrl.searchParams.set("next", next);
  return finishUrl;
}

function isMissingPkceVerifier(errorMessage: string) {
  return /code verifier|pkce/i.test(errorMessage);
}

function redirectAndClearAuthContext(url: URL) {
  const response = NextResponse.redirect(url);
  response.cookies.delete(AUTH_NEXT_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const intendedOrigin = getSafeAuthOrigin(requestUrl.searchParams.get("origin"));

  if (intendedOrigin && intendedOrigin !== requestUrl.origin) {
    const correctedUrl = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      intendedOrigin,
    );
    return NextResponse.redirect(correctedUrl);
  }

  const code = requestUrl.searchParams.get("code");
  const authError =
    requestUrl.searchParams.get("error_description") ||
    requestUrl.searchParams.get("error");
  const next = safeNextPath(
    requestUrl.searchParams.get("next") ??
      request.cookies.get(AUTH_NEXT_COOKIE)?.value ??
      null,
  );

  if (authError) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("auth_error", authError);
    return redirectAndClearAuthContext(loginUrl);
  }

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        if (isMissingPkceVerifier(error.message)) {
          return NextResponse.redirect(authFinishUrl(requestUrl, next));
        }

        const loginUrl = new URL("/login", requestUrl.origin);
        loginUrl.searchParams.set("auth_error", error.message);
        return redirectAndClearAuthContext(loginUrl);
      }
    } catch {
      const loginUrl = new URL("/login", requestUrl.origin);
      loginUrl.searchParams.set("auth_error", "Unable to complete sign-in.");
      return redirectAndClearAuthContext(loginUrl);
    }
  }

  return redirectAndClearAuthContext(new URL(next, requestUrl.origin));
}
