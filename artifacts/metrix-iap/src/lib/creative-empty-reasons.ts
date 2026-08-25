// ─── Cause-specific empty-state reasons for creative popup tabs ─────────
// §1.4 of the Phase-1 honesty work: a generic "no data" message hides three
// different situations with three different remedies. Every caller of
// CreativeExpandDialog computes the actual cause from the data it already
// has, so an empty tab always says WHY it is empty:
//   - the report class was never imported for this account, vs
//   - it was imported but carries no rows joinable to this creative, vs
//   - the source grain makes per-creative rows impossible (account-level
//     manual demographic uploads).
// Pure functions — unit-testable without React.

import type { AnalysisData, CellPerformanceRow, DemographicRow } from "@/lib/data/seedTypes";

/** Sentinel cell_id the manual-analysis engine writes for account-grain demographic signal rows. */
export const ACCOUNT_GRAIN_CELL_ID = "ACCOUNT";

export function demographicEmptyReasonFor(
  demoRows: DemographicRow[],
  cellId: string,
): string | null {
  if (demoRows.length === 0) {
    return "No demographic export has been imported for this account. Upload the Demographics pivot export to see the age × gender breakdown.";
  }
  const hasCellRows = demoRows.some((r) => r.cell_id === cellId);
  if (hasCellRows) return null; // tab won't be empty
  if (demoRows.every((r) => r.cell_id === ACCOUNT_GRAIN_CELL_ID || !r.cell_id)) {
    return "This account's demographic data is account-level — the imported export has no per-creative demographic split, so a per-creative breakdown cannot be honestly shown. See Analysis → Audience for the account-level breakdown.";
  }
  return "The imported demographic export contains no rows that join to this creative's mapped ads.";
}

export function placementsEmptyReasonFor(placements: unknown[]): string | null {
  if (placements.length === 0) {
    return "No device × placement export has been imported for this account. Upload the Placements pivot export to see placement signal.";
  }
  return null;
}

export function funnelEmptyReasonFor(
  perfRows: CellPerformanceRow[] | undefined,
  cellId: string,
): string | null {
  if (!perfRows || perfRows.length === 0) {
    return "No per-creative performance rows exist for this account yet. Performance joins to creatives through their mapped ad names — check the creative-to-ad mapping on the uploaded assets.";
  }
  if (!perfRows.some((r) => r.cell_id === cellId)) {
    return "No performance rows joined to this creative — its mapped ad names don't appear in the imported performance exports.";
  }
  return null;
}

export interface CreativeEmptyReasons {
  demographic: string | null;
  placements: string | null;
  funnel: string | null;
}

/**
 * All three tab reasons for one creative cell, derived from an account's
 * analysis data. Each is null when that tab genuinely has rows to show, so
 * the tab renders its data and never an empty state at all.
 *
 * This is the whole rule set in one place: useCreativeEmptyReasons is a thin
 * React wrapper over it, so the reasons every creative popup shows are unit-
 * tested here rather than only observable through a rendered dialog.
 */
export function creativeEmptyReasonsFor(
  analysis: Pick<AnalysisData, "demographic_registration_signal" | "v3_placement_signal" | "c4e_placement_signal" | "performance_by_cell"> | null | undefined,
  cellId: string | null | undefined,
): CreativeEmptyReasons {
  if (!cellId) return { demographic: null, placements: null, funnel: null };
  const placements = [
    ...(analysis?.v3_placement_signal ?? []),
    ...(analysis?.c4e_placement_signal ?? []),
  ];
  return {
    demographic: demographicEmptyReasonFor(analysis?.demographic_registration_signal ?? [], cellId),
    placements: placementsEmptyReasonFor(placements),
    funnel: funnelEmptyReasonFor(analysis?.performance_by_cell, cellId),
  };
}
