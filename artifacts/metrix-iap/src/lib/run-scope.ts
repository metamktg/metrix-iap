// ─── Analysis-run scoping helpers ──────────────────────────────────────
// Mirrors date-scope.ts's cell-window mechanics, but scopes creative cells
// by which analysis run(s) produced their concept's rollup data instead of
// by a date range. Cells inherit their concept's run membership (cell
// "C2B" belongs to concept "C2"), derived from concept_rollup's
// manual_analysis_run_id — the same source date-scope.ts's cellInRange
// uses for date windows, now read for run identity instead.
//
// A concept with no dated/run-tagged rollup entry at all, or a rollup row
// predating run-scoping (manual_analysis_run_id null), always passes —
// never hide a row we can't honestly attribute to a run.

import { useMemo, useCallback } from "react";
import type { AnalysisData } from "@/lib/data/seedTypes";
import { conceptForCell } from "@/lib/date-scope";
import type { RunSelectorValue } from "@/components/analysis/RunSelector";

/** Per concept code, the set of analysis run ids (plus "null" for
 *  untagged/legacy rows) whose rollup contributed to that concept. */
export function getConceptRunIds(a: AnalysisData | null | undefined): Map<string, Set<string | null>> {
  const map = new Map<string, Set<string | null>>();
  for (const r of a?.concept_rollup ?? []) {
    const set = map.get(r.concept) ?? new Set<string | null>();
    set.add(r.manual_analysis_run_id ?? null);
    map.set(r.concept, set);
  }
  return map;
}

/**
 * Whether a creative cell's concept was produced by (one of) the selected
 * analysis run(s). All time always passes. Cells whose concept has no
 * rollup entry, or whose rollup includes an untagged legacy row, always
 * pass — same "never hide what we can't attribute" rule as cellInRange.
 */
export function cellInRunScope(
  runIdsByConcept: Map<string, Set<string | null>>,
  selection: RunSelectorValue,
  cellId: string,
  conceptHint?: string | null,
): boolean {
  if (selection.allTime) return true;
  const concept =
    (conceptHint && runIdsByConcept.has(conceptHint) ? conceptHint : null) ??
    conceptForCell(cellId);
  if (!concept) return true;
  const runIds = runIdsByConcept.get(concept);
  if (!runIds) return true;
  if (runIds.has(null)) return true;
  return selection.selectedRunIds.some((id) => runIds.has(id));
}

export function useCellRunScope(analysis: AnalysisData | null | undefined, selection: RunSelectorValue) {
  const runIdsByConcept = useMemo(() => getConceptRunIds(analysis), [analysis]);

  const inRunScope = useCallback(
    (cellId: string, conceptHint?: string | null) =>
      cellInRunScope(runIdsByConcept, selection, cellId, conceptHint),
    [runIdsByConcept, selection],
  );

  const filterByRun = useCallback(
    <T extends { cell_id: string }>(rows: T[]): T[] =>
      selection.allTime
        ? rows
        : rows.filter((r) => inRunScope(r.cell_id, (r as Record<string, unknown>)["concept_variable"] as string | null)),
    [selection, inRunScope],
  );

  return { runIdsByConcept, inRunScope, filterByRun };
}
