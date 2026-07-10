import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import {
  apiError,
  getZodErrorMessage,
  registerDeviceSchema,
  validationError,
} from "@/lib/security/validation";
import { registerDevice } from "@/lib/universal-clipboard";

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const parsed = registerDeviceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  try {
    const supabase = createSupabaseAdminClient();
    await registerDevice({
      supabase,
      userId: user.id,
      deviceId: parsed.data.deviceId,
      label: parsed.data.label,
      platform: parsed.data.platform,
      capabilities: parsed.data.capabilities,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to register device.", 500);
  }
}
