// Applies the canonical Supabase schema.sql DDL to the connected database.
// Idempotent (every statement uses IF NOT EXISTS / OR REPLACE).
// Usage: SUPABASE_DB_URL=postgres://... tsx ./src/apply-supabase-schema.ts
//
// Connection failures (Supabase pooler outages) are retried, then tolerated
// with a loud warning (exit 0) so post-merge setup isn't blocked by an
// external outage — the DDL is idempotent and applies on the next run.
// SQL errors remain fatal (exit 1).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resolveSupabaseDbUrl } from "./lib/supabase-db-connection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "metrix-supabase/schema.sql");

const dbUrl = resolveSupabaseDbUrl("SUPABASE_DB_URL");
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set (and no SUPABASE_DB_PASSWORD fallback).");
  process.exit(1);
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

async function connectWithRetry(): Promise<pg.Client | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
      console.warn(`Connect attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  return null;
}

const client = await connectWithRetry();
if (!client) {
  console.warn(
    "WARNING: Could not connect to Supabase after " +
      `${MAX_ATTEMPTS} attempts (likely a Supabase pooler outage). ` +
      "Schema NOT applied — re-run once Supabase recovers:\n" +
      "  pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts",
  );
  process.exit(0);
}

try {
  const schemaSql = readFileSync(SCHEMA_PATH, "utf8");
  await client.query(schemaSql);
  console.log("Supabase schema applied.");
} finally {
  await client.end();
}
