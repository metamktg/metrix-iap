// ─── Which generated set is CURRENT (GAP-01) ──────────────────────────
//
// Generation runs used to delete the set they superseded, so "a generated
// row exists" and "this is the current generated set" were the same
// statement, and every reader could rely on that by doing nothing. They
// are not the same any more: runs keep their output, so an account can
// hold several sets at once — one per successful run. Exactly one is
// current; the rest are archive. Nothing is merged and nothing is blended.
//
// This module is the single answer to "which one is live", because the
// alternative — establishing it at the boundary and threading it to each
// reader by hand — is the failure mode this codebase has already shipped
// four times (handoff §3). A reader that needs currency derives it here
// rather than depending on the writer having destroyed the alternatives.
//
// Current means: the set written by the most recent successful run of
// that kind THAT STILL HAS ROWS. The qualifier matters — a run's rows can
// disappear out of band, and the honest answer then is the newest
// generated set that actually survives, not "no generated strategy" while
// its rows sit in the table.

import { getSupabase } from "./supabase";

type Row = Record<string, any>;

/** The kinds of run that write generated output. */
export type GeneratedKind = "strategy" | "briefs";

export type GenerationRunRef = { id: string; kind: string; started_at: string };

export type CurrentGeneratedSet = { rows: Row[]; run: GenerationRunRef | null };

/** Epoch ms for ordering runs; unparseable timestamps sort oldest. */
export const runOrderKey = (startedAt: string): number => {
  const t = Date.parse(startedAt);
  return Number.isNaN(t) ? 0 : t;
};

/** Successful runs of one kind for one account, newest first. */
export function successfulRunsNewestFirst(generationRuns: Row[], kind: string): GenerationRunRef[] {
  return generationRuns
    .filter((r) => r["kind"] === kind && r["status"] === "success")
    .map((r) => ({
      id: String(r["id"] ?? ""),
      kind: String(r["kind"] ?? ""),
      started_at: String(r["started_at"] ?? ""),
    }))
    .filter((r) => r.id.length > 0)
    .sort((a, b) => runOrderKey(b.started_at) - runOrderKey(a.started_at));
}

/**
 * Pick the current set out of possibly several archived ones.
 *
 * `generatedRows` must already be scoped to one account and to
 * `source === 'generated'`; `runsNewestFirst` to that account and kind.
 */
export function resolveCurrentGeneratedSet(
  generatedRows: Row[],
  runsNewestFirst: GenerationRunRef[],
): CurrentGeneratedSet {
  if (generatedRows.length === 0) return { rows: [], run: null };
  for (const run of runsNewestFirst) {
    const rows = generatedRows.filter((r) => String(r["generation_run_id"] ?? "") === run.id);
    if (rows.length > 0) return { rows, run };
  }
  // Rows that map to no successful run — pre-lineage data, or a run row
  // that has since gone. Render them rather than dropping output that is
  // really there; this is exactly what shipped before run scoping, so an
  // account can never lose a strategy to the introduction of this rule.
  return { rows: generatedRows, run: null };
}

/**
 * Split rows of one of the four dual-source tables into the imported set
 * and the CURRENT generated set, discarding archived generated sets.
 *
 * `active` applies the same precedence the seed uses: a generated set
 * replaces the imported one outright, never merges with it.
 */
export function splitBySource(
  rows: Row[],
  runsNewestFirst: GenerationRunRef[],
): { imported: Row[]; generated: Row[]; active: Row[]; run: GenerationRunRef | null } {
  const imported = rows.filter((r) => r["source"] !== "generated");
  const { rows: generated, run } = resolveCurrentGeneratedSet(
    rows.filter((r) => r["source"] === "generated"),
    runsNewestFirst,
  );
  return { imported, generated, active: generated.length > 0 ? generated : imported, run };
}

/** Successful runs of one kind for one account, read from the database. */
export async function fetchSuccessfulRuns(
  accountId: string,
  kind: GeneratedKind,
): Promise<GenerationRunRef[]> {
  const { data, error } = await getSupabase()
    .from("generation_runs")
    .select("id, account_id, kind, status, started_at")
    .eq("account_id", accountId)
    .eq("kind", kind)
    .eq("status", "success");
  if (error) throw new Error(`Supabase query failed for "generation_runs": ${error.message}`);
  return successfulRunsNewestFirst(data ?? [], kind);
}
