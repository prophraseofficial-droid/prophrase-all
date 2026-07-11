import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/" &&
    (request.nextUrl.searchParams.has("code") ||
      request.nextUrl.searchParams.has("error") ||
      request.nextUrl.searchParams.has("error_description"))
  ) {
    const finishUrl = request.nextUrl.clone();
    finishUrl.pathname = "/auth/finish";
    if (!finishUrl.searchParams.has("next")) {
      finishUrl.searchParams.set("next", "/workspace");
    }
    return NextResponse.redirect(finishUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sw.js|firebase-messaging-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
