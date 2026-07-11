import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/workspace";
  }

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) {
      return "/workspace";
    }
  } catch {
    return "/workspace";
  }

  return value;
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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const authError =
    requestUrl.searchParams.get("error_description") ||
    requestUrl.searchParams.get("error");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (authError) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("auth_error", authError);
    return NextResponse.redirect(loginUrl);
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
        return NextResponse.redirect(loginUrl);
      }
    } catch {
      const loginUrl = new URL("/login", requestUrl.origin);
      loginUrl.searchParams.set("auth_error", "Unable to complete sign-in.");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
