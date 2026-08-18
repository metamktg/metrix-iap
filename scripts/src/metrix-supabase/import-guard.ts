// ── Import row-count guard — pure, testable helpers ─────────────────────────
// Extracted from import.ts so the pre-flight and post-import guard logic can be
// unit-tested without a real Postgres connection.
//
// All functions that touch the database accept a lightweight QueryFn instead of
// a pg.Client directly, which lets tests substitute a simple mock.

export type CountMap = Map<string, number>;

/**
 * Minimal query interface — matches the signature of pg.Client.query so callers
 * can pass `(text, values) => client.query(text, values)` directly, while tests
 * can substitute a synchronous or async stub.
 */
export type QueryFn = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

// ── Table lists (exported so import.ts and tests share the same source) ──────

export const ACCOUNT_SCOPED_TABLES = [
  "ad_performance", "ads", "library_cells", "library_cell_performance",
  "demographic_performance", "demographic_signal", "concept_performance",
  "concept_intelligence", "iap_runs", "placement_performance",
  "platform_performance", "device_performance", "icp_profiles",
  "message_pillars", "variable_combinations", "testing_hypotheses",
  "imported_creative_briefs", "variable_performance", "failure_patterns",
  "data_quality_flags", "ad_traffic_quality", "placement_signal",
  "copy_library", "signal_cards", "account_modules", "campaign_windows",
] as const;

export const GLOBAL_TABLES = ["variable_registry", "app_config"] as const;

export const SKOV_PET_ID = "skov_pet";

// ── snapshotCounts ────────────────────────────────────────────────────────────

/**
 * Snapshot row counts for every table the import will delete.
 *
 * Keys follow the convention:
 *   `<table>:<account_id>`  — for account-scoped counts
 *   `<table>`               — for global (full-table) counts
 *   `signal_cards:global`   — global total for signal_cards (also counted per-account above)
 */
export async function snapshotCounts(
  query: QueryFn,
  managedAccounts: readonly string[],
  skovPetId: string,
  accountScopedTables: readonly string[] = ACCOUNT_SCOPED_TABLES,
  globalTables: readonly string[] = GLOBAL_TABLES,
): Promise<CountMap> {
  const counts: CountMap = new Map();

  // Account-scoped tables for the two primary managed accounts.
  for (const table of accountScopedTables) {
    for (const acct of managedAccounts) {
      const r = await query(
        `select count(*) n from ${table} where account_id = $1`,
        [acct],
      );
      counts.set(`${table}:${acct}`, Number(r.rows[0].n));
    }
  }

  // account_modules is also deleted for skov_pet.
  const skovMod = await query(
    `select count(*) n from account_modules where account_id = $1`,
    [skovPetId],
  );
  counts.set(`account_modules:${skovPetId}`, Number(skovMod.rows[0].n));

  // Global tables (full-table wipe — any rows count as potentially lost data).
  for (const table of globalTables) {
    const r = await query(`select count(*) n from ${table}`);
    counts.set(table, Number(r.rows[0].n));
  }

  // signal_cards has a secondary full-table delete; already counted above per account
  // but also capture the global total so the post-commit check can verify it.
  const scGlobal = await query(`select count(*) n from signal_cards`);
  counts.set("signal_cards:global", Number(scGlobal.rows[0].n));

  return counts;
}

// ── formatCountMap ────────────────────────────────────────────────────────────

/**
 * Format a CountMap as a multi-line string showing only the entries that pass
 * `filter`.  Returns an empty string when no entries match.
 */
export function formatCountMap(
  counts: CountMap,
  filter: (n: number) => boolean,
): string {
  return [...counts.entries()]
    .filter(([, n]) => filter(n))
    .map(([k, n]) => `  ${k}: ${n}`)
    .join("\n");
}

// ── Pre-flight guard ──────────────────────────────────────────────────────────

/**
 * Apply the pre-flight row-count guard.
 *
 * - If any managed-account table already has rows and `force` is false, throws an
 *   Error whose message explains the risk and how to override.  The caller is
 *   expected to roll back the transaction and let the error propagate so that
 *   `main()` can `process.exit(1)`.
 * - If any managed-account table already has rows and `force` is true, emits a
 *   console.warn summary and returns normally so the import proceeds.
 * - If all tables are empty, returns silently (first-run / clean-slate case).
 */
export function applyPreFlightGuard(counts: CountMap, force: boolean): void {
  const existingRows = formatCountMap(counts, (n) => n > 0);
  if (!existingRows) return; // clean slate — nothing to guard against

  if (!force) {
    throw new Error(
      `Import aborted: managed account tables already contain data:\n${existingRows}\n\n` +
      `Re-running the import will DELETE and replace all these rows.  Any data added outside\n` +
      `this import package (manual uploads, re-analysis runs) will be permanently lost.\n\n` +
      `If you are certain you want to overwrite, re-run with --force:\n` +
      `  pnpm --filter @workspace/scripts run import:metrix -- --force`,
    );
  }

  console.warn(
    `--force passed: overwriting existing data for managed accounts.\n` +
    `Pre-import counts (rows that will be deleted):\n${existingRows}`,
  );
}

// ── Post-import loss check ────────────────────────────────────────────────────

export interface PostImportLossResult {
  /** Entries where a table ended up with fewer rows than before the import. */
  losses: string[];
  /** Critical keys that ended up with zero rows (always expected to be non-empty). */
  zeros: string[];
}

/**
 * Detect row losses between a pre-import and post-import snapshot.
 *
 * Returns `{ losses, zeros }` — both arrays are empty when the import is clean.
 * The caller is responsible for emitting the error message and setting
 * `process.exitCode = 1`.
 */
export function detectPostImportLoss(
  preCounts: CountMap,
  postCounts: CountMap,
  criticalKeys: string[],
): PostImportLossResult {
  const losses: string[] = [];
  const zeros: string[] = [];

  for (const [key, pre] of preCounts) {
    const post = postCounts.get(key) ?? 0;
    if (pre > 0 && post < pre) {
      losses.push(`  ${key}: ${pre} → ${post} (lost ${pre - post} rows)`);
    }
  }

  for (const key of criticalKeys) {
    if ((postCounts.get(key) ?? 0) === 0) {
      zeros.push(`  ${key}: 0 rows (expected > 0)`);
    }
  }

  return { losses, zeros };
}
