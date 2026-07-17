import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  getZodErrorMessage,
  universalClipboardClaimSchema,
  uuidSchema,
  validationError,
} from "@/lib/security/validation";
import {
  registerDevice,
  toClipboardMetadata,
} from "@/lib/universal-clipboard";

type RouteContext = {
  params: Promise<{
    clipId: string;
  }>;
};

const claimSelect =
  "id, source_device_id, source_device_label, payload, preview, status, claimed_by_device_id, claimed_by_device_label, claimed_at, expires_at, created_at";

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (!user) return response;

  const { clipId } = await context.params;
  const parsedClipId = uuidSchema.safeParse(clipId);
  if (!parsedClipId.success) {
    return validationError("Invalid clipboard item.");
  }

  const rateLimit = checkRateLimit(`universal-clipboard:claim:${user.id}`, 60, 60_000);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many paste requests. Please try again shortly.",
      429,
      { retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
  }

  const parsed = universalClipboardClaimSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    await registerDevice({
      supabase,
      userId: user.id,
      deviceId: parsed.data.deviceId,
      label: parsed.data.deviceLabel,
      platform: parsed.data.platform,
      capabilities: ["universal-paste"],
    });

    const { data: claimed, error: claimError } = await supabase
      .from("universal_clipboard_items")
      .update({
        status: "claimed",
        claimed_by_device_id: parsed.data.deviceId,
        claimed_by_device_label: parsed.data.deviceLabel,
        claimed_at: now,
      })
      .eq("id", parsedClipId.data)
      .eq("user_id", user.id)
      .eq("status", "available")
      .gt("expires_at", now)
      .select(claimSelect)
      .maybeSingle();

    if (claimError) throw claimError;

    if (claimed) {
      return NextResponse.json({
        item: toClipboardMetadata(claimed),
        text: claimed.payload,
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from("universal_clipboard_items")
      .select(claimSelect)
      .eq("id", parsedClipId.data)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return apiError("CLIPBOARD_NOT_FOUND", "Universal copy not found.", 404);
    }
    if (new Date(existing.expires_at).getTime() <= Date.now()) {
      return apiError("CLIPBOARD_EXPIRED", "This universal copy has expired.", 410, {
        item: toClipboardMetadata(existing),
      });
    }

    return apiError(
      "CLIPBOARD_ALREADY_CLAIMED",
      existing.claimed_by_device_label
        ? `Already claimed on ${existing.claimed_by_device_label}.`
        : "Already claimed on another device.",
      409,
      { item: toClipboardMetadata(existing) },
    );
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to claim universal copy.", 500);
  }
}
