// check-db-credentials.ts
//
// Preflight for the Supabase direct-Postgres credential, for use immediately
// after a password rotation (docs/resources/METRIX_DB_Password_Rotation_Runbook.md).
//
// The failure this exists to catch: Supabase's UI shows the DIRECT connection
// string (db.<ref>.supabase.co) by default, and that host is IPv6-only and
// unreachable from Replit and CI containers. resolveSupabaseDbUrl() detects
// that and silently falls through to the SUPABASE_DB_PASSWORD path — so
// pasting the direct string into SUPABASE_DB_URL and setting nothing else
// leaves every admin script failing with a message about a secret the operator
// believes they just set correctly. That is a confusing five minutes this
// script turns into one line.
//
// PRINTS NO CREDENTIAL MATERIAL. Passwords are never read into output; URLs
// are reduced to host and port before display. Safe to run in a shared
// terminal, paste into chat, or attach to a ticket.
//
// Exit codes:
//   0  — a connection string resolved AND authenticated
//   1  — nothing resolved, or the credential was rejected
//
// Usage:
//   pnpm --filter @workspace/scripts run check:db-credentials

import pg from "pg";
import { resolveSupabaseDbUrl } from "./lib/supabase-db-connection.js";

const DIRECT_HOST_HINT = ".supabase.co";

/** Host:port only — never userinfo, never the password. */
function safeLocation(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(unparseable connection string)";
  }
}

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(34)} ${value}`);
}

async function main(): Promise<number> {
  console.log("\nSupabase direct-Postgres credential preflight\n");

  const rawUrl = process.env["SUPABASE_DB_URL"];
  const rawPassword = process.env["SUPABASE_DB_PASSWORD"];

  line("SUPABASE_DB_URL", rawUrl ? `set → ${safeLocation(rawUrl)}` : "not set");
  line("SUPABASE_DB_PASSWORD", rawPassword ? "set (value not shown)" : "not set");

  if (rawUrl && safeLocation(rawUrl).includes(DIRECT_HOST_HINT)) {
    console.log(
      "\n  NOTE  SUPABASE_DB_URL points at the DIRECT host, which is IPv6-only and\n" +
        "        unreachable from Replit and CI. It will be ignored in favour of\n" +
        "        SUPABASE_DB_PASSWORD. Either set that bare password, or replace this\n" +
        "        value with the Session pooler string from\n" +
        "        Supabase → Project Settings → Database → Connection string → Session pooler.",
    );
  }

  const resolved = resolveSupabaseDbUrl("SUPABASE_DB_URL");
  if (!resolved) {
    console.error(
      "\nFAIL  No usable connection string resolved.\n" +
        "      Set SUPABASE_DB_PASSWORD to the bare password (recommended — the pooler\n" +
        "      URL is then assembled for you), or set SUPABASE_DB_URL to the Session\n" +
        "      pooler connection string.",
    );
    return 1;
  }

  const viaFallback = !rawUrl || resolved !== rawUrl;
  line("resolved via", viaFallback ? "SUPABASE_DB_PASSWORD + pooler host" : "SUPABASE_DB_URL as given");
  line("connecting to", safeLocation(resolved));

  const client = new pg.Client({
    connectionString: resolved,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    const { rows } = await client.query(
      "select current_user as usr, current_database() as db, " +
        "(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
        " where n.nspname='public' and c.relkind='r') as tables",
    );
    const r = rows[0] as { usr: string; db: string; tables: string };
    line("authenticated as", `${r.usr} on ${r.db}`);
    line("public tables visible", String(r.tables));
    console.log("\nPASS  Credential is valid and the schema is reachable.\n");
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish "wrong password" from "cannot route to host" — they have
    // completely different fixes and the raw driver error buries the difference.
    const authFailure = /password authentication failed|SASL|authentication/i.test(msg);
    const routeFailure = /ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT|timeout/i.test(msg);
    console.error(`\nFAIL  ${msg}`);
    if (authFailure) {
      console.error(
        "      The host was reachable but rejected the credential — the stored secret\n" +
          "      does not match the current database password. Re-copy it from\n" +
          "      Supabase → Project Settings → Database after resetting.",
      );
    } else if (routeFailure) {
      console.error(
        "      The host could not be reached at all. This is the IPv6 direct-host trap:\n" +
          "      use the Session pooler string (aws-*.pooler.supabase.com), not\n" +
          "      db.<ref>.supabase.co.",
      );
    }
    return 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().then((code) => process.exit(code));
