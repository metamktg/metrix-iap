// ─── Segment analytics helpers ─────────────────────────────────────────
// Shared logic for computing per-segment drilldowns from demographic rows.
// Used by both the in-app SegmentGridModal and the report export builder.

import type { AnalysisData, MST } from "@/lib/data/seedTypes";

/** A unique audience segment key: one age bracket × one gender bucket. */
export interface SegmentId {
  age: string;
  gender: string;
}

/** Human-readable label for a segment — e.g. "25–34 Female". */
export function segmentLabel(seg: SegmentId): string {
  return `${seg.age} ${seg.gender}`;
}

interface SegmentTotals {
  spend: number;
  results: number;
  impressions: number;
  reach: number;
  linkClicks: number;
}

interface SegmentDerived {
  cpa: number | null;
  ctr: number | null;
  cpm: number | null;
  frequency: number | null;
}

interface CellAttribution {
  cellId: string;
  conceptName: string | null;
  totals: { results: number };
  derived: { cpa: number | null; ctr: number | null };
}

interface AttributionResult {
  available: boolean;
  unavailableReason: string | null;
  cells: CellAttribution[];
}

interface SignalResult {
  reasons: string[];
}

export interface SegmentDrilldown {
  signal: SignalResult;
  totals: SegmentTotals;
  derived: SegmentDerived;
  attribution: AttributionResult;
}

const MIN_RESULTS_SIGNAL = 10;
const MIN_SPEND_SIGNAL = 50;

/**
 * Compute aggregated metrics and attribution for a single audience segment,
 * optionally scoped to a set of creative cells.
 *
 * Always derives values honestly — returns null for metrics that cannot be
 * computed (e.g. CPA when results = 0), and surfaces a signal warning when
 * the underlying sample is thin.
 */
export function computeSegmentDrilldown(
  analysis: AnalysisData,
  mst: MST | undefined,
  seg: SegmentId,
  cellIds: string[] | null,
): SegmentDrilldown {
  const cellSet = cellIds && cellIds.length > 0 ? new Set(cellIds) : null;

  // Filter demographic rows to this segment (and optional cell scope).
  const rows = (analysis.demographic_registration_signal ?? []).filter(
    (r) =>
      r.Age === seg.age &&
      r.Gender === seg.gender &&
      (cellSet == null || cellSet.has(r.cell_id)),
  );

  // ── Totals ────────────────────────────────────────────────────────────
  const totals: SegmentTotals = { spend: 0, results: 0, impressions: 0, reach: 0, linkClicks: 0 };
  for (const r of rows) {
    totals.spend += r["Amount spent (USD)"];
    totals.results += r.Results;
    totals.impressions += r.Impressions;
    totals.reach += r.Reach;
    totals.linkClicks += r["Link clicks"];
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const cpa = totals.results > 0 ? totals.spend / totals.results : null;
  const ctr = totals.impressions > 0 ? (totals.linkClicks / totals.impressions) * 100 : null;
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null;
  const frequency = totals.reach > 0 ? totals.impressions / totals.reach : null;

  // ── Signal ────────────────────────────────────────────────────────────
  const signalReasons: string[] = [];
  if (rows.length === 0) {
    signalReasons.push("No demographic data available for this segment in the current scope.");
  } else {
    if (totals.results < MIN_RESULTS_SIGNAL) {
      signalReasons.push(`Only ${totals.results} result(s) — interpret with caution.`);
    }
    if (totals.spend < MIN_SPEND_SIGNAL) {
      signalReasons.push(`Only $${totals.spend.toFixed(2)} spend — sample may be too thin.`);
    }
  }

  // ── Attribution (per-cell breakdown) ──────────────────────────────────
  let attribution: AttributionResult;

  if (rows.length === 0) {
    attribution = {
      available: false,
      unavailableReason: "No demographic rows match this segment in the current scope.",
      cells: [],
    };
  } else {
    // Build concept name lookup from MST library (preferred) or fall back to
    // the book2_concept_name on the demographic rows themselves.
    const conceptByCell = new Map<string, string>();
    if (mst?.local_book2_library) {
      for (const lib of mst.local_book2_library) {
        conceptByCell.set(lib.cell_id, lib.book2_concept_name);
      }
    }

    // Aggregate by cell_id within this segment.
    const cellMap = new Map<
      string,
      { spend: number; results: number; impressions: number; linkClicks: number; conceptName: string | null }
    >();
    for (const r of rows) {
      const prev = cellMap.get(r.cell_id);
      const conceptName =
        conceptByCell.get(r.cell_id) ?? r.book2_concept_name ?? null;
      if (prev) {
        prev.spend += r["Amount spent (USD)"];
        prev.results += r.Results;
        prev.impressions += r.Impressions;
        prev.linkClicks += r["Link clicks"];
        // Keep the concept name if one side resolved it.
        if (!prev.conceptName && conceptName) prev.conceptName = conceptName;
      } else {
        cellMap.set(r.cell_id, {
          spend: r["Amount spent (USD)"],
          results: r.Results,
          impressions: r.Impressions,
          linkClicks: r["Link clicks"],
          conceptName,
        });
      }
    }

    const cells: CellAttribution[] = Array.from(cellMap.entries())
      .sort(([, a], [, b]) => b.results - a.results)
      .map(([cellId, c]) => ({
        cellId,
        conceptName: c.conceptName,
        totals: { results: c.results },
        derived: {
          cpa: c.results > 0 ? c.spend / c.results : null,
          ctr: c.impressions > 0 ? (c.linkClicks / c.impressions) * 100 : null,
        },
      }));

    attribution = { available: true, unavailableReason: null, cells };
  }

  return {
    signal: { reasons: signalReasons },
    totals,
    derived: { cpa, ctr, cpm, frequency },
    attribution,
  };
}
