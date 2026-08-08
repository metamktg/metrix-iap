// Applies the canonical Supabase schema.sql DDL to the connected database.
// Idempotent (every statement uses IF NOT EXISTS / OR REPLACE).
// Usage: SUPABASE_DB_URL=postgres://... tsx ./src/apply-supabase-schema.ts

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "metrix-supabase/schema.sql");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

await client.connect();
try {
  const schemaSql = readFileSync(SCHEMA_PATH, "utf8");
  await client.query(schemaSql);
  console.log("Supabase schema applied.");
} finally {
  await client.end();
}
