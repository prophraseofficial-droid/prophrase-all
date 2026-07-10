import type { SupabaseClient } from "@supabase/supabase-js";
import type { UniversalClipboardItem } from "@/lib/db/types";

export type UniversalClipboardMetadata = {
  id: string;
  sourceDeviceId: string;
  sourceDeviceLabel: string;
  preview: string;
  status: UniversalClipboardItem["status"];
  claimedByDeviceId: string | null;
  claimedByDeviceLabel: string | null;
  claimedAt: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
};

export function buildClipboardPreview(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 96 ? `${compact.slice(0, 93)}...` : compact;
}

export function toClipboardMetadata(
  item: Pick<
    UniversalClipboardItem,
    | "id"
    | "source_device_id"
    | "source_device_label"
    | "preview"
    | "status"
    | "claimed_by_device_id"
    | "claimed_by_device_label"
    | "claimed_at"
    | "expires_at"
    | "created_at"
  >,
): UniversalClipboardMetadata {
  const isExpired =
    item.status === "expired" || new Date(item.expires_at).getTime() <= Date.now();

  return {
    id: item.id,
    sourceDeviceId: item.source_device_id,
    sourceDeviceLabel: item.source_device_label,
    preview: item.preview,
    status: isExpired && item.status === "available" ? "expired" : item.status,
    claimedByDeviceId: item.claimed_by_device_id,
    claimedByDeviceLabel: item.claimed_by_device_label,
    claimedAt: item.claimed_at,
    expiresAt: item.expires_at,
    createdAt: item.created_at,
    isExpired,
  };
}

export async function registerDevice({
  supabase,
  userId,
  deviceId,
  label,
  platform,
  capabilities,
}: {
  supabase: SupabaseClient;
  userId: string;
  deviceId: string;
  label: string;
  platform: string;
  capabilities: string[];
}) {
  const { error } = await supabase.from("devices").upsert(
    {
      id: deviceId,
      user_id: userId,
      label,
      platform,
      capabilities,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,id" },
  );

  if (error) throw error;
}
