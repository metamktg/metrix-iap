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
// - Carrier ADS (the evidence layer, spec §10a/§12a): when a run wrote
//   variable_evidence, the ads that carry the variable join by Ad ID first
//   and name second, and their ad-grain demographic / placement rows
//   (ad_breakdowns) or the run's variable × segment rows feed the sections.
//   Manual runs never write performance_by_cell, so without this path a
//   variable with 30 unique ads read "no creative carries this variable".
// - The relationship is carried, never upgraded: ad-name tokens and
//   deconstructed variables are ad_context evidence; only a delivered asset
//   breakdown is direct_asset.

import type {
  AdBreakdownRow,
  AdRecord,
  AnalysisData,
  DemographicRow,
  EvidenceState,
  MST,
  VariableEvidenceRow,
  VariablePerformanceRow,
  VariableSegmentRow,
} from "@/lib/data/seedTypes";
import { breakdownRowsFor, worstEvidenceState } from "@/lib/creative-evidence";
import {
  cellGrainRows,
  codesFromCarrier,
  computeSegmentTotals,
  confidenceBand,
  type ConfidenceBand,
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
  /** The documented band this segment's own volume falls in. */
  band: ConfidenceBand;
  /** Reconciliation state of the rows behind it (ad-grain sources only). */
  evidenceState: EvidenceState | null;
}

/** An ad that carries the variable, joined through the evidence layer. */
export interface VariableAdRollup {
  adName: string;
  adIds: string[];
  cell: string | null;
  ad: AdRecord;
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
  cpa: number | null;
  ctrPct: number | null;
  resultType: string | null;
}

export type VariableSegmentSource = "cells" | "variable_rows" | "ad_breakdowns";
export type VariableAttribution = "direct_asset" | "ad_context";

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
    /** Which real source the rows came from (null when unavailable). */
    source: VariableSegmentSource | null;
  };
  /** Ads carrying the variable per the evidence layer, ranked by results then spend. */
  carrierAds: VariableAdRollup[];
  /** The carrier ads' identity for ad-grain joins. */
  carrierIdentity: { adIds: string[]; adNames: string[] };
  /** How the variable relates to its carriers: only a delivered asset breakdown is direct. */
  attribution: VariableAttribution | null;
  /** Evidence state to show on the header (worst over the segment rows, else the relationship). */
  evidenceState: EvidenceState | null;
  /** Ad-grain placement rows for the carrier ads (empty when the run wrote none). */
  placementRows: AdBreakdownRow[];
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
    /** The account's ad registry (seed `ads`) — carrier ads and their full-window performance. */
    ads?: AdRecord[] | null;
    /** The run's variable evidence (seed account `variable_evidence`). */
    variableEvidence?: VariableEvidenceRow[] | null;
    /** The run's ad-grain breakdown rows (analysis `ad_breakdowns`). */
    breakdownRows?: AdBreakdownRow[] | null;
    /** The run's variable × segment rows (analysis `variable_segment_performance`). */
    segmentRows?: VariableSegmentRow[] | null;
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

  // ── Carrier ads: the evidence layer, Ad ID first, name second ───────
  const codeU = code.trim().toUpperCase();
  const evidenceRows = (opts.variableEvidence ?? []).filter((e) => e.variable_id.trim().toUpperCase() === codeU);
  const evidenceIds = new Set<string>();
  const evidenceNames = new Set<string>();
  for (const e of evidenceRows) (e.ad_identity_kind === "ad_id" ? evidenceIds : evidenceNames).add(e.ad_identity);
  let attribution: VariableAttribution | null = evidenceRows.some((e) => e.relationship === "direct_asset")
    ? "direct_asset"
    : evidenceRows.length > 0
      ? "ad_context"
      : null;
  const registry = (opts.ads ?? []).filter((a) => !a.ad_name.startsWith("__cell_override_"));
  const idsOf = (a: AdRecord): string[] => a.meta_ad_ids ?? (a.meta_ad_id ? [a.meta_ad_id] : []);
  const carrierCellSet = new Set(carrierCellIds);
  let carrierRecords = registry.filter(
    (a) => idsOf(a).some((id) => evidenceIds.has(id)) || evidenceNames.has(a.ad_name) || (a.cell != null && carrierCellSet.has(a.cell)),
  );
  if (carrierRecords.length === 0 && evidenceRows.length === 0) {
    // A run older than the evidence layer wrote no variable_evidence: apply
    // the server's own raw-token rule (ad name split on "_", upper-cased) so
    // the ads the header counted are at least named. Still ad_context.
    carrierRecords = registry.filter((a) =>
      a.ad_name
        .split("_")
        .map((t) => t.trim().toUpperCase())
        .includes(codeU),
    );
    if (carrierRecords.length > 0) attribution = "ad_context";
  }
  const carrierAds: VariableAdRollup[] = carrierRecords
    .map((ad) => {
      const p = ad.performance ?? null;
      const spend = p?.spend ?? 0;
      const results = p?.results ?? 0;
      const impressions = p?.impressions ?? 0;
      const linkClicks = p?.link_clicks ?? 0;
      return {
        adName: ad.ad_name,
        adIds: idsOf(ad),
        cell: ad.cell ?? null,
        ad,
        spend,
        results,
        impressions,
        linkClicks,
        cpa: ratio(spend, results),
        ctrPct: ratio(linkClicks, impressions, 100),
        resultType: p?.result_type ?? null,
      };
    })
    .sort((x, y) => y.results - x.results || y.spend - x.spend);
  const carrierIdentity = {
    adIds: Array.from(new Set([...evidenceIds, ...carrierRecords.flatMap(idsOf)])),
    adNames: Array.from(new Set([...evidenceNames, ...carrierRecords.map((a) => a.ad_name)])),
  };

  // ── Segment KPIs ────────────────────────────────────────────────────
  // Three real sources, in order of specificity: per-cell demographic grain
  // scoped to carrier cells; the run's variable × segment rows; the carrier
  // ads' own ad-grain demographic rows. Nothing is estimated.
  const demoRows: DemographicRow[] = analysis.demographic_registration_signal ?? [];
  const grain = carrierCellIds.length > 0 ? cellGrainRows(demoRows, carrierCellIds) : [];
  const withBand = (row: { segment: SegmentId; totals: SegmentRawTotals; evidenceState: EvidenceState | null }): VariableSegmentRollup => ({
    ...row,
    derived: deriveSegmentMetrics(row.totals),
    band: confidenceBand(row.totals.spend, row.totals.results, row.totals.impressions),
  });
  const emptyTotals = (rowCount: number): SegmentRawTotals => ({
    rowCount,
    spend: null,
    results: null,
    reach: null,
    impressions: null,
    linkClicks: null,
    clicksAll: null,
    addsToCart: null,
    checkoutsInitiated: null,
    purchases: null,
    addsToCartValue: null,
  });

  let segments: VariableDrilldownData["segments"];
  const variableSegmentRows = (opts.segmentRows ?? []).filter(
    (r) => r.breakdown === "demographic" && r.variable_id.trim().toUpperCase() === codeU && r.segment.gender && r.segment.age,
  );
  const adGrainRows = carrierIdentity.adIds.length > 0 || carrierIdentity.adNames.length > 0 ? breakdownRowsFor(opts.breakdownRows ?? undefined, "demographic", carrierIdentity) : [];

  if (grain.length > 0) {
    const rows = listSegments(grain)
      .map((segment) => withBand({ segment, totals: computeSegmentTotals(rowsForSegment(grain, segment)), evidenceState: null }))
      .sort(rankSegments);
    segments = { available: true, unavailableReason: null, rows, source: "cells" };
  } else if (variableSegmentRows.length > 0) {
    // Direct totals when any row has them (a delivered asset breakdown);
    // otherwise the contextual totals — the relationship is carried, not
    // upgraded.
    const useDirect = variableSegmentRows.some((r) => Object.keys(r.direct_totals).length > 0);
    const by = new Map<string, { segment: SegmentId; sums: Record<string, number>; states: EvidenceState[]; n: number }>();
    for (const r of variableSegmentRows) {
      const seg: SegmentId = { age: String(r.segment.age), gender: String(r.segment.gender) };
      const k = `${seg.age}|${seg.gender}`;
      const cur = by.get(k) ?? { segment: seg, sums: {}, states: [], n: 0 };
      const t = useDirect ? r.direct_totals : r.contextual_totals;
      for (const [slug, v] of Object.entries(t)) cur.sums[slug] = (cur.sums[slug] ?? 0) + v;
      cur.states.push(r.evidence_state);
      cur.n += 1;
      by.set(k, cur);
    }
    const rows = [...by.values()]
      .map(({ segment, sums, states, n }) =>
        withBand({
          segment,
          totals: {
            ...emptyTotals(n),
            spend: sums.amount_spent ?? null,
            results: sums.results ?? null,
            impressions: sums.impressions ?? null,
            linkClicks: sums.link_clicks ?? null,
            clicksAll: sums.clicks_all ?? null,
          },
          evidenceState: worstEvidenceState(states),
        }),
      )
      .sort(rankSegments);
    segments = { available: true, unavailableReason: null, rows, source: "variable_rows" };
  } else if (adGrainRows.length > 0) {
    const by = new Map<string, { segment: SegmentId; rows: AdBreakdownRow[] }>();
    for (const r of adGrainRows) {
      const seg: SegmentId = { age: String(r.segment.age ?? ""), gender: String(r.segment.gender ?? "") };
      if (!seg.age || !seg.gender) continue;
      const k = `${seg.age}|${seg.gender}`;
      const cur = by.get(k) ?? { segment: seg, rows: [] };
      cur.rows.push(r);
      by.set(k, cur);
    }
    const sum = (rows: AdBreakdownRow[], pick: (r: AdBreakdownRow) => number | null): number | null =>
      rows.every((r) => pick(r) != null) ? rows.reduce((s, r) => s + (pick(r) ?? 0), 0) : null;
    const rows = [...by.values()]
      .map(({ segment, rows }) =>
        withBand({
          segment,
          totals: {
            ...emptyTotals(rows.length),
            spend: sum(rows, (r) => r.spend),
            results: sum(rows, (r) => r.results),
            impressions: sum(rows, (r) => r.impressions),
            linkClicks: sum(rows, (r) => r.link_clicks),
            clicksAll: sum(rows, (r) => r.clicks_all),
          },
          evidenceState: worstEvidenceState(rows.map((r) => r.evidence_state)),
        }),
      )
      .sort(rankSegments);
    segments = { available: true, unavailableReason: null, rows, source: "ad_breakdowns" };
  } else if (carrierCellIds.length === 0 && carrierAds.length === 0) {
    segments = {
      available: false,
      unavailableReason:
        totals && totals.uniqueAds > 0
          ? `The import's variable rows count ${totals.uniqueAds} ad${totals.uniqueAds === 1 ? "" : "s"} for this variable, but this run wrote no evidence linking them by Ad ID or name. Re-run analysis to write the evidence layer.`
          : "No ad in this run carries this variable.",
      rows: [],
      source: null,
    };
  } else {
    segments = {
      available: false,
      unavailableReason:
        demoRows.length > 0 || (opts.breakdownRows ?? []).length > 0
          ? "This run's demographic rows don't join to this variable's ads at ad grain. Re-run analysis on the current build to write ad-grain evidence."
          : "No demographic export in this run — segment performance is unavailable.",
      rows: [],
      source: null,
    };
  }

  const placementRows =
    carrierIdentity.adIds.length > 0 || carrierIdentity.adNames.length > 0 ? breakdownRowsFor(opts.breakdownRows ?? undefined, "placement", carrierIdentity) : [];
  const evidenceState: EvidenceState | null =
    worstEvidenceState(segments.rows.map((r) => r.evidenceState).filter((x): x is EvidenceState => x != null)) ??
    (attribution === "direct_asset" ? "direct_asset" : carrierAds.length > 0 || carrierCellIds.length > 0 ? "ad_context" : null);

  // ── Text variants from library cells carrying the code ──────────────
  // local_book2_library may have multiple entries per cell_id (e.g. Feed /
  // Square / Story aspect ratio variants). Deduplicate by cellId after mapping
  // so the render list never produces duplicate React keys.
  const textVariantsRaw: VariableTextVariant[] = (mst?.local_book2_library ?? [])
    .filter((c) => codesFromCarrier(c).includes(code))
    .map((c) => ({
      cellId: c.cell_id,
      conceptName: c.book2_concept_name || null,
      primary: c.primary_message || null,
      secondary: c.secondary_message || null,
      cta: c.cta || null,
    }))
    .filter((v) => v.primary || v.secondary || v.cta);
  const seenVariantCells = new Set<string>();
  const textVariants = textVariantsRaw.filter((v) => {
    if (seenVariantCells.has(v.cellId)) return false;
    seenVariantCells.add(v.cellId);
    return true;
  });

  return {
    code,
    family: familyForCode(code, buildVariableFamilyMap(analysis)),
    totals,
    carrierCellIds,
    rankedCells,
    segments,
    carrierAds,
    carrierIdentity,
    attribution,
    evidenceState,
    placementRows,
    textVariants,
  };
}
