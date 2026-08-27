// ─── Placement rollup — one implementation (E-c) ──────────────────────
//
// This existed twice: PlacementsView carried the full version and
// AnalysisOverview a trimmed near-copy with different local variable names
// and a narrower result type. Two implementations of the same number is an
// invitation for exactly one of them to be corrected later; the audit
// flagged it, and it is now one function with a superset shape — callers
// that only need spend/results/cpa/ctr simply read those fields.
//
// Every ratio is derived here rather than summed: CPA, CTR, CPM and CPC
// are per-row ratios in the source, and averaging ratios across placements
// is not the same number as the blend. Null when its denominator is zero —
// a placement with no impressions has no CTR, and 0% would assert one.

import type { PlacementRow } from "@/lib/data/seedTypes";

export interface PlacementRollup {
  placement: string;
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
  cpa: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
}

/** Raw per-placement totals, however they were aggregated. */
export interface PlacementTotals {
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
}

/**
 * Derive a placement's ratios from its totals.
 *
 * Exported because the same numbers are needed for placement rows that
 * arrive ALREADY aggregated from the analysis-run API — AnalysisOverview
 * was deriving cpa and ctr inline for that branch, which made three
 * implementations of two ratios across two files. One derivation, two
 * entry points.
 */
export function derivePlacementRollup(placement: string, t: PlacementTotals): PlacementRollup {
  return {
    placement,
    ...t,
    cpa: t.results > 0 ? t.spend / t.results : null,
    ctr: t.impressions > 0 ? (t.linkClicks / t.impressions) * 100 : null,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    cpc: t.linkClicks > 0 ? t.spend / t.linkClicks : null,
  };
}

export function rollupPlacements(rows: PlacementRow[]): PlacementRollup[] {
  const byPlacement = new Map<string, { spend: number; results: number; impressions: number; linkClicks: number }>();
  for (const r of rows) {
    const s = byPlacement.get(r.Placement) ?? { spend: 0, results: 0, impressions: 0, linkClicks: 0 };
    s.spend += r["Amount spent (USD)"];
    s.results += r.Results;
    s.impressions += r.Impressions;
    s.linkClicks += r["Link clicks"];
    byPlacement.set(r.Placement, s);
  }
  return [...byPlacement.entries()].map(([placement, s]) => derivePlacementRollup(placement, s));
}
