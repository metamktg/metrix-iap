// Applies the canonical Supabase schema.sql DDL to the connected database,
// one statement per transaction, with a short lock_timeout and a fingerprint
// so an unchanged schema is never re-applied.
//
// Usage: SUPABASE_DB_URL=postgres://... tsx ./src/apply-supabase-schema.ts [--force] [--dry-run]
//
// Why the shape (2026-09-04 incident, ARCHITECTURE_CHANGE_LOG entry 23): the
// previous version sent the whole file as one simple query. That is one
// implicit transaction, so every ACCESS EXCLUSIVE lock (each `alter table …
// add column if not exists` takes one even when the column exists) was held
// until the last statement ran; behind one long PostgREST read the DDL
// waited, and every app read then queued behind the DDL. The Replit
// post-merge hook runs this on every merge, so production saw three of
// those convoys in one morning: 150 "canceling statement due to lock
// timeout" cancels, 63 55P03 errors handed to the app, the boot splash
// stalled at 48 s. Now:
//   - unchanged schema (same fingerprint as the last successful apply,
//     recorded in metrix_schema_state) → nothing runs against the tables;
//   - each statement runs in its own transaction with lock_timeout 3 s, so
//     an app reader never waits more than that on us; the statement that
//     loses the lock is retried with backoff, up to five times;
//   - an analysis run in progress defers the apply (its watchdog would mark
//     it failed if we stalled its writes); we wait up to ten minutes for it;
//   - the fingerprint is written only after every statement succeeded.
// Connection failures are retried, then tolerated with a loud warning
// (exit 0) so post-merge setup is not blocked by an outage; the next run
// applies. SQL errors other than lock/cancel remain fatal (exit 1).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveSupabaseDbUrl } from "./lib/supabase-db-connection.js";
import { decideApply, describeStatement, schemaFingerprint, splitSqlStatements } from "./lib/schema-apply.js";
import { applySchemaStatements } from "./lib/schema-apply-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "metrix-supabase/schema.sql");

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const DRY_RUN = args.has("--dry-run");

const LOCK_TIMEOUT = "3s";
const STATEMENT_TIMEOUT = "10min"; // a real index build on a big table is allowed to take a while
const MAX_STATEMENT_ATTEMPTS = 5;
const RUNNING_ANALYSIS_WAIT_MS = 10 * 60_000;
const RUNNING_ANALYSIS_POLL_MS = 15_000;
const MAX_CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const schemaSql = readFileSync(SCHEMA_PATH, "utf8");
const fingerprint = schemaFingerprint(schemaSql);
const statements = splitSqlStatements(schemaSql);

if (DRY_RUN) {
  console.log(`schema.sql: ${statements.length} statement(s), fingerprint ${fingerprint.slice(0, 12)}`);
  for (const [i, s] of statements.entries()) console.log(`${String(i + 1).padStart(4)}  ${describeStatement(s)}`);
  process.exit(0);
}

const dbUrl = resolveSupabaseDbUrl("SUPABASE_DB_URL");
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set (and no SUPABASE_DB_PASSWORD fallback).");
  process.exit(1);
}

async function connectWithRetry(): Promise<pg.Client | null> {
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    });
    try {
      await client.connect();
      return client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed: ${msg}`);
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      if (attempt < MAX_CONNECT_ATTEMPTS) await sleep(CONNECT_RETRY_DELAY_MS);
    }
  }
  return null;
}

const client = await connectWithRetry();
if (!client) {
  console.warn(
    "WARNING: Could not connect to Supabase after " +
      `${MAX_CONNECT_ATTEMPTS} attempts (likely a Supabase pooler outage). ` +
      "Schema NOT applied. Re-run once Supabase recovers:\n" +
      "  pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts",
  );
  process.exit(0);
}

async function recordedFingerprint(): Promise<string | null> {
  // The marker table is tiny and ours; creating it locks nothing the app reads.
  await client!.query(
    `create table if not exists metrix_schema_state (
       id smallint primary key default 1 check (id = 1),
       schema_sha256 text not null,
       statements integer not null,
       applied_at timestamptz not null default now(),
       applied_by text
     )`,
  );
  // The table lives in `public`, which PostgREST serves to the
  // browser-embedded anon key under Supabase's default grants, and it gates
  // the skip decision: a row written with the current file's fingerprint
  // would make every later apply a no-op. Deny the API roles, idempotently.
  await client!.query("alter table metrix_schema_state enable row level security");
  await client!.query(
    `do $$ begin
       if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on metrix_schema_state from anon; end if;
       if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on metrix_schema_state from authenticated; end if;
     end $$`,
  );
  const r = await client!.query<{ schema_sha256: string }>("select schema_sha256 from metrix_schema_state where id = 1");
  return r.rows[0]?.schema_sha256 ?? null;
}

async function runningAnalysisCount(): Promise<number> {
  try {
    // Alive by the engine's own definition: a sign of life within its stale
    // threshold (analysisEngine STALE_ANALYSIS_RUN_MS, 10 minutes). A dead
    // 'running' row (a deploy restarted the server mid-run) is flipped only
    // lazily when someone opens the run list, and it used to hold every
    // later apply for the full wait, after which the hook gave up and no
    // fingerprint was recorded: the schema change never landed.
    const r = await client!.query<{ n: string }>(
      "select count(*)::text as n from manual_analysis_runs where status = 'running' " +
        "and coalesce(heartbeat_at, started_at, 'epoch'::timestamptz) > now() - interval '10 minutes'",
    );
    return Number(r.rows[0]?.n ?? 0);
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") return 0; // table absent on a fresh database: nothing to wait for
    throw err;
  }
}

try {
  const applied = await recordedFingerprint();
  const decision = decideApply(fingerprint, applied, FORCE);
  if (decision.action === "skip") {
    console.log(`Supabase schema unchanged (fingerprint ${fingerprint.slice(0, 12)}); nothing applied.`);
    process.exit(0);
  }
  console.log(
    `Applying Supabase schema: ${statements.length} statement(s), fingerprint ${fingerprint.slice(0, 12)} ` +
      `(${decision.reason}${applied ? `, previously ${applied.slice(0, 12)}` : ""}).`,
  );

  // Never stall a run's writes: its watchdog reads a stalled run as dead.
  const deadline = Date.now() + RUNNING_ANALYSIS_WAIT_MS;
  let running = await runningAnalysisCount();
  while (running > 0 && Date.now() < deadline) {
    console.log(`  … ${running} analysis run(s) in progress; waiting ${RUNNING_ANALYSIS_POLL_MS / 1000} s before touching tables.`);
    await sleep(RUNNING_ANALYSIS_POLL_MS);
    running = await runningAnalysisCount();
  }
  if (running > 0) {
    console.warn(
      `WARNING: ${running} analysis run(s) still in progress after ${RUNNING_ANALYSIS_WAIT_MS / 60_000} minutes. ` +
        "Schema NOT applied to avoid stalling them. Re-run this script once they finish:\n" +
        "  pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts",
    );
    process.exit(0);
  }

  const result = await applySchemaStatements(client, statements, {
    lockTimeout: LOCK_TIMEOUT,
    statementTimeout: STATEMENT_TIMEOUT,
    maxAttempts: MAX_STATEMENT_ATTEMPTS,
  });
  await client.query(
    `insert into metrix_schema_state (id, schema_sha256, statements, applied_by)
     values (1, $1, $2, $3)
     on conflict (id) do update set schema_sha256 = excluded.schema_sha256, statements = excluded.statements,
       applied_at = now(), applied_by = excluded.applied_by`,
    [fingerprint, statements.length, process.env["REPL_SLUG"] ?? process.env["USER"] ?? "apply-supabase-schema"],
  );
  console.log(
    `Supabase schema applied: ${result.statements} statement(s) in ${Math.round(result.ms / 1000)} s` +
      `${result.retried ? `, ${result.retried} retried` : ""}.`,
  );
} catch (err) {
  console.error(`\nFAIL  ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
