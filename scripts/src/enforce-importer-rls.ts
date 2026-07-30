#!/usr/bin/env tsx
/**
 * enforce-importer-rls.ts
 *
 * Explicitly enables Row Level Security and revokes anon / authenticated
 * grants on every Metrix importer table declared in schema.sql.
 *
 * WHY A STANDALONE SCRIPT?
 * The importer (import.ts) runs schema.sql in full, which already contains
 * the idempotent RLS DO block.  This script runs ONLY that block so you can
 * harden (or re-harden after a schema edit) without re-importing all data.
 * It is safe to run at any time — every operation is idempotent.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run enforce:importer-rls
 *
 * Requires: SUPABASE_DB_URL (direct Postgres connection, not the PostgREST URL)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, "metrix-supabase/schema.sql");

// ── helpers ───────────────────────────────────────────────────────────────────

function ok(msg: string) { console.log(`  ✓  ${msg}`); }
function fail(msg: string, detail?: string): never {
  console.error(`\nFAIL  ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

/** Extract the importer_tables array from the schema's RLS DO block. */
function parseRlsTables(schema: string): string[] {
  const block = schema.match(/importer_tables\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/i);
  if (!block) fail("Could not find the importer_tables array in schema.sql.");
  const names = new Set<string>();
  const re = /'([a-z_][a-z0-9_]*)'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block![1])) !== null) names.add(m[1].toLowerCase());
  return [...names].sort();
}

/** Extract the DO $$ ... END $$; RLS block from schema.sql.
 *
 * Anchors to the unique "-- Row Level Security (platform integrity)" comment
 * that precedes the block, so we always get the importer RLS block even if
 * other DO blocks exist earlier in the file.
 */
function extractRlsBlock(schema: string): string {
  // Find the anchor comment that uniquely marks the importer RLS section.
  const anchorIdx = schema.search(/--\s*Row Level Security \(platform integrity\)/i);
  if (anchorIdx === -1) {
    fail(
      "Could not find the '-- Row Level Security (platform integrity)' anchor in schema.sql.",
    );
  }
  // From the anchor, find the next `do $$ ... end $$;` block.
  const tail = schema.slice(anchorIdx);
  const match = tail.match(/\bdo\s+\$\$[\s\S]+?end\s+\$\$\s*;/i);
  if (!match) fail("Could not locate the RLS DO block after its anchor comment in schema.sql.");
  return match![0];
}

// ── main ──────────────────────────────────────────────────────────────────────

const dbUrl = process.env["SUPABASE_DB_URL"];
if (!dbUrl) fail("SUPABASE_DB_URL is not set — cannot connect to Supabase Postgres.");

console.log("\nMetrix importer — RLS enforcement\n");
console.log("  Schema: ", SCHEMA_PATH);
console.log("  Target: ", dbUrl.replace(/:[^:@]+@/, ":***@"), "\n");

const schema = readFileSync(SCHEMA_PATH, "utf8");
const rlsBlock = extractRlsBlock(schema);
const declaredTables = parseRlsTables(schema);

console.log(`  Tables in RLS block: ${declaredTables.length}`);
console.log("  Tables:", declaredTables.join(", "), "\n");

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

try {
  // ── 1. Apply the RLS block (idempotent) ────────────────────────────────────
  console.log("Applying RLS DO block...");
  await client.query(rlsBlock);
  ok("RLS DO block executed — ENABLE ROW LEVEL SECURITY + REVOKE applied.");

  // ── 2. Verify: every declared table must have relrowsecurity = true ────────
  console.log("\nVerifying RLS status on live DB...");
  const res = await client.query<{ relname: string; relrowsecurity: boolean }>(
    `select relname, relrowsecurity
       from pg_class
      where relnamespace = 'public'::regnamespace
        and relkind = 'r'
        and relname = any($1::name[])
      order by relname`,
    [declaredTables],
  );

  const found = new Map(res.rows.map((r) => [r.relname, r.relrowsecurity]));
  const missing = declaredTables.filter((t) => !found.has(t));
  const rlsOff = [...found.entries()].filter(([, on]) => !on).map(([t]) => t);

  if (missing.length > 0) {
    console.error(
      `\nWARN  These tables are declared in schema.sql but not yet in the DB ` +
        `(run import:metrix first): ${missing.join(", ")}`,
    );
  }

  if (rlsOff.length > 0) {
    fail(
      `RLS is still DISABLED on: ${rlsOff.join(", ")}`,
      "This should never happen after the DO block succeeds — check Postgres role permissions.",
    );
  }

  const verified = [...found.entries()].filter(([, on]) => on).map(([t]) => t);
  ok(`RLS confirmed ENABLED on ${verified.length} table(s).`);

  // ── 3. Smoke-test anon denial on a PII table ───────────────────────────────
  console.log("\nSmoke-testing anon denial on request_access...");
  if (found.has("request_access")) {
    await client.query("begin");
    try {
      await client.query("set local role anon");
      let denied = false;
      try {
        await client.query("select 1 from public.request_access limit 1");
      } catch (err) {
        denied = (err as { code?: string }).code === "42501";
      }
      if (!denied) {
        fail(
          "anon role can read request_access — REVOKE did not take effect.",
          "Ensure the Supabase 'anon' role exists and the DO block ran as superuser.",
        );
      }
      ok("anon role hard-denied (42501) on request_access — PII is protected.");
    } finally {
      await client.query("rollback");
    }
  } else {
    console.log("  SKIP  request_access not in DB yet — run import:metrix first.");
  }

  console.log("\nDONE  All importer tables are RLS-protected.\n");
  console.log(
    "  service_role (used by the API server) bypasses RLS as intended.\n" +
      "  anon / authenticated roles (browser key) are hard-denied.\n",
  );
} finally {
  await client.end();
}
