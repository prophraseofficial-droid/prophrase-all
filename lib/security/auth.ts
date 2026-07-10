import { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/security/validation";
import { ensureProfileForUser } from "@/lib/usage/usage";

export async function requireUser() {
  try {
    const supabase = await createSupabaseServerClient();
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
