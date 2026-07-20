import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
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

  const shouldUpdateLastUsed =
    !Number.isFinite(data.last_used_at ? new Date(data.last_used_at).getTime() : 0) ||
    Date.now() - (data.last_used_at ? new Date(data.last_used_at).getTime() : 0) >=
      lastUsedWriteIntervalMs;
  if (shouldUpdateLastUsed) {
    await supabase
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);
  }
  // A valid row is already an authenticated device identity: user_id has a
  // cascading foreign key to auth.users, while revocation and expiry are
  // checked above. Avoid a second remote Auth lookup on every extension call.
  return {
    id: data.user_id,
    aud: "authenticated",
    role: "authenticated",
    email: undefined,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "",
  } as User;
}

export async function revokeExtensionApiToken(token: string) {
  if (!isProPhraseApiToken(token)) return;
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token));
}
