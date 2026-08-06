// ─── Age × gender segment analytics ───────────────────────────────────
// Pure computation layer behind the demographic segment drill-down.
// Joins a segment's demographic rows → creative cells (matrix/library)
// → variable stacks, producing per-segment metric values and ranked
// concept / copy / variable attributions.
//
// Integrity rules (non-negotiable):
// - Every number traces to real demographic rows. Nothing is estimated.
// - A raw total is null unless EVERY scoped row carries a numeric value
//   for it — partial data is reported as unavailable, never understated.
// - Derived metrics are null when any input is null or the denominator
//   is zero.
// - Some imports carry an "ACCOUNT" aggregate grain alongside per-cell
//   rows (manual demographic uploads). Summing both would double-count,
//   so account-level totals use the ACCOUNT rows when present, and
//   per-cell attribution uses only the per-cell rows.

import type { AnalysisData, DemographicRow, MST } from "@/lib/data/seedTypes";

/** Sentinel cell id used by manual demographic uploads for the account-level aggregate grain. */
export const ACCOUNT_LEVEL_CELL_ID = "ACCOUNT";

export interface SegmentId {
  age: string;
  gender: string;
}

export function segmentKey(seg: SegmentId): string {
  return `${seg.age}|${seg.gender}`;
}

export function segmentLabel(seg: SegmentId): string {
  const g = seg.gender.trim();
  const gender =
    g.toLowerCase() === "female" ? "Women" : g.toLowerCase() === "male" ? "Men" : g.charAt(0).toUpperCase() + g.slice(1);
  return `${gender} ${seg.age}`;
}

// ─── Row scoping ──────────────────────────────────────────────────────

/**
 * Demographic rows at the honest grain for account/cell-scoped totals.
 * - With cellIds: only rows for those cells (never the ACCOUNT grain).
 * - Without: if ACCOUNT rows exist they are the authoritative account
 *   marginals (per-cell rows overlap them); otherwise all rows.
 */
export function scopeDemographicRows(rows: DemographicRow[], cellIds: string[] | null): DemographicRow[] {
  if (cellIds) {
    const set = new Set(cellIds);
    return rows.filter((r) => set.has(r.cell_id) && r.cell_id !== ACCOUNT_LEVEL_CELL_ID);
  }
  const accountRows = rows.filter((r) => r.cell_id === ACCOUNT_LEVEL_CELL_ID);
  return accountRows.length > 0 ? accountRows : rows;
}

/** Rows carrying real per-cell grain (attribution joins use only these). */
export function cellGrainRows(rows: DemographicRow[], cellIds: string[] | null): DemographicRow[] {
  const scoped = cellIds ? scopeDemographicRows(rows, cellIds) : rows;
  return scoped.filter((r) => r.cell_id !== ACCOUNT_LEVEL_CELL_ID);
}

export function rowsForSegment(rows: DemographicRow[], seg: SegmentId): DemographicRow[] {
  return rows.filter((r) => r.Age === seg.age && r.Gender === seg.gender);
}

/** Unique segments in a row set, ordered by spend (desc). */
export function listSegments(rows: DemographicRow[]): SegmentId[] {
  const map = new Map<string, { seg: SegmentId; spend: number }>();
  for (const r of rows) {
    const seg = { age: r.Age, gender: r.Gender };
    const k = segmentKey(seg);
    const prev = map.get(k) ?? { seg, spend: 0 };
    prev.spend += numberOrNull(r["Amount spent (USD)"]) ?? 0;
    map.set(k, prev);
  }
  return Array.from(map.values())
    .sort((a, b) => b.spend - a.spend)
    .map((e) => e.seg);
}

// ─── Raw totals ───────────────────────────────────────────────────────

export interface SegmentRawTotals {
  /** Number of demographic rows backing these totals. */
  rowCount: number;
  spend: number | null;
  results: number | null;
  reach: number | null;
  impressions: number | null;
  linkClicks: number | null;
  clicksAll: number | null;
  /** Downstream funnel counts (ecommerce cohort) — null unless every scoped row carries the field. */
  addsToCart: number | null;
  checkoutsInitiated: number | null;
  purchases: number | null;
  /** "Adds to cart conversion value" $ total — null unless every scoped row carries it. */
  addsToCartValue: number | null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Strict nullable sum: null when there are no rows or any row lacks the field. */
function sumStrict(rows: DemographicRow[], pick: (r: DemographicRow) => unknown): number | null {
  if (rows.length === 0) return null;
  let total = 0;
  for (const r of rows) {
    const v = numberOrNull(pick(r));
    if (v == null) return null;
    total += v;
  }
  return total;
}

export function computeSegmentTotals(rows: DemographicRow[]): SegmentRawTotals {
  return {
    rowCount: rows.length,
    spend: sumStrict(rows, (r) => r["Amount spent (USD)"]),
    results: sumStrict(rows, (r) => r.Results),
    reach: sumStrict(rows, (r) => r.Reach),
    impressions: sumStrict(rows, (r) => r.Impressions),
    linkClicks: sumStrict(rows, (r) => r["Link clicks"]),
    clicksAll: sumStrict(rows, (r) => r["Clicks (all)"]),
    addsToCart: sumStrict(rows, (r) => r.adds_to_cart),
    checkoutsInitiated: sumStrict(rows, (r) => r.checkouts_initiated),
    purchases: sumStrict(rows, (r) => r.purchases),
    addsToCartValue: sumStrict(rows, (r) => r.adds_to_cart_value),
  };
}

// ─── Derived metrics ──────────────────────────────────────────────────

export interface SegmentDerivedMetrics {
  /** Cost per result (spend ÷ results). */
  cpa: number | null;
  /** Link CTR % (link clicks ÷ impressions × 100). */
  ctr: number | null;
  /** Cost per 1,000 impressions. */
  cpm: number | null;
  /** Cost per link click. */
  cpc: number | null;
  /** Impressions ÷ reach. */
  frequency: number | null;
  /** Conversion rate % (results ÷ link clicks × 100). */
  cvr: number | null;
  /** Add-to-cart rate % (adds to cart ÷ link clicks × 100) — downstream intent signal independent of CTR/CPA. */
  addToCartRate: number | null;
  /** Cost per add to cart (spend ÷ adds to cart). */
  costPerAddToCart: number | null;
  /** Checkout rate % (checkouts initiated ÷ link clicks × 100). */
  checkoutRate: number | null;
  /** Cost per checkout initiated (spend ÷ checkouts initiated). */
  costPerCheckout: number | null;
}

function ratio(num: number | null, den: number | null, scale = 1): number | null {
  if (num == null || den == null || den <= 0) return null;
  return (num / den) * scale;
}

export function deriveSegmentMetrics(t: SegmentRawTotals): SegmentDerivedMetrics {
  return {
    cpa: ratio(t.spend, t.results),
    ctr: ratio(t.linkClicks, t.impressions, 100),
    cpm: ratio(t.spend, t.impressions, 1000),
    cpc: ratio(t.spend, t.linkClicks),
    frequency: ratio(t.impressions, t.reach),
    cvr: ratio(t.results, t.linkClicks, 100),
    addToCartRate: ratio(t.addsToCart, t.linkClicks, 100),
    costPerAddToCart: ratio(t.spend, t.addsToCart),
    checkoutRate: ratio(t.checkoutsInitiated, t.linkClicks, 100),
    costPerCheckout: ratio(t.spend, t.checkoutsInitiated),
  };
}

// ─── Low-signal assessment ────────────────────────────────────────────

/** Below this many impressions a segment reads as noise, not signal. */
export const LOW_SIGNAL_IMPRESSIONS = 1000;
/** Below this share of scoped spend a segment reads as under-tested. */
export const LOW_SIGNAL_SPEND_SHARE = 0.02;

export interface SegmentSignal {
  low: boolean;
  reasons: string[];
}

export function assessSegmentSignal(totals: SegmentRawTotals, scopedTotals: SegmentRawTotals): SegmentSignal {
  const reasons: string[] = [];
  if (totals.impressions != null && totals.impressions < LOW_SIGNAL_IMPRESSIONS) {
    reasons.push(`Only ${Math.round(totals.impressions).toLocaleString("en-US")} impressions — below the ${LOW_SIGNAL_IMPRESSIONS.toLocaleString("en-US")} needed for a stable read.`);
  }
  if (
    totals.spend != null &&
    scopedTotals.spend != null &&
    scopedTotals.spend > 0 &&
    totals.spend / scopedTotals.spend < LOW_SIGNAL_SPEND_SHARE
  ) {
    reasons.push(`Only ${((totals.spend / scopedTotals.spend) * 100).toFixed(1)}% of scoped spend landed on this segment.`);
  }
  return { low: reasons.length > 0, reasons };
}

// ─── Attribution join (segment → cells → variables) ───────────────────

export interface SegmentCellAttribution {
  cellId: string;
  conceptName: string | null;
  /** Ad copy from the MST library cell for this creative, when mapped. */
  copy: { primary: string | null; secondary: string | null; cta: string | null } | null;
  /** Raw variable codes on this cell's stack (compound codes split). */
  variableCodes: string[];
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
}

export interface SegmentVariableAttribution {
  code: string;
  cellIds: string[];
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
}

export interface SegmentAttribution {
  /** False when the import only carries account-level demographic grain. */
  available: boolean;
  unavailableReason: string | null;
  cells: SegmentCellAttribution[];
  variables: SegmentVariableAttribution[];
}

/** Split a possibly-compound code string ("A + B") into individual codes. */
export function splitCodes(v: string | undefined | null): string[] {
  if (!v) return [];
  return v
    .split(/\s*\+\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
}

export interface VariableCarrier {
  hook_variable?: string;
  tone_variable?: string;
  framework_variable?: string;
  concept_variable?: string;
  pain_proof_variable?: string;
  proof_variable?: string;
  cta_variable?: string;
}

export function codesFromCarrier(c: VariableCarrier | null | undefined): string[] {
  if (!c) return [];
  return [
    ...splitCodes(c.hook_variable),
    ...splitCodes(c.tone_variable),
    ...splitCodes(c.framework_variable),
    ...splitCodes(c.concept_variable),
    ...splitCodes(c.pain_proof_variable),
    ...splitCodes(c.proof_variable),
    ...splitCodes(c.cta_variable),
  ];
}

/**
 * Variable codes for a cell: prefer the demographic rows' own codes when
 * the export carries them, else the MST library cell's stack, else the
 * cell's performance rows. Empty when no source knows the stack.
 */
function resolveCellCodes(
  cellId: string,
  demoRows: DemographicRow[],
  analysis: AnalysisData,
  mst: MST | null | undefined
): string[] {
  for (const r of demoRows) {
    const own = codesFromCarrier(r as unknown as VariableCarrier);
    if (own.length) return Array.from(new Set(own));
  }
  const lib = mst?.local_book2_library?.find((c) => c.cell_id === cellId);
  const libCodes = codesFromCarrier(lib);
  if (libCodes.length) return Array.from(new Set(libCodes));
  const perf = analysis.performance_by_cell.find((r) => r.cell_id === cellId);
  return Array.from(new Set(codesFromCarrier(perf)));
}

function resolveConceptName(
  cellId: string,
  demoRows: DemographicRow[],
  analysis: AnalysisData,
  mst: MST | null | undefined
): string | null {
  const fromDemo = demoRows.find((r) => r.book2_concept_name)?.book2_concept_name;
  if (fromDemo) return fromDemo;
  const lib = mst?.local_book2_library?.find((c) => c.cell_id === cellId);
  if (lib?.book2_concept_name) return lib.book2_concept_name;
  return analysis.performance_by_cell.find((r) => r.cell_id === cellId)?.book2_concept_name ?? null;
}

/** Rank: results desc (what drives the segment), then spend desc. */
function rankTotals(a: SegmentRawTotals, b: SegmentRawTotals): number {
  return (b.results ?? 0) - (a.results ?? 0) || (b.spend ?? 0) - (a.spend ?? 0);
}

export function computeSegmentAttribution(
  analysis: AnalysisData,
  mst: MST | null | undefined,
  seg: SegmentId,
  cellIds: string[] | null
): SegmentAttribution {
  const allRows = analysis.demographic_registration_signal ?? [];
  const grain = cellGrainRows(allRows, cellIds);
  const segRows = rowsForSegment(grain, seg);

  if (segRows.length === 0) {
    const hasAccountGrainOnly =
      rowsForSegment(scopeDemographicRows(allRows, cellIds), seg).length > 0;
    return {
      available: false,
      unavailableReason: hasAccountGrainOnly
        ? "This import's demographic export is account-level only — it doesn't break this segment down by creative, so concept and variable attribution can't be honestly computed."
        : "No demographic rows exist for this segment in the current selection.",
      cells: [],
      variables: [],
    };
  }

  // Group segment rows per cell.
  const byCell = new Map<string, DemographicRow[]>();
  for (const r of segRows) {
    const list = byCell.get(r.cell_id) ?? [];
    list.push(r);
    byCell.set(r.cell_id, list);
  }

  const cells: SegmentCellAttribution[] = Array.from(byCell.entries()).map(([cellId, rows]) => {
    const lib = mst?.local_book2_library?.find((c) => c.cell_id === cellId);
    const totals = computeSegmentTotals(rows);
    return {
      cellId,
      conceptName: resolveConceptName(cellId, rows, analysis, mst),
      copy: lib
        ? {
            primary: lib.primary_message || null,
            secondary: lib.secondary_message || null,
            cta: lib.cta || null,
          }
        : null,
      variableCodes: resolveCellCodes(cellId, rows, analysis, mst),
      totals,
      derived: deriveSegmentMetrics(totals),
    };
  });
  cells.sort((a, b) => rankTotals(a.totals, b.totals));

  // Aggregate per variable code across the cells that carry it. Each
  // demographic row contributes once per variable on its cell's stack.
  const byVariable = new Map<string, { cellIds: Set<string>; rows: DemographicRow[] }>();
  for (const cell of cells) {
    const rows = byCell.get(cell.cellId) ?? [];
    for (const code of cell.variableCodes) {
      const entry = byVariable.get(code) ?? { cellIds: new Set<string>(), rows: [] };
      entry.cellIds.add(cell.cellId);
      entry.rows.push(...rows);
      byVariable.set(code, entry);
    }
  }
  const variables: SegmentVariableAttribution[] = Array.from(byVariable.entries()).map(([code, e]) => {
    const totals = computeSegmentTotals(e.rows);
    return { code, cellIds: Array.from(e.cellIds), totals, derived: deriveSegmentMetrics(totals) };
  });
  variables.sort((a, b) => rankTotals(a.totals, b.totals));

  return { available: true, unavailableReason: null, cells, variables };
}

// ─── Segment view assembly (what the drill-down renders) ──────────────

export interface SegmentPlacementEntry {
  placement: string;
  platform: string;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
}

export interface SegmentDrilldownData {
  segment: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
  signal: SegmentSignal;
  attribution: SegmentAttribution;
  placements: { available: boolean; entries: SegmentPlacementEntry[] };
}

export function computeSegmentDrilldown(
  analysis: AnalysisData,
  mst: MST | null | undefined,
  seg: SegmentId,
  cellIds: string[] | null
): SegmentDrilldownData {
  const scoped = scopeDemographicRows(analysis.demographic_registration_signal ?? [], cellIds);
  const segRows = rowsForSegment(scoped, seg);
  const totals = computeSegmentTotals(segRows);
  return {
    segment: seg,
    totals,
    derived: deriveSegmentMetrics(totals),
    signal: assessSegmentSignal(totals, computeSegmentTotals(scoped)),
    attribution: computeSegmentAttribution(analysis, mst, seg, cellIds),
    placements: { available: false, entries: [] },
  };
}
