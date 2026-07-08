import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key (never exposed to
 * the browser). NEXT_PUBLIC_SUPABASE_URL may be stored without a scheme —
 * normalize before use.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const rawUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!rawUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  const url = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
