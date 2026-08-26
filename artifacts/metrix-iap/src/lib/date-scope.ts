// ─── Date scoping helpers ─────────────────────────────────────────────
// The import's granular tables (performance_by_cell, variable performance)
// are aggregates over each flight's full window — there is no daily grain.
// Dated rows exist at two levels: campaign_windows (campaign flights) and
// concept_rollup (per concept, per book). Cells inherit their concept's
// flight window (cell "C2B" belongs to concept "C2"), which lets the
// global date filter include/exclude cells honestly without fabricating
// per-day numbers.

import { useMemo, useCallback } from "react";
import type { AnalysisData, ConceptScopedRow } from "@/lib/data/seedTypes";
import { rangesOverlap, isoMin, isoMax, useDateRange, type IsoRange } from "@/contexts/DateRangeContext";
import { sumStrict } from "@/lib/strict-sum";

/** Concept code for a creative cell id: "C2B" → "C2". */
export function conceptForCell(cellId: string): string | null {
  const m = /^C\d+/.exec(cellId);
  return m ? m[0] : null;
}

/** Union flight window per concept code, derived from concept_rollup. */
export function getConceptWindows(a: AnalysisData | null | undefined): Map<string, IsoRange> {
  const map = new Map<string, IsoRange>();
  for (const r of a?.concept_rollup ?? []) {
    if (!r.date_start || !r.date_end) continue;
    const prev = map.get(r.concept);
    map.set(
      r.concept,
      prev
        ? { start: isoMin(prev.start, r.date_start), end: isoMax(prev.end, r.date_end) }
        : { start: r.date_start, end: r.date_end }
    );
  }
  return map;
}

/**
 * Whether a creative cell's flight window overlaps the selected range.
 * Cells whose concept has no dated rollup entry always pass — we never
 * hide rows whose window is unknown.
 *
 * `conceptHint` — value of the row's `concept_variable` field. Only used
 * when it resolves to a known concept in the windows map (e.g. LittleData
 * historical cells where concept_variable IS the concept rollup code like
 * "LD-CN-CATALOG-GRID", or Sprint-1 ECAS cells with "C1"/"C2"). Ignored
 * when concept_variable holds a strategy-variable code that is not a
 * concept rollup key (e.g. bookster's "CN_ProductDemo"), so the cell_id
 * regex derivation takes over as the safe fallback.
 */
export function cellInRange(
  windows: Map<string, IsoRange>,
  range: IsoRange | null,
  cellId: string,
  conceptHint?: string | null,
): boolean {
  if (!range) return true;
  // Use hint only when it resolves to a known concept; fall back to cell_id regex.
  const concept =
    (conceptHint && windows.has(conceptHint) ? conceptHint : null) ??
    conceptForCell(cellId);
  if (!concept) return true;
  const w = windows.get(concept);
  if (!w) return true;
  return rangesOverlap(range, w.start, w.end);
}

/**
 * Strict nullable sum of a numeric field over dated rows overlapping a range.
 *
 * Null — never 0 — when no row falls in the range, or when any row that does
 * lacks the field. This used to return `number` and fold missing values with
 * `?? 0`, so a column no row carried summed to a measured-looking zero and an
 * empty window reported "$0 spent" rather than "nothing measured here". Zero
 * is a real, meaningful figure in every metric this feeds; it must never stand
 * in for an unknown.
 *
 * The fold itself is `lib/strict-sum`'s `sumStrict` — this function only
 * adds the range filter. There is ONE definition of a trustworthy sum in
 * the codebase rather than several that disagree at the edges.
 */
export function sumInRange<T>(
  rows: T[],
  range: IsoRange | null,
  getDates: (row: T) => { start: string | null | undefined; end: string | null | undefined },
  getValue: (row: T) => number | null | undefined
): number | null {
  const inRange = rows.filter((row) => {
    if (!range) return true;
    const d = getDates(row);
    return rangesOverlap(range, d.start, d.end);
  });
  return sumStrict(inRange, getValue);
}

// ─── React hook: cell-level range scoping ─────────────────────────────
// Binds the concept flight windows to the active global date range so
// views can filter cell-keyed rows with one call. Cells whose concept
// window misses the selected range are excluded; cells with no dated
// rollup are kept (we can't honestly exclude what we can't date).

export function useCellRangeScope(analysis: AnalysisData | null | undefined) {
  const { range, preset } = useDateRange();
  const windows = useMemo(() => getConceptWindows(analysis), [analysis]);
  const narrowed = preset !== "all";

  // conceptHint: explicit concept code when the cell_id doesn't encode it
  // (e.g. LittleData historical cells whose cell_id is an ad name).
  const inRangeCell = useCallback(
    (cellId: string, conceptHint?: string | null) =>
      cellInRange(windows, range, cellId, conceptHint),
    [windows, range]
  );

  const filterCells = useCallback(
    <T extends ConceptScopedRow>(rows: T[]): T[] =>
      narrowed
        ? rows.filter((r) => inRangeCell(r.cell_id, r.concept_variable ?? null))
        : rows,
    [narrowed, inRangeCell]
  );

  return { windows, range, narrowed, inRangeCell, filterCells };
}
