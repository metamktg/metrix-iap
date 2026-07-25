// ─── Date scoping helpers ─────────────────────────────────────────────
// The import's granular tables (performance_by_cell, variable performance)
// are aggregates over each flight's full window — there is no daily grain.
// Dated rows exist at two levels: campaign_windows (campaign flights) and
// concept_rollup (per concept, per book). Cells inherit their concept's
// flight window (cell "C2B" belongs to concept "C2"), which lets the
// global date filter include/exclude cells honestly without fabricating
// per-day numbers.

import { useMemo, useCallback } from "react";
import type { AnalysisData, MST } from "@/lib/data/seedTypes";
import { rangesOverlap, isoMin, isoMax, useDateRange, type IsoRange } from "@/contexts/DateRangeContext";

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
 * Union flight window across the concepts that actually appear in the
 * account's MST data (library cells + historical matrix). This is the
 * MST-specific availability window — narrower than the account's campaign
 * bounds whenever MST only covers a subset of concepts/flights.
 * Returns null when MST has no cells or no concept has a dated rollup.
 */
export function getMstRange(
  mst: MST | null | undefined,
  analysis: AnalysisData | null | undefined
): IsoRange | null {
  if (!mst) return null;
  const concepts = new Set<string>();
  for (const c of mst.local_book2_library ?? []) {
    const k = conceptForCell(c.cell_id);
    if (k) concepts.add(k);
  }
  for (const c of mst.historical_matrix_4x4?.cells ?? []) {
    const k = conceptForCell(c.cell_id) ?? conceptForCell(c.concept_code);
    if (k) concepts.add(k);
  }
  if (!concepts.size) return null;
  const windows = getConceptWindows(analysis);
  let out: IsoRange | null = null;
  for (const concept of concepts) {
    const w = windows.get(concept);
    if (!w) continue;
    out = out
      ? { start: isoMin(out.start, w.start), end: isoMax(out.end, w.end) }
      : w;
  }
  return out;
}

/** Sum a numeric field over dated rows that overlap a range. */
export function sumInRange<T>(
  rows: T[],
  range: IsoRange | null,
  getDates: (row: T) => { start: string | null | undefined; end: string | null | undefined },
  getValue: (row: T) => number | null | undefined
): number {
  let sum = 0;
  for (const row of rows) {
    const d = getDates(row);
    if (!range || rangesOverlap(range, d.start, d.end)) {
      sum += getValue(row) ?? 0;
    }
  }
  return sum;
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
    <T extends { cell_id: string }>(rows: T[]): T[] =>
      narrowed
        ? rows.filter((r) => inRangeCell(r.cell_id, (r as Record<string, unknown>)["concept_variable"] as string | null))
        : rows,
    [narrowed, inRangeCell]
  );

  return { windows, range, narrowed, inRangeCell, filterCells };
}

/**
 * MST-specific range availability: true when the selected range overlaps
 * the MST's own data window (union of its concepts' flights), not merely
 * the account's campaign bounds. When MST has no dated window at all we
 * return true — the module's own pending states handle that case.
 */
export function useMstRangeScope(
  mst: MST | null | undefined,
  analysis: AnalysisData | null | undefined
) {
  const { range, preset } = useDateRange();
  const mstRange = useMemo(() => getMstRange(mst, analysis), [mst, analysis]);
  const narrowed = preset !== "all";
  const mstInRange =
    !narrowed || !range || !mstRange
      ? true
      : rangesOverlap(range, mstRange.start, mstRange.end);
  return { mstRange, mstInRange, narrowed };
}
