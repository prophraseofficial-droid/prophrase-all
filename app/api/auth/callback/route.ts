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
