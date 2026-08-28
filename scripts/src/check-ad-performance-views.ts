// Did the ad_performance aggregate views actually land, and are they safe?
//
// The three views in schema.sql were written, reviewed and merged without ever
// being executed — the environment that authored them had no database. That is
// an honest gap, but it is still a gap: "the DDL is idempotent and additive" is
// a claim about unrun code. This closes it with evidence.
//
// READ-ONLY. Runs no DDL, writes nothing, and touches no row data. It reads
// system catalogs and one permission function, so it is safe to run against
// production at any time, including before the DDL has ever been applied — in
// that case it reports what is missing rather than failing obscurely.
//
// PRINTS NO CREDENTIAL MATERIAL. Same discipline as check:db-credentials: the
// password is never read into output and the connection is reduced to host and
// port before display. Safe to run in a shared terminal, paste into a chat, or
// attach to a ticket.
//
// WHY THIS EXISTS AS A SCRIPT RATHER THAN A CHECKLIST
// The load-bearing property is not "the views exist". It is `security_invoker`.
// A view created by a superuser runs with the VIEW OWNER's privileges by
// default, so without that setting these three would read ad_performance with
// RLS bypassed and hand the rows to anyone who can select the view — including
// the browser-embedded anon key. That is precisely the hole the RLS block in
// schema.sql exists to close, reopened through a side door. It is one word in
// the DDL, it is invisible in a "do the views exist?" check, and getting it
// wrong is a data leak rather than an error. So it gets asserted, not eyeballed.
//
// Exit codes:
//   0 — every view present, security_invoker on, anon and authenticated denied
//   1 — a view is missing, or present but unsafe (details printed per view)
//   2 — no credential resolved (nothing was checked; not a verdict on the DB)
//
// Usage:
//   pnpm --filter @workspace/scripts run check:ad-performance-views

import pg from "pg";
import { resolveSupabaseDbUrl } from "./lib/supabase-db-connection.js";

const VIEWS = [
  "ad_performance_event_totals",
  "ad_performance_account_summary",
  "ad_performance_ad_totals",
] as const;

const EXPECTED_INDEX = "ad_performance_account_result_type_idx";
const DENIED_ROLES = ["anon", "authenticated"] as const;

interface ViewReport {
  name: string;
  exists: boolean;
  securityInvoker: boolean | null;
  /** Roles that can still SELECT and should not be able to. */
  leakedTo: string[];
}

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(unparseable connection string)";
  }
}

const dbUrl = resolveSupabaseDbUrl("SUPABASE_DB_URL");
if (!dbUrl) {
  console.error(
    "\nSKIP  No connection resolved — neither SUPABASE_DB_URL nor SUPABASE_DB_PASSWORD is set.\n" +
      "      Nothing was checked. This is not a verdict on the database.\n" +
      "      Run this where the credential already lives (the Replit workspace), not by\n" +
      "      copying the credential somewhere new.\n",
  );
  process.exit(2);
}

// SSL is derived from the host rather than hardcoded. Supabase's pooler
// requires it; a local Postgres has no certificate and REFUSES an SSL
// handshake, so a hardcoded `ssl` option makes this script impossible to test
// against a throwaway database — which is how it was proven to work at all.
// (The repo is inconsistent on this: check-db-credentials.ts forces SSL,
// enforce-importer-rls.ts sets none. Both reach the pooler; neither is
// runnable locally.)
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(dbUrl).hostname);
const client = new pg.Client({
  connectionString: dbUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
} catch (err) {
  // Never echo the connection string: it carries the password.
  console.error(`\nFAIL  Could not connect to ${hostOf(dbUrl)}.\n      ${(err as Error).message}\n`);
  process.exit(1);
}

console.log(`\nChecking ${hostOf(dbUrl)}\n`);

const reports: ViewReport[] = [];

for (const name of VIEWS) {
  // reloptions carries the WITH (...) settings; a view created without
  // security_invoker has it absent rather than false, so treat absent as off.
  const { rows } = await client.query<{ reloptions: string[] | null }>(
    `select c.reloptions
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relname = $1 and n.nspname = 'public' and c.relkind = 'v'`,
    [name],
  );

  if (rows.length === 0) {
    reports.push({ name, exists: false, securityInvoker: null, leakedTo: [] });
    continue;
  }

  const opts = rows[0]!.reloptions ?? [];
  const securityInvoker = opts.some((o) => /^security_invoker\s*=\s*(on|true)$/i.test(o));

  // has_table_privilege answers the question the REVOKE was meant to settle,
  // and answers it for the role as PostgREST would actually present it —
  // rather than us re-deriving it from the ACL by hand.
  const leakedTo: string[] = [];
  for (const role of DENIED_ROLES) {
    const { rows: priv } = await client.query<{ can: boolean }>(
      `select has_table_privilege($1, $2, 'SELECT') as can`,
      [role, `public.${name}`],
    );
    if (priv[0]?.can) leakedTo.push(role);
  }

  reports.push({ name, exists: true, securityInvoker, leakedTo });
}

const { rows: idxRows } = await client.query<{ indexname: string }>(
  `select indexname from pg_indexes where schemaname = 'public' and indexname = $1`,
  [EXPECTED_INDEX],
);
const indexPresent = idxRows.length > 0;

await client.end();

// ── Report ────────────────────────────────────────────────────────────

let failed = false;

for (const r of reports) {
  if (!r.exists) {
    console.error(`  ✗  ${r.name} — does not exist. schema.sql has not been applied here.`);
    failed = true;
    continue;
  }
  if (!r.securityInvoker) {
    console.error(
      `  ✗  ${r.name} — EXISTS BUT security_invoker IS OFF.\n` +
        `     It reads ad_performance with the view owner's privileges, which bypasses RLS.\n` +
        `     Anyone who can select this view reads every account's rows. Re-apply the DDL.`,
    );
    failed = true;
    continue;
  }
  if (r.leakedTo.length > 0) {
    console.error(
      `  ✗  ${r.name} — still SELECT-able by ${r.leakedTo.join(", ")}.\n` +
        `     security_invoker limits what those roles SEE, but the REVOKE is the layer that\n` +
        `     makes it a hard denial rather than an empty result. Re-apply the DDL.`,
    );
    failed = true;
    continue;
  }
  console.log(`  ✓  ${r.name} — security_invoker on, anon and authenticated denied`);
}

console.log(
  indexPresent
    ? `  ✓  ${EXPECTED_INDEX} present`
    : `  !  ${EXPECTED_INDEX} missing — the per-result_type roll-up will seq-scan.\n` +
        `     Correctness is unaffected; this is a performance note, not a failure.`,
);

if (failed) {
  console.error(
    `\nFAIL  The aggregate views are not in the state schema.sql describes.\n` +
      `      Apply them with:\n` +
      `        pnpm --filter @workspace/scripts run apply:ad-performance-views\n` +
      `      (additive and idempotent, one transaction, touches no row data; add\n` +
      `       -- --dry-run to print the SQL without executing it)\n\n` +
      `      NOT with import:metrix. That re-imports the source data packages and in\n` +
      `      prod mode DELETES AND REPLACES all managed-account data — the wrong tool\n` +
      `      by orders of magnitude for adding three views.\n`,
  );
  process.exit(1);
}

console.log(
  `\nPASS  All ${VIEWS.length} ad_performance aggregate views exist, run as the caller\n` +
    `      (security_invoker on), and are denied to anon and authenticated.\n`,
);
