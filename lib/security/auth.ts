import {
  createSupabaseBearerClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { apiError } from "@/lib/security/validation";
import { ensureProfileForUser } from "@/lib/usage/usage";
import {
  authenticateExtensionApiToken,
  isProPhraseApiToken,
} from "@/lib/security/api-tokens";
import { isExtensionTokenRouteAllowed } from "@/lib/security/auth-scope";

function getBearerToken(request?: Request) {
  const authorization = request?.headers.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export function requireTrustedMutation(request: Request) {
  if (getBearerToken(request)) return null;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const expectedOrigin = new URL(request.url).origin;
  if (origin === expectedOrigin || (!origin && fetchSite === "same-origin")) return null;
  return apiError("UNAUTHORIZED", "This request did not originate from ProPhrase.", 403);
}

export async function requireUser(request?: Request) {
  try {
    const bearerToken = getBearerToken(request);
    if (bearerToken && isProPhraseApiToken(bearerToken)) {
      if (!isExtensionTokenRouteAllowed(request)) {
        return {
          user: null,
          response: apiError(
            "UNAUTHORIZED",
            "This ProPhrase device token is not permitted for that account operation.",
            403,
          ),
        };
      }
      const user = await authenticateExtensionApiToken(bearerToken);
      if (!user) {
        return {
          user: null,
          response: apiError("UNAUTHORIZED", "This ProPhrase device token is invalid, expired, or revoked.", 401),
        };
      }
      // Device tokens are issued only after the signed-in flow has ensured the
      // profile. Avoid repeating that remote upsert on every extension call.
      return { user, response: null };
    }
    const supabase = bearerToken
      ? createSupabaseBearerClient(bearerToken)
      : await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        user: null,
        response: apiError("UNAUTHORIZED", "Please sign in to continue.", 401),
      };
    }

    await ensureProfileForUser(user);
    return { user, response: null };
  } catch {
    return {
      user: null,
      response: apiError(
        "CONFIGURATION_ERROR",
        "Authentication is not configured.",
        500,
      ),
    };
  }
}
