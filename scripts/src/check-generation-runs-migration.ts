// check-generation-runs-migration.ts
//
// Verifies that the live Supabase schema carries the run-table columns the
// API server writes but that no code path can fail loudly on:
//
//   generation_runs.progress_pct / .progress_stage  (Task 616)
//       required by the progress-display code in generationEngine.ts;
//       a missing migration silently breaks progress reporting.
//
//   generation_runs.heartbeat_at
//   manual_analysis_runs.heartbeat_at               (BUG-39)
//       required by lib/runHeartbeat.ts. Both engines degrade gracefully
//       without them — the heartbeat write fails as a logged warning and
//       staleness falls back to started_at — which is precisely why a
//       missing migration needs a check: the symptom is not an error, it
//       is the silent return of the bug the column exists to fix.
//
// Exit codes:
//   0  — every column confirmed present (or SUPABASE_DB_URL is unset → SKIP)
//   1  — one or more columns are missing (migration did not apply)
//
// Usage:
//   pnpm --filter @workspace/scripts run check:generation-runs-migration

import pg from "pg";
import { resolveSupabaseDbUrl } from "./lib/supabase-db-connection.js";

function pass(msg: string) {
  console.log(`  PASS  ${msg}`);
}

function fail(msg: string, detail?: string): never {
  console.error(`\nFAIL  ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

const REQUIRED: Record<string, string[]> = {
  generation_runs: ["progress_pct", "progress_stage", "heartbeat_at"],
  manual_analysis_runs: ["heartbeat_at"],
};

const dbUrl = resolveSupabaseDbUrl("SUPABASE_DB_URL");
if (!dbUrl) {
  console.log(
    "SKIP  SUPABASE_DB_URL is not set (and no SUPABASE_DB_PASSWORD fallback) — cannot verify migration. " +
      "Set it to the direct Postgres connection string and re-run.",
  );
  process.exit(0);
}

const REQUIRED_PAIRS = Object.entries(REQUIRED).flatMap(([table, cols]) =>
  cols.map((col) => ({ table, col })),
);

console.log(
  "\nChecking migration columns:\n" +
    Object.entries(REQUIRED)
      .map(([table, cols]) => `  ${table}: ${cols.join(", ")}`)
      .join("\n") +
    "\n",
);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
} catch (connErr) {
  const msg = connErr instanceof Error ? connErr.message : String(connErr);
  console.warn(
    `SKIP  Could not connect to Supabase (${msg}). ` +
      "Supabase may be temporarily unavailable — re-run this check once the database is reachable.",
  );
  process.exit(0);
}

try {
  const result = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name   = any($1::text[])
      order by table_name, column_name`,
    [Object.keys(REQUIRED)],
  );

  const found = new Set(result.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = REQUIRED_PAIRS.filter(({ table, col }) => !found.has(`${table}.${col}`));

  if (missing.length > 0) {
    fail(
      `Missing column(s): ${missing.map(({ table, col }) => `${table}.${col}`).join(", ")}`,
      "A post-merge migration did not apply. " +
        "Run scripts/post-merge.sh (or pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts) " +
        "against the target database to apply the missing ALTER TABLE statements.",
    );
  }

  for (const { table, col } of REQUIRED_PAIRS) {
    pass(`${table}.${col} exists`);
  }

  console.log(`\nOK  all run-table migration columns are present.\n`);
} finally {
  await client.end();
}
