// ─── Safe re-runs: run-keyed rollups and the account's current run ─────
//
// Sweep spec §7.7 (slice 2, 2026-09-05). A run writes every output row
// under its own id. The account carries a pointer to its current
// successful run (`ad_accounts.current_analysis_run_id`), swapped only once
// the new run's rows are all in place; readers scope to that run, so a run
// in flight is invisible until it succeeds and a run that fails changes
// nothing a reader sees. A failed run deletes only the rows it wrote
// itself. Before this, the engine cleared each date-scoped rollup table for
// the run's window before its own insert, so a re-run that failed part-way
// left the account with no rows for the window until the next success
// (assessment 2026-09-04, hazard H1).
//
// Two kinds of row, two rules, and the second is not an exception to the
// first:
//
//   · EVIDENCE rows (the four reconciliation tables) are kept for every run,
//     for as long as the run exists. Nothing here deletes them; a failed
//     run deletes the rows it wrote itself, and a successful run never
//     touches another run's.
//   · DERIVED ROLLUP rows keep two generations, the current run and the one
//     before it. That is a rebuild-cache limit, not a data-retention limit:
//     every rollup can be recomputed from the staged files and the retained
//     evidence by a re-run over the same window. The previous generation is
//     what a reader sees while a re-run is in flight or after it fails.
//
// Rows with a NULL run id are pre-migration history (and, on the importer's
// managed accounts, the only rows there are). They are always kept and never
// pruned, the same rule the client's `scopeToRun` follows.
//
// The pointer swap itself is one statement in the engine's "Finalizing"
// update (analysisEngine.ts), in the same UPDATE that marks the account
// configured, so there is never a moment where the account is configured
// and pointing at the wrong run.

import { getSupabase } from "./supabase";

/**
 * Derived rollup tables: computed from the staged files and the retained
 * evidence, kept for two generations. Order matters only for logging.
 */
export const ROLLUP_GENERATION_TABLES = [
  "ad_performance",
  "concept_performance",
  "variable_performance",
  "demographic_performance",
  "placement_performance",
  "platform_performance",
  "device_performance",
  "demographic_signal",
  "placement_signal",
] as const;

/**
 * Evidence tables: one set of rows per run, kept for as long as the run
 * exists. Never pruned by generation.
 */
export const EVIDENCE_TABLES = [
  "ad_breakdown_performance",
  "reconciliation_ledger",
  "variable_evidence",
  "variable_segment_performance",
] as const;

/** Every table a run writes under its id: what a failed run cleans up. */
const RUN_OUTPUT_TABLES = [...ROLLUP_GENERATION_TABLES, ...EVIDENCE_TABLES] as const;

/** The current run and the one before it. */
const ROLLUP_GENERATIONS_KEPT = 2;

export type RunTaggedRow = { manual_analysis_run_id?: string | null };

/**
 * Which successful runs keep their rollup rows and which lose them, given
 * the account's successful run ids newest first (the pointer's run first).
 */
export function planRollupGenerations(
  successfulRunIdsNewestFirst: readonly string[],
  keep: number = ROLLUP_GENERATIONS_KEPT,
): { keep: string[]; prune: string[] } {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of successfulRunIdsNewestFirst) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return { keep: ordered.slice(0, Math.max(0, keep)), prune: ordered.slice(Math.max(0, keep)) };
}

/**
 * The rows a reader shows for an account: the current run's rows plus every
 * untagged row. With no current run there is nothing to scope to, and only
 * the untagged rows are shown: a run in flight or one that failed is never
 * read as the account's data.
 */
export function rowsOfCurrentRun<T extends RunTaggedRow>(rows: readonly T[], currentRunId: string | null): T[] {
  return rows.filter((r) => r.manual_analysis_run_id == null || (currentRunId != null && r.manual_analysis_run_id === currentRunId));
}

/**
 * The PostgREST `or` filter for the same rule, for the readers that query
 * one table directly rather than filtering the seed's rows.
 */
export function currentRunFilter(currentRunId: string | null): string {
  return currentRunId
    ? `manual_analysis_run_id.eq.${currentRunId},manual_analysis_run_id.is.null`
    : "manual_analysis_run_id.is.null";
}

/** Applies `currentRunFilter` to a supabase-js query builder. */
export function scopeToCurrentRun<Q extends { or: (filters: string) => Q }>(query: Q, currentRunId: string | null): Q {
  return query.or(currentRunFilter(currentRunId));
}

/**
 * The database operations the generation rules need, narrow enough to fake
 * in a test. The supabase-backed implementation is `supabaseRunGenerationClient`.
 */
export interface RunGenerationClient {
  /** The account's current successful run, or null. */
  currentRunId(accountId: string): Promise<string | null>;
  /** The account's successful run ids, newest first. */
  successfulRunIds(accountId: string): Promise<string[]>;
  /** Deletes one table's rows for one run of one account; the count when known. */
  deleteRunRows(table: string, accountId: string, runId: string): Promise<number | null>;
}

/** Reads the account's current run pointer. */
export async function getCurrentAnalysisRunId(accountId: string): Promise<string | null> {
  return supabaseRunGenerationClient().currentRunId(accountId);
}

/**
 * Deletes every output row one run wrote, rollups and evidence alike: the
 * failed-run and stale-run cleanup. Only ever called for a run that did not
 * succeed, so the retention rule for evidence is not touched: those rows
 * were partial by definition.
 */
export async function deleteRunOutputsWith(client: RunGenerationClient, accountId: string, runId: string): Promise<void> {
  for (const table of RUN_OUTPUT_TABLES) {
    await client.deleteRunRows(table, accountId, runId);
  }
}

export type PruneResult = { kept: string[]; pruned: string[]; rows: number };

/**
 * Drops the rollup rows of every successful run older than the generations
 * kept. Evidence tables are not in the list it walks, so they cannot be
 * touched from here. Called after a run has succeeded and been promoted;
 * a failure here is the caller's to log, never to fail the run over, since
 * the next success recomputes the same plan.
 */
export async function pruneRollupGenerations(
  client: RunGenerationClient,
  accountId: string,
  opts: { keep?: number; log?: (message: string, meta: Record<string, unknown>) => void } = {},
): Promise<PruneResult> {
  const plan = planRollupGenerations(await client.successfulRunIds(accountId), opts.keep ?? ROLLUP_GENERATIONS_KEPT);
  let rows = 0;
  for (const runId of plan.prune) {
    for (const table of ROLLUP_GENERATION_TABLES) {
      const n = await client.deleteRunRows(table, accountId, runId);
      if (n) rows += n;
    }
    opts.log?.("Rollup generation pruned", { accountId, runId, tables: ROLLUP_GENERATION_TABLES.length });
  }
  return { kept: plan.keep, pruned: plan.prune, rows };
}

/** The supabase-backed client. */
export function supabaseRunGenerationClient(): RunGenerationClient {
  const supabase = getSupabase();
  return {
    async currentRunId(accountId) {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("current_analysis_run_id")
        .eq("id", accountId)
        .limit(1);
      if (error) throw new Error(error.message);
      const id = data?.[0]?.["current_analysis_run_id"];
      return id ? String(id) : null;
    },
    async successfulRunIds(accountId) {
      const { data, error } = await supabase
        .from("manual_analysis_runs")
        .select("id")
        .eq("account_id", accountId)
        .eq("status", "success")
        .order("started_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => String(r["id"]));
    },
    async deleteRunRows(table, accountId, runId) {
      // The account leads every output index, so the delete is one index
      // range rather than a scan of the whole table on the run id alone.
      const { error, count } = await supabase
        .from(table)
        .delete({ count: "exact" })
        .eq("account_id", accountId)
        .eq("manual_analysis_run_id", runId);
      if (error) throw new Error(`${table}: ${error.message}`);
      return count ?? null;
    },
  };
}
