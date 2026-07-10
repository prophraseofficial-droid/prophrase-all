import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY: this client uses the Supabase service role key and bypasses RLS.
// Never import this file from Client Components or browser-executed code.
let adminClient: SupabaseClient | null = null;

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are not configured.");
  }

  adminClient ??= createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
