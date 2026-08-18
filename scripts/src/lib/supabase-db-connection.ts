// supabase-db-connection.ts
//
// Resolves a direct Postgres connection string to the Metrix Supabase project.
//
// WHY THIS EXISTS
// Supabase's "Direct connection" string (db.<ref>.supabase.co) resolves to an
// IPv6-only address, which this container cannot route to at all. The only
// reachable connection is the IPv4 Session pooler
// (aws-1-us-east-2.pooler.supabase.com). Asking a human to hand-assemble that
// pooler URL (right host, right "postgres.<ref>" username format, URL-encoded
// password) is error-prone and, for anyone using a screen reader, especially
// hard to verify character-by-character.
//
// So admin scripts resolve the connection string in this order:
//   1. An explicit env var (SUPABASE_DB_URL / SUPABASE_DEV_DB_URL /
//      SUPABASE_PROD_DB_URL) IF it does not point at the unreachable direct
//      host — lets anyone override the target deliberately.
//   2. SUPABASE_DB_PASSWORD alone, combined with the known project ref and
//      pooler host below, to build a working connection string automatically.
//
// Rotating the password later only ever requires updating the single
// SUPABASE_DB_PASSWORD secret (a bare password, not a URL) — nothing else
// in this file needs to change unless the project itself moves.

const PROJECT_REF = "lqryrmaipryeqtjbxjdh";
const POOLER_HOST = "aws-1-us-east-2.pooler.supabase.com";
const POOLER_PORT = 5432;
const UNREACHABLE_HOST_SUFFIX = ".supabase.co"; // Direct connection — IPv6-only, unreachable here.

function buildFromPassword(password: string): string {
  return `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@${POOLER_HOST}:${POOLER_PORT}/postgres`;
}

/**
 * Resolves a working Postgres connection string for the given env var name
 * (e.g. "SUPABASE_DB_URL"), falling back to SUPABASE_DB_PASSWORD + the known
 * pooler host if the env var is unset or points at the unreachable direct host.
 */
export function resolveSupabaseDbUrl(envVarName: string): string | undefined {
  const explicit = process.env[envVarName];
  if (explicit) {
    try {
      const host = new URL(explicit).hostname;
      if (!host.endsWith(UNREACHABLE_HOST_SUFFIX) || host === POOLER_HOST) {
        return explicit;
      }
      // Falls through to the password-based fallback below — the explicit
      // value is the unreachable direct-connection host.
    } catch {
      // Not a parseable URL — fall through to the password-based fallback.
    }
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  if (password) return buildFromPassword(password);

  return undefined;
}
