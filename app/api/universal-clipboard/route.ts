import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  apiError,
  deviceIdSchema,
  getZodErrorMessage,
  universalClipboardCreateSchema,
  validationError,
} from "@/lib/security/validation";
import {
  buildClipboardPreview,
  registerDevice,
  toClipboardMetadata,
} from "@/lib/universal-clipboard";

const metadataSelect =
  "id, source_device_id, source_device_label, preview, status, claimed_by_device_id, claimed_by_device_label, claimed_at, expires_at, created_at";

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const url = new URL(request.url);
  const parsedDeviceId = deviceIdSchema.safeParse(url.searchParams.get("deviceId"));
  if (!parsedDeviceId.success) {
    return validationError("A valid device id is required.");
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    await supabase
      .from("devices")
      .update({ last_seen_at: now })
      .eq("user_id", user.id)
      .eq("id", parsedDeviceId.data);

    const { data, error } = await supabase
      .from("universal_clipboard_items")
      .select(metadataSelect)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      item: data ? toClipboardMetadata(data) : null,
      serverTime: now,
    });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to load universal clipboard.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const rateLimit = checkRateLimit(`universal-clipboard:create:${user.id}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many universal copy requests. Please try again shortly.",
      429,
      { retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
  }

  const parsed = universalClipboardCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return validationError(getZodErrorMessage(parsed.error));
  }

  try {
    const supabase = createSupabaseAdminClient();
    const expiresAt = new Date(
      Date.now() + parsed.data.expiresInSeconds * 1000,
    ).toISOString();

    await registerDevice({
      supabase,
      userId: user.id,
      deviceId: parsed.data.deviceId,
      label: parsed.data.deviceLabel,
      platform: "web",
      capabilities: ["universal-copy"],
    });

    const { data, error } = await supabase
      .from("universal_clipboard_items")
      .insert({
        user_id: user.id,
        source_device_id: parsed.data.deviceId,
        source_device_label: parsed.data.deviceLabel,
        payload: parsed.data.text,
        preview: buildClipboardPreview(parsed.data.text),
        expires_at: expiresAt,
      })
      .select(metadataSelect)
      .single();

    if (error || !data) throw error;

    return NextResponse.json({ item: toClipboardMetadata(data) });
  } catch {
    return apiError("INTERNAL_ERROR", "Unable to create universal copy.", 500);
  }
}
