import { requireTrustedMutation, requireUser } from "@/lib/security/auth";
import { apiError } from "@/lib/security/validation";

// Kept so installed older clients receive a safe migration response instead of
// creating subscriptions against retired legacy price IDs.
export async function POST(request: Request) {
  const csrfResponse = requireTrustedMutation(request);
  if (csrfResponse) return csrfResponse;
  const { user, response } = await requireUser(request);
  if (!user) return response;
  return apiError(
    "INVALID_PLAN",
    "This checkout version is retired. Open the current ProPhrase pricing page.",
    410,
  );
}
