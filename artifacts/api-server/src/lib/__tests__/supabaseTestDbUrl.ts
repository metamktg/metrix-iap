const POOLER_HOST = "aws-1-us-east-2.pooler.supabase.com";
const POOLER_PORT = 5432;
const FALLBACK_PROJECT_REF = "lqryrmaipryeqtjbxjdh";

/**
 * Resolve the live-test Postgres URL without requiring a second copy of the
 * database password inside a URL secret. Direct Supabase hosts are IPv6-only
 * in this environment, so password-based access uses the Session pooler.
 */
export function resolveSupabaseTestDbUrl(): string | undefined {
  const explicit = process.env.SUPABASE_DB_URL;
  if (explicit) {
    try {
      const host = new URL(explicit).hostname;
      if (!host.endsWith(".supabase.co") || host === POOLER_HOST) return explicit;
    } catch {
      // Fall through to the password-based Session pooler URL.
    }
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) return undefined;

  let projectRef = FALLBACK_PROJECT_REF;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (publicUrl) {
    try {
      projectRef = new URL(publicUrl).hostname.split(".")[0] || projectRef;
    } catch {
      // The checked-in project ref remains the safe fallback.
    }
  }

  return `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${POOLER_HOST}:${POOLER_PORT}/postgres`;
}