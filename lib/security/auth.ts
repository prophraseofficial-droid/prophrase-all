import {
  createSupabaseBearerClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { apiError } from "@/lib/security/validation";
import { ensureProfileForUser } from "@/lib/usage/usage";

function getBearerToken(request?: Request) {
  const authorization = request?.headers.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function requireUser(request?: Request) {
  try {
    const bearerToken = getBearerToken(request);
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
