// METRIX official schema migration runner (Phase 0).
//
// Applies, in order:
//   1. supabase/migrations/*.sql  — apply-once, tracked in _metrix_migrations
//   2. supabase/seed/*.sql        — apply-once, tracked in _metrix_migrations
//   3. supabase/policies/*.sql    — idempotent, re-applied on EVERY run
//
// Each apply-once file runs inside its own transaction together with its
// tracking-row insert, so a failed migration leaves no partial tracking state.
// A checksum is recorded; if a previously-applied file's contents change, the
// runner aborts loudly instead of silently skipping the drifted file.
//
// Preflight guards:
//   - refuses to run while the legacy `creative_briefs` compatibility VIEW
//     exists (migration 0004 creates a TABLE with that name — the view must
//     be dropped first, after prod has been republished with the renamed
//     importer table).
//
// Usage: pnpm --filter @workspace/scripts run migrate:metrix-official
//        (add --dry-run to list what would be applied without applying)

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = path.resolve(__dirname, "../../../supabase");

const TRACKING_TABLE = "_metrix_migrations";

type SqlFile = { name: string; fullPath: string; sql: string; checksum: string };

async function listSqlFiles(dir: string): Promise<SqlFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files = entries.filter((f) => f.endsWith(".sql")).sort();
  const out: SqlFile[] = [];
  for (const name of files) {
    const fullPath = path.join(dir, name);
    const sql = await readFile(fullPath, "utf8");
    out.push({
      name,
      fullPath,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("SUPABASE_DB_URL is not set.");
    process.exit(1);
  }

  const migrations = await listSqlFiles(path.join(SUPABASE_DIR, "migrations"));
  const seeds = await listSqlFiles(path.join(SUPABASE_DIR, "seed"));
  const policies = await listSqlFiles(path.join(SUPABASE_DIR, "policies"));

  if (migrations.length === 0) {
    console.error(`No migration files found under ${SUPABASE_DIR}/migrations.`);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Preflight: the legacy compat view blocks migration 0004's
    // `create table creative_briefs`.
    const view = await client.query(
      `select 1 from information_schema.views
        where table_schema = 'public' and table_name = 'creative_briefs'`,
    );
    if (view.rowCount && view.rowCount > 0) {
      console.error(
        "ABORT: the legacy compatibility VIEW public.creative_briefs still exists.\n" +
          "Migration 0004 creates a TABLE with that name.\n" +
          "Sequence: republish production (so it reads imported_creative_briefs),\n" +
          "then run:  drop view creative_briefs;  and re-run this migrator.",
      );
      process.exit(1);
    }

    await client.query(`
      create table if not exists ${TRACKING_TABLE} (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedRes = await client.query<{ filename: string; checksum: string }>(
      `select filename, checksum from ${TRACKING_TABLE}`,
    );
    const applied = new Map(appliedRes.rows.map((r) => [r.filename, r.checksum]));

    // Drift check before applying anything.
    for (const file of [...migrations, ...seeds]) {
      const prior = applied.get(file.name);
      if (prior && prior !== file.checksum) {
        console.error(
          `ABORT: ${file.name} was already applied but its contents have changed ` +
            `(checksum mismatch). Migrations are immutable once applied — add a new ` +
            `migration file instead of editing an applied one.`,
        );
        process.exit(1);
      }
    }

    let appliedCount = 0;
    for (const file of [...migrations, ...seeds]) {
      if (applied.has(file.name)) {
        console.log(`  skip     ${file.name} (already applied)`);
        continue;
      }
      if (dryRun) {
        console.log(`  would apply ${file.name}`);
        appliedCount++;
        continue;
      }
      console.log(`  applying ${file.name} ...`);
      await client.query("begin");
      try {
        await client.query(file.sql);
        await client.query(
          `insert into ${TRACKING_TABLE} (filename, checksum) values ($1, $2)`,
          [file.name, file.checksum],
        );
        await client.query("commit");
        appliedCount++;
      } catch (err) {
        await client.query("rollback");
        console.error(`FAILED in ${file.name}:`);
        throw err;
      }
    }

    // Policies are written to be idempotent (drop policy if exists / create or
    // replace) and re-applied every run so edits always take effect.
    for (const file of policies) {
      if (dryRun) {
        console.log(`  would re-apply policy file ${file.name}`);
        continue;
      }
      console.log(`  policies ${file.name} ...`);
      await client.query("begin");
      try {
        await client.query(file.sql);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        console.error(`FAILED in policy file ${file.name}:`);
        throw err;
      }
    }

    console.log(
      dryRun
        ? `Dry run complete: ${appliedCount} file(s) pending, ${policies.length} policy file(s) would re-apply.`
        : `Done: ${appliedCount} new file(s) applied, ${policies.length} policy file(s) re-applied.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
