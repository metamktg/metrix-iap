// ─── Variable drill-down analytics ────────────────────────────────────
// Pure computation layer behind the variable drill-down modal: for one
// variable code, finds the creative cells that actually carried it, then
// derives per-segment KPIs, text variants, and ranked carrier cells.
//
// Integrity rules (non-negotiable):
// - Header totals come from v3_variable_performance rows (the import's
//   own variable-level numbers) — never re-derived from cell joins.
// - A cell "carries" the variable only when a real data source says so
//   (its own performance rows, else the MST library entry). Never guessed.
// - Segment KPIs use only per-cell demographic grain scoped to carrier
//   cells; when the export has no such grain the section reports itself
//   unavailable with the reason — nothing estimated.
// - Placement signal is account-level in every import; it cannot be
//   attributed to a single variable and is therefore excluded here.

import type {
  AnalysisData,
  DemographicRow,
  MST,
  VariablePerformanceRow,
} from "@/lib/data/seedTypes";
import {
  cellGrainRows,
  codesFromCarrier,
  computeSegmentTotals,
  deriveSegmentMetrics,
  listSegments,
  rowsForSegment,
  type SegmentDerivedMetrics,
  type SegmentId,
  type SegmentRawTotals,
} from "@/lib/segment-analytics";
import { buildVariableFamilyMap, familyForCode } from "@/lib/creative-dna";

// ─── Shapes ───────────────────────────────────────────────────────────

export interface VariableTotals {
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
  uniqueAds: number;
  cpa: number | null;
  ctrPct: number | null;
  /** Result-event keys contributing to these totals (metric selection). */
  resultTypes: string[];
}

export interface VariableCellRollup {
  cellId: string;
  conceptName: string | null;
  spend: number;
  results: number;
  cpa: number | null;
  ctrPct: number | null;
}

export interface VariableSegmentRollup {
  segment: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
}

export interface VariableTextVariant {
  cellId: string;
  conceptName: string | null;
  primary: string | null;
  secondary: string | null;
  cta: string | null;
}

export interface VariableDrilldownData {
  code: string;
  family: string | null;
  /** Null when no v3 variable row for this code exists in the selection. */
  totals: VariableTotals | null;
  /** Cells whose stack carries this code, per a real data source. */
  carrierCellIds: string[];
  /** Carrier cells ranked by results desc, then spend desc. */
  rankedCells: VariableCellRollup[];
  segments: {
    available: boolean;
    unavailableReason: string | null;
    rows: VariableSegmentRollup[];
  };
  /** Distinct copy variants from MST library cells carrying this code. */
  textVariants: VariableTextVariant[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function ratio(num: number, den: number, scale = 1): number | null {
  return den > 0 ? (num / den) * scale : null;
}

/** Rank: results desc, then spend desc. */
function rankCells(a: VariableCellRollup, b: VariableCellRollup): number {
  return b.results - a.results || b.spend - a.spend;
}

function rankSegments(a: VariableSegmentRollup, b: VariableSegmentRollup): number {
  return (
    (b.totals.results ?? 0) - (a.totals.results ?? 0) ||
    (b.totals.spend ?? 0) - (a.totals.spend ?? 0)
  );
}

// ─── Main computation ─────────────────────────────────────────────────

export function computeVariableDrilldown(
  code: string,
  opts: {
    analysis: AnalysisData;
    mst: MST | null | undefined;
    /**
     * Metric-filtered v3_variable_performance rows (the caller applies the
     * page's result-type selection so totals match what's on screen).
     */
    variableRows: VariablePerformanceRow[];
    /**
     * The page's result-type selection. When provided, cell-level inputs
     * (carrier detection, ranked cells, segment scope) are filtered to the
     * same selection so every section of the drill-down agrees with the
     * header totals. Null/undefined = no filtering (all rows).
     */
    selectedResultTypes?: string[] | null;
  }
): VariableDrilldownData {
  const { analysis, mst, variableRows, selectedResultTypes } = opts;

  // ── Header totals: the import's own variable-level rows ─────────────
  const v3Rows = variableRows.filter((r) => r.variable_id === code);
  let totals: VariableTotals | null = null;
  if (v3Rows.length > 0) {
    const spend = v3Rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
    const results = v3Rows.reduce((s, r) => s + r.Results, 0);
    const impressions = v3Rows.reduce((s, r) => s + r.Impressions, 0);
    const linkClicks = v3Rows.reduce((s, r) => s + r["Link clicks"], 0);
    totals = {
      spend,
      results,
      impressions,
      linkClicks,
      // Rows per result type describe the same set of ads — max, not sum.
      uniqueAds: Math.max(...v3Rows.map((r) => r.unique_ads)),
      cpa: ratio(spend, results),
      ctrPct: ratio(linkClicks, impressions, 100),
      resultTypes: Array.from(new Set(v3Rows.map((r) => r["Result type"]))),
    };
  }

  // ── Carrier cells: perf rows' own codes first, else library entry ───
  // Scoped to the page's metric selection so ranked cells and segment
  // inputs agree with the header totals above them.
  const scopedPerfRows = selectedResultTypes
    ? analysis.performance_by_cell.filter((r) => selectedResultTypes.includes(r["Result type"]))
    : analysis.performance_by_cell;
  const perfByCell = new Map<string, typeof analysis.performance_by_cell>();
  for (const r of scopedPerfRows) {
    const list = perfByCell.get(r.cell_id) ?? [];
    list.push(r);
    perfByCell.set(r.cell_id, list);
  }

  const carrierCellIds: string[] = [];
  for (const [cellId, rows] of perfByCell) {
    const own = new Set<string>();
    for (const r of rows) for (const c of codesFromCarrier(r)) own.add(c);
    let carries = own.has(code);
    if (!carries && own.size === 0) {
      const lib = mst?.local_book2_library?.find((c) => c.cell_id === cellId);
      carries = codesFromCarrier(lib).includes(code);
    }
    if (carries) carrierCellIds.push(cellId);
  }
  carrierCellIds.sort();

  // ── Ranked carrier cells (metric-filtered perf rows only) ───────────
  const rankedCells: VariableCellRollup[] = carrierCellIds
    .map((cellId) => {
      const rows = perfByCell.get(cellId) ?? [];
      const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
      const results = rows.reduce((s, r) => s + r.Results, 0);
      const impressions = rows.reduce((s, r) => s + r.Impressions, 0);
      const linkClicks = rows.reduce((s, r) => s + r["Link clicks"], 0);
      return {
        cellId,
        conceptName: rows.find((r) => r.book2_concept_name)?.book2_concept_name ?? null,
        spend,
        results,
        cpa: ratio(spend, results),
        ctrPct: ratio(linkClicks, impressions, 100),
      };
    })
    .sort(rankCells);

  // ── Segment KPIs: per-cell demographic grain scoped to carriers ─────
  const demoRows: DemographicRow[] = analysis.demographic_registration_signal ?? [];
  const grain = carrierCellIds.length > 0 ? cellGrainRows(demoRows, carrierCellIds) : [];
  let segments: VariableDrilldownData["segments"];
  if (carrierCellIds.length === 0) {
    segments = {
      available: false,
      unavailableReason:
        "No creative cell in this import carries this variable, so segment performance can't be attributed.",
      rows: [],
    };
  } else if (grain.length === 0) {
    segments = {
      available: false,
      unavailableReason:
        demoRows.length > 0
          ? "This import's demographic export doesn't break down by creative cell, so per-variable segment performance can't be honestly computed."
          : "No demographic export in this import — segment performance is unavailable.",
      rows: [],
    };
  } else {
    const rows = listSegments(grain)
      .map((segment) => {
        const t = computeSegmentTotals(rowsForSegment(grain, segment));
        return { segment, totals: t, derived: deriveSegmentMetrics(t) };
      })
      .sort(rankSegments);
    segments = { available: true, unavailableReason: null, rows };
  }

  // ── Text variants from library cells carrying the code ──────────────
  const textVariants: VariableTextVariant[] = (mst?.local_book2_library ?? [])
    .filter((c) => codesFromCarrier(c).includes(code))
    .map((c) => ({
      cellId: c.cell_id,
      conceptName: c.book2_concept_name || null,
      primary: c.primary_message || null,
      secondary: c.secondary_message || null,
      cta: c.cta || null,
    }))
    .filter((v) => v.primary || v.secondary || v.cta);

  return {
    code,
    family: familyForCode(code, buildVariableFamilyMap(analysis)),
    totals,
    carrierCellIds,
    rankedCells,
    segments,
    textVariants,
  };
}
