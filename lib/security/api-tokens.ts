import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const tokenPrefix = "ppx_";
const tokenLifetimeMs = 365 * 24 * 60 * 60 * 1000;
const lastUsedWriteIntervalMs = 15 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isProPhraseApiToken(token: string) {
  return token.startsWith(tokenPrefix) && token.length >= 40;
}

export async function createExtensionApiToken(userId: string, name: string) {
  const token = `${tokenPrefix}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + tokenLifetimeMs).toISOString();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("api_tokens").insert({
    user_id: userId,
    name,
    token_hash: hashToken(token),
    token_prefix: token.slice(0, 12),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token, expiresAt };
}

export async function authenticateExtensionApiToken(token: string) {
  if (!isProPhraseApiToken(token)) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, user_id, expires_at, revoked_at, last_used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(data.user_id);
  if (userError || !userData.user) return null;
  const lastUsedAt = data.last_used_at
    ? new Date(data.last_used_at).getTime()
    : 0;
  if (!Number.isFinite(lastUsedAt) || Date.now() - lastUsedAt >= lastUsedWriteIntervalMs) {
    await supabase
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);
  }
  return userData.user;
}

export async function revokeExtensionApiToken(token: string) {
  if (!isProPhraseApiToken(token)) return;
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token));
}
