// Apply the three ad_performance aggregate views — and nothing else.
//
// WHY THIS EXISTS
// The obvious way to get schema.sql's DDL into a database is `import:metrix`.
// For three views that is catastrophically the wrong tool: the importer also
// re-imports the source data packages, and in prod mode it announces
//
//     "PRODUCTION MODE — this import will DELETE and replace all
//      managed-account data in the PRODUCTION Supabase database."
//
// The importer's own two-factor gate (--env plus IMPORT_ENV=production) makes
// that hard to trigger by accident, and that gate is the only reason pointing
// an operator at it was merely wrong rather than destructive. Adding three
// views should not go anywhere near a tool that can delete an account's data,
// so it now has its own path.
//
// SAFE BY CONSTRUCTION, NOT BY INTENTION
// The SQL is not written here. It is extracted verbatim at runtime from
// schema.sql between two sentinels, so this script and the canonical schema
// cannot drift — there is only one definition of these views in the repo.
// Before executing, the extracted text is scanned for destructive statements
// and refuses to run if it finds any. So even a future edit to schema.sql
// that slipped a `drop`/`delete`/`truncate`/`alter table` into that block
// fails here loudly instead of executing against production.
//
// Everything in the block is idempotent: `create index if not exists`,
// `create or replace view`, and REVOKEs that re-run safely. It touches no
// row data. It runs in a single transaction, so a partial apply is not a
// state anyone can end up in.
//
// After applying, it re-reads the catalogs and reports the same verdict
// check:ad-performance-views would, because "the statements ran" and "the
// views are in the intended state" are different claims.
//
// PRINTS NO CREDENTIAL MATERIAL — host and port only.
//
// Exit codes:
//   0 — applied, and verified to be in the intended state
//   1 — refused, failed to apply, or applied but did not verify
//   2 — no credential resolved (nothing was attempted)
//
// Usage:
//   pnpm --filter @workspace/scripts run apply:ad-performance-views
//   pnpm --filter @workspace/scripts run apply:ad-performance-views -- --dry-run

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveSupabaseDbUrl } from "./lib/supabase-db-connection.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA = path.join(repoRoot, "scripts/src/metrix-supabase/schema.sql");

const BEGIN = "-- >>> AD_PERFORMANCE_AGGREGATE_VIEWS_BEGIN";
const END = "-- <<< AD_PERFORMANCE_AGGREGATE_VIEWS_END";

const VIEWS = [
  "ad_performance_event_totals",
  "ad_performance_account_summary",
  "ad_performance_ad_totals",
] as const;

const dryRun = process.argv.includes("--dry-run");

// ── 1. Extract the block, verbatim ────────────────────────────────────

const schema = fs.readFileSync(SCHEMA, "utf8");
const from = schema.indexOf(BEGIN);
const to = schema.indexOf(END);
if (from === -1 || to === -1 || to < from) {
  console.error(
    `\nFAIL  Could not find the sentinels in ${path.relative(repoRoot, SCHEMA)}.\n` +
      `      Expected ${BEGIN} … ${END}.\n` +
      `      Refusing to guess at which lines the view block occupies.\n`,
  );
  process.exit(1);
}
// Slice from the end of the marker's LINE, not the end of the marker string:
// the sentinel comment continues past the marker ("… (extracted verbatim by"),
// and starting mid-line drags that fragment in as bare, invalid SQL. Caught by
// --dry-run, which is the entire reason it exists.
const lineEnd = schema.indexOf("\n", from);
const sql = schema.slice(lineEnd === -1 ? from + BEGIN.length : lineEnd + 1, to);

// ── 2. Refuse anything that could destroy data ────────────────────────
//
// Comments are blanked first so prose about "delete" in the block's own
// documentation cannot trip the scan — the same mistake the interaction gate
// made when it read `<button>` inside a JSDoc comment as real markup.

const withoutComments = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

const FORBIDDEN = [
  /\bdrop\s+(table|view|schema|database|index|column)\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\balter\s+table\b/i,
  /\bupdate\s+\w+\s+set\b/i,
  /\binsert\s+into\b/i,
  /\bgrant\b/i, // this block only ever revokes
];
const violations = FORBIDDEN.filter((re) => re.test(withoutComments)).map((re) => String(re));
if (violations.length > 0) {
  console.error(
    `\nFAIL  The extracted block contains statements this script will not run:\n` +
      violations.map((v) => `        ${v}`).join("\n") +
      `\n\n      This script applies additive, idempotent DDL only. If schema.sql\n` +
      `      genuinely needs one of these, it does not belong in this block.\n`,
  );
  process.exit(1);
}

const statements = withoutComments.split(";").filter((s) => s.trim().length > 0).length;
console.log(
  `\nExtracted ${statements} statement(s) from ${path.relative(repoRoot, SCHEMA)} ` +
    `(additive/idempotent only).`,
);

if (dryRun) {
  console.log("\n--- SQL that would run ---\n" + sql.trim() + "\n\nDRY RUN — nothing executed.\n");
  process.exit(0);
}

// ── 3. Apply ──────────────────────────────────────────────────────────

const dbUrl = resolveSupabaseDbUrl("SUPABASE_DB_URL");
if (!dbUrl) {
  console.error(
    "\nSKIP  No connection resolved — neither SUPABASE_DB_URL nor SUPABASE_DB_PASSWORD is set.\n" +
      "      Nothing was attempted.\n",
  );
  process.exit(2);
}

const hostOf = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname}:${x.port || "5432"}`;
  } catch {
    return "(unparseable connection string)";
  }
};

const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(dbUrl).hostname);
const client = new pg.Client({
  connectionString: dbUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
} catch (err) {
  console.error(`\nFAIL  Could not connect to ${hostOf(dbUrl)}.\n      ${(err as Error).message}\n`);
  process.exit(1);
}

console.log(`Applying to ${hostOf(dbUrl)}\n`);

try {
  // One transaction: no partial-apply state to reason about afterwards.
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("  applied and committed");
} catch (err) {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
  console.error(`\nFAIL  Apply failed and was rolled back.\n      ${(err as Error).message}\n`);
  process.exit(1);
}

// ── 4. Verify, rather than assume ─────────────────────────────────────

let bad = 0;
for (const name of VIEWS) {
  const { rows } = await client.query<{ reloptions: string[] | null }>(
    `select c.reloptions from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relname = $1 and n.nspname = 'public' and c.relkind = 'v'`,
    [name],
  );
  if (rows.length === 0) {
    console.error(`  ✗  ${name} — still absent after a committed apply`);
    bad++;
    continue;
  }
  const invoker = (rows[0]!.reloptions ?? []).some((o) =>
    /^security_invoker\s*=\s*(on|true)$/i.test(o),
  );
  const leaked: string[] = [];
  for (const role of ["anon", "authenticated"]) {
    const { rows: p } = await client.query<{ can: boolean }>(
      `select has_table_privilege($1, $2, 'SELECT') as can`,
      [role, `public.${name}`],
    );
    if (p[0]?.can) leaked.push(role);
  }
  if (!invoker) {
    console.error(`  ✗  ${name} — security_invoker is OFF (RLS would be bypassed)`);
    bad++;
  } else if (leaked.length > 0) {
    console.error(`  ✗  ${name} — still SELECT-able by ${leaked.join(", ")}`);
    bad++;
  } else {
    console.log(`  ✓  ${name} — security_invoker on, anon and authenticated denied`);
  }
}

await client.end();

if (bad > 0) {
  console.error(
    `\nFAIL  The statements committed, but ${bad} view(s) are not in the intended state.\n` +
      `      Do not treat this as applied.\n`,
  );
  process.exit(1);
}

console.log(
  `\nPASS  All ${VIEWS.length} views applied and verified.\n` +
    `      Re-check any time with: pnpm --filter @workspace/scripts run check:ad-performance-views\n`,
);
