// check-generation-runs-migration.ts
//
// Verifies that the generation_runs table in the live Supabase schema has the
// progress_pct and progress_stage columns added by the Task 616 post-merge
// migration. These columns are required by the progress-display code in
// generationEngine.ts; a missing migration silently breaks progress reporting.
//
// Exit codes:
//   0  — both columns confirmed present (or SUPABASE_DB_URL is unset → SKIP)
//   1  — one or both columns are missing (migration did not apply)
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

const REQUIRED_COLUMNS = ["progress_pct", "progress_stage"] as const;
const TABLE = "generation_runs";

const dbUrl = resolveSupabaseDbUrl("SUPABASE_DB_URL");
if (!dbUrl) {
  console.log(
    "SKIP  SUPABASE_DB_URL is not set (and no SUPABASE_DB_PASSWORD fallback) — cannot verify migration. " +
      "Set it to the direct Postgres connection string and re-run.",
  );
  process.exit(0);
}

console.log(`\nChecking ${TABLE} migration columns: ${REQUIRED_COLUMNS.join(", ")}\n`);

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
  const result = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name   = $1
        and column_name  = any($2::text[])
      order by column_name`,
    [TABLE, REQUIRED_COLUMNS],
  );

  const found = new Set(result.rows.map((r) => r.column_name));
  const missing = REQUIRED_COLUMNS.filter((col) => !found.has(col));

  if (missing.length > 0) {
    fail(
      `${TABLE} is missing column(s): ${missing.join(", ")}`,
      "The Task 616 post-merge migration did not apply. " +
        "Run scripts/post-merge.sh (or pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts) " +
        "against the target database to apply the missing ALTER TABLE statements.",
    );
  }

  for (const col of REQUIRED_COLUMNS) {
    pass(`${TABLE}.${col} exists`);
  }

  console.log(`\nOK  ${TABLE} migration columns are present.\n`);
} finally {
  await client.end();
}
