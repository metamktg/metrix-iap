// METRIX importer-schema RLS guard.
//
// Companion to metrixOfficialSecurity.test.ts, but for the *importer* schema
// (scripts/src/metrix-supabase/schema.sql). Those tables hold real
// ad-performance data and request-access PII (full names, emails, phone
// numbers). They are ONLY ever reached by the API server using the Supabase
// SERVICE_ROLE key — no frontend talks to Supabase directly. But PostgREST
// default-exposes every `public` table, and the anon / publishable key is
// embedded in the browser, so RLS + revoked grants are the only thing keeping
// the anon key from reading every row via `GET /rest/v1/<table>`. This was a
// real, live exposure once (see .agents/memory/supabase-importer-rls.md).
//
// This suite fails loudly if:
//   1. A table is declared in schema.sql but never added to the RLS block's
//      `importer_tables` array (i.e. a new table added without RLS).
//   2. Any importer table has rowsecurity = false on the live DB.
//   3. The browser-facing `anon` role can read a representative importer table
//      (must get permission-denied, 42501), including `request_access`.
//
// Runs against the live Supabase database via SUPABASE_DB_URL and leaves it
// untouched (read-only checks + rolled-back role impersonation).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { resolveSupabaseTestDbUrl } from "./supabaseTestDbUrl";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(
  __dirname,
  "../../../../../scripts/src/metrix-supabase/schema.sql",
);

// Tables that always contain PII / representative rows — assert anon is denied
// on these explicitly so a regression can never slip past a broad list check.
const PII_SENSITIVE_TABLES = ["request_access"] as const;

/** All `create table if not exists <name>` names declared in schema.sql. */
function parseCreatedTables(schema: string): string[] {
  // Require the trailing `(` so prose like "CREATE TABLE IF NOT EXISTS
  // throughout." in the header comment isn't mistaken for a real table.
  const re = /create\s+table\s+if\s+not\s+exists\s+([a-z_][a-z0-9_]*)\s*\(/gi;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    names.add(m[1].toLowerCase());
  }
  return [...names].sort();
}

/** The `importer_tables text[] := array[ ... ]` list in the RLS block. */
function parseRlsTableList(schema: string): string[] {
  const block = schema.match(/importer_tables\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/i);
  if (!block) {
    throw new Error(
      "Could not find the importer_tables array in schema.sql — the RLS block is missing or was renamed.",
    );
  }
  const names = new Set<string>();
  const re = /'([a-z_][a-z0-9_]*)'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1])) !== null) {
    names.add(m[1].toLowerCase());
  }
  return [...names].sort();
}

const dbUrl = resolveSupabaseTestDbUrl();

describe("METRIX importer schema — RLS guard", () => {
  if (!dbUrl) {
    it.skip("requires SUPABASE_DB_URL or SUPABASE_DB_PASSWORD for live importer-schema RLS checks", () => {});
    return;
  }

  let client: pg.Client;
  let createdTables: string[] = [];
  let rlsTables: string[] = [];

  beforeAll(async () => {
    const schema = await readFile(SCHEMA_PATH, "utf8");
    createdTables = parseCreatedTables(schema);
    rlsTables = parseRlsTableList(schema);

    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    const deployed = await client.query(
      `select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'request_access'`,
    );
    if (deployed.rowCount === 0) {
      throw new Error(
        "Importer schema is not deployed (request_access missing). " +
          "Run: pnpm --filter @workspace/scripts run import:metrix",
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  // --- 1. Every declared table is covered by the RLS block -------------------

  it("lists every importer table in the RLS block (new table without RLS fails here)", () => {
    expect(createdTables.length).toBeGreaterThan(0);
    const missingFromRls = createdTables.filter((t) => !rlsTables.includes(t));
    expect(
      missingFromRls,
      `these tables are created in schema.sql but not in the RLS importer_tables array — ` +
        `add them so ENABLE ROW LEVEL SECURITY + REVOKE covers them: ${missingFromRls.join(", ")}`,
    ).toEqual([]);
    // Conversely, the RLS list must not reference tables that no longer exist.
    const staleInRls = rlsTables.filter((t) => !createdTables.includes(t));
    expect(
      staleInRls,
      `these tables are in the RLS importer_tables array but no longer declared in schema.sql: ${staleInRls.join(", ")}`,
    ).toEqual([]);
  });

  // --- 2. RLS is enabled on the live DB for every importer table -------------

  it("has RLS enabled on every importer table in the live database", async () => {
    const res = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace
          and relkind = 'r'
          and relname = any($1::name[])`,
      [createdTables],
    );
    const found = new Set(res.rows.map((r) => r.relname));
    const missingFromDb = createdTables.filter((t) => !found.has(t));
    expect(
      missingFromDb,
      `these importer tables are declared in schema.sql but not present in the DB ` +
        `(run import:metrix): ${missingFromDb.join(", ")}`,
    ).toEqual([]);
    const rlsDisabled = res.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(
      rlsDisabled,
      `these importer tables have RLS DISABLED — the anon key can read them: ${rlsDisabled.join(", ")}`,
    ).toEqual([]);
  });

  // --- 3. The browser-facing anon role is hard-denied -----------------------

  it("denies the anon role (42501) on PII-sensitive importer tables including request_access", async () => {
    for (const table of PII_SENSITIVE_TABLES) {
      await client.query("begin");
      try {
        await client.query(`set local role anon`);
        let code: string | undefined;
        try {
          await client.query(`select 1 from public.${table} limit 1`);
        } catch (err) {
          code = (err as { code?: string }).code;
        }
        expect(
          code,
          `anon must be hard-denied (42501) reading ${table}, got code ${code ?? "none (read succeeded!)"}`,
        ).toBe("42501");
      } finally {
        await client.query("rollback");
      }
    }
  });

  it("denies the anon role (42501) on a representative sample of importer tables", async () => {
    // A representative spread across data + config + PII tables. Each must be
    // a hard permission-denied for the browser-embedded anon key.
    const sample = ["ad_performance", "connected_ad_accounts", "report_rows", "manual_imports"].filter(
      (t) => createdTables.includes(t),
    );
    expect(sample.length).toBeGreaterThan(0);
    for (const table of sample) {
      await client.query("begin");
      try {
        await client.query(`set local role anon`);
        let code: string | undefined;
        try {
          await client.query(`select 1 from public.${table} limit 1`);
        } catch (err) {
          code = (err as { code?: string }).code;
        }
        expect(
          code,
          `anon must be hard-denied (42501) reading ${table}, got code ${code ?? "none (read succeeded!)"}`,
        ).toBe("42501");
      } finally {
        await client.query("rollback");
      }
    }
  });
});
