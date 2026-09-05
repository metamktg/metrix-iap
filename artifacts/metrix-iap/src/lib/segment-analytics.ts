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

import type { AdBreakdownRow, AdRecord, AnalysisData, DemographicRow, MST, VariableSegmentRow } from "@/lib/data/seedTypes";
import { sumStrict as sharedSumStrict, numberOrNull } from "@/lib/strict-sum";

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

/**
 * Strict nullable sum: null when there are no rows or any row lacks the
 * field. Delegates to `lib/strict-sum` so this file no longer carries its
 * own copy of the policy — there is one definition of a trustworthy sum.
 */
function sumStrict(rows: DemographicRow[], pick: (r: DemographicRow) => unknown): number | null {
  return sharedSumStrict(rows, pick);
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

// ─── Signal assessment ────────────────────────────────────────────────
//
// Owner direction (2026-09-02): coverage is CONTEXT, never a wall. A
// segment's own rows are observed evidence whatever share of the account
// the demographic export covers; what partial coverage changes is how
// complete a ranking ACROSS segments can be. So a segment is classified on
// its own volume against the documented confidence bands, and the source's
// measured coverage travels beside the classification for a surface to show
// once, quietly, with the explanation behind a reveal. The interface
// emphasises HIGH signal, stays silent on an ordinary read, and marks a thin
// read with a small tag — never a banner.

/** Below this many impressions a segment reads as noise, not signal. */
export const LOW_SIGNAL_IMPRESSIONS = 1000;
/** Below this share of scoped spend a segment reads as under-tested. */
export const LOW_SIGNAL_SPEND_SHARE = 0.02;

/**
 * The documented confidence_level bands
 * (docs/prompts/IAP_DATA_BUNDLE_PREP_v2.0.md "confidence_level"; blueprint
 * §8.3): high > 100 conversions or > $1,000 spend; medium 10–100 or
 * $100–1,000; validation_required below that but promising (read as at
 * least one conversion); insufficient below the floor (< $50 spend or < 10
 * impressions). Mirrors the server's `confidenceLevel` in reconciliation.ts
 * — spec §20 carries the mapping.
 */
export type ConfidenceBand = "high" | "medium" | "validation_required" | "insufficient";

export function confidenceBand(
  spend: number | null | undefined,
  conversions: number | null | undefined,
  impressions: number | null | undefined = null,
): ConfidenceBand {
  const s = spend ?? 0;
  const c = conversions ?? 0;
  if (c > 100 || s > 1000) return "high";
  if (c >= 10 || s >= 100) return "medium";
  const belowFloor = s < 50 || (impressions != null && impressions < 10);
  if (belowFloor && c < 1) return "insufficient";
  return "validation_required";
}

/**
 *  - "high" — clears the documented high band on its own volume: the read
 *    the interface emphasises.
 *  - "ok"   — an ordinary, usable read; nothing is rendered for it.
 *  - "low"  — thin: under the medium band, or few impressions, or a tiny
 *    share of scoped spend. A small tag, with the reasons behind it.
 * `low` is kept as a derived boolean so existing styling call sites stay
 * correct.
 */
export type SignalState = "high" | "ok" | "low";

export interface SegmentSignalCoverage {
  /** The demographic source's measured share of account spend (null = unmeasured). */
  pct: number | null;
  /** True when the run measured it below its threshold. */
  partial: boolean;
  /** The run's own measured note (cause + how to widen it). */
  note: string | null;
}

export interface SegmentSignal {
  state: SignalState;
  low: boolean;
  /** The documented band the segment's own volume falls in. */
  band: ConfidenceBand;
  /** Short reasons for a low read; empty otherwise. */
  reasons: string[];
  /** Carried as context for the surface to show once — never a gate. */
  coverage: SegmentSignalCoverage | null;
}

/** Subset of the analysis summary's data_coverage the client needs. */
export interface DemographicCoverageInput {
  spend_coverage_pct: number | null;
  below_threshold: boolean;
  note: string | null;
}

/**
 * Picks the demographic class's coverage entry out of an analysis summary's
 * data_coverage (null when coverage was never measured — legacy runs,
 * importer accounts).
 */
export function demographicCoverageOf(
  dataCoverage: { classes?: { report_class?: string; spend_coverage_pct?: number | null; below_threshold?: boolean; note?: string | null }[] } | null | undefined,
): DemographicCoverageInput | null {
  const cls = dataCoverage?.classes?.find((c) => c.report_class === "demographic");
  if (!cls) return null;
  return {
    spend_coverage_pct: cls.spend_coverage_pct ?? null,
    below_threshold: cls.below_threshold ?? false,
    note: cls.note ?? null,
  };
}

export function assessSegmentSignal(
  totals: SegmentRawTotals,
  scopedTotals: SegmentRawTotals,
  demoCoverage?: DemographicCoverageInput | null,
): SegmentSignal {
  const coverage: SegmentSignalCoverage | null = demoCoverage
    ? { pct: demoCoverage.spend_coverage_pct, partial: demoCoverage.below_threshold, note: demoCoverage.note }
    : null;
  const reasons: string[] = [];
  // The impressions heuristic only applies when the scoped source carries
  // impressions at all: demographic rows served through the preset-window
  // API have no impressions column (the adapter zero-fills them), and
  // flagging every segment "Only 0 impressions" from that zero-fill is a
  // fabricated reason, not a real read.
  const sourceHasImpressions = scopedTotals.impressions != null && scopedTotals.impressions > 0;
  if (sourceHasImpressions && totals.impressions != null && totals.impressions < LOW_SIGNAL_IMPRESSIONS) {
    reasons.push(`${Math.round(totals.impressions).toLocaleString("en-US")} impressions. Under the ${LOW_SIGNAL_IMPRESSIONS.toLocaleString("en-US")} for a stable read.`);
  }
  if (
    totals.spend != null &&
    scopedTotals.spend != null &&
    scopedTotals.spend > 0 &&
    totals.spend / scopedTotals.spend < LOW_SIGNAL_SPEND_SHARE
  ) {
    reasons.push(`${((totals.spend / scopedTotals.spend) * 100).toFixed(1)}% of scoped spend landed here.`);
  }
  const band = confidenceBand(totals.spend, totals.results, sourceHasImpressions ? totals.impressions : null);
  if (band === "insufficient") reasons.push("Under the documented floor ($50 spend or 10 impressions).");
  else if (band === "validation_required") reasons.push("Under the documented medium band (10 results or $100 spend).");
  const state: SignalState = reasons.length > 0 ? "low" : band === "high" ? "high" : "ok";
  return { state, low: state === "low", band, reasons, coverage };
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

/**
 * What attributed the segment: the import's cell-grain demographic rows
 * (the importer's library), or the reconciliation layer's per-ad and
 * per-variable segment rows. An engine-analysed account writes its
 * demographic signal at ACCOUNT grain by construction (the engine buckets
 * by age × gender; there is no cell library to attribute to), which left
 * the Audience drill-down saying attribution "can't be honestly computed"
 * for an account whose run had written 20,618 per-ad demographic rows and
 * 12,605 per-variable segment rows. Those rows ARE the honest attribution:
 * which ads, and which variable tokens on them, the segment saw.
 */
export type SegmentAttributionBasis = "cell_grain" | "evidence_layer";

export interface SegmentAttribution {
  /** False when neither cell-grain rows nor evidence-layer rows carry this segment. */
  available: boolean;
  unavailableReason: string | null;
  basis?: SegmentAttributionBasis | null;
  /** For the evidence basis: what stood in and why, for the surface to say. */
  basisNote?: string | null;
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
  /** Registry `funnel_stage` (ST_) code — distinct from `stage`, which is a human display label (e.g. "TOF"/"MOF"), never a registry code. */
  funnel_stage_variable?: string;
  awareness_variable?: string;
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
    ...splitCodes(c.funnel_stage_variable),
    ...splitCodes(c.awareness_variable),
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
  cellIds: string[] | null,
  /** The account's ads registry: names the evidence layer's ads and scopes them to creative cells. */
  ads?: readonly AdRecord[] | null,
): SegmentAttribution {
  const allRows = analysis.demographic_registration_signal ?? [];
  const grain = cellGrainRows(allRows, cellIds);
  const segRows = rowsForSegment(grain, seg);

  if (segRows.length === 0) {
    const accountSegRows = rowsForSegment(scopeDemographicRows(allRows, cellIds), seg);
    const evidence = evidenceLayerAttribution(analysis, seg, cellIds, ads, accountSegRows);
    if (evidence) return evidence;
    const hasAccountGrainOnly = accountSegRows.length > 0;
    return {
      available: false,
      unavailableReason: hasAccountGrainOnly
        ? "This import's demographic export is account-level only, and this run wrote no per-ad rows for the segment, so concept and variable attribution can't be honestly computed."
        : "No demographic rows exist for this segment in the current selection.",
      basis: null,
      basisNote: null,
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

  return { available: true, unavailableReason: null, basis: "cell_grain", basisNote: null, cells, variables };
}

// ─── Evidence-layer attribution (per-ad and per-variable segment rows) ──

/** Strict sum over rows: null when no row, or any row, lacks the field. */
function sumRows<T>(rows: readonly T[], pick: (r: T) => number | null | undefined): number | null {
  if (rows.length === 0) return null;
  let total = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    total += v;
  }
  return total;
}

function totalsFromAdRows(rows: readonly AdBreakdownRow[]): SegmentRawTotals {
  return {
    rowCount: rows.length,
    spend: sumRows(rows, (r) => r.spend),
    results: sumRows(rows, (r) => r.results),
    // Reach only at the exact grain Meta returned; an aggregated row is null.
    reach: rows.every((r) => r.reach_basis === "exact") ? sumRows(rows, (r) => r.reach) : null,
    impressions: sumRows(rows, (r) => r.impressions),
    linkClicks: sumRows(rows, (r) => r.link_clicks),
    clicksAll: sumRows(rows, (r) => r.clicks_all),
    addsToCart: sumRows(rows, (r) => r.metrics["adds_to_cart"]),
    checkoutsInitiated: sumRows(rows, (r) => r.metrics["checkouts_initiated"]),
    purchases: sumRows(rows, (r) => r.metrics["purchases"]),
    addsToCartValue: null,
  };
}

/** A variable segment row's totals: the direct and contextual halves summed per metric slug. */
function variableRowMetric(r: VariableSegmentRow, slug: string): number | null {
  const d = r.direct_totals?.[slug];
  const c = r.contextual_totals?.[slug];
  if (d === undefined && c === undefined) return null;
  return (d ?? 0) + (c ?? 0);
}

function totalsFromVariableRows(rows: readonly VariableSegmentRow[]): SegmentRawTotals {
  return {
    rowCount: rows.length,
    spend: sumRows(rows, (r) => variableRowMetric(r, "amount_spent")),
    results: sumRows(rows, (r) => r.result_volume),
    reach: null,
    impressions: sumRows(rows, (r) => variableRowMetric(r, "impressions")),
    linkClicks: sumRows(rows, (r) => variableRowMetric(r, "link_clicks")),
    clicksAll: sumRows(rows, (r) => variableRowMetric(r, "clicks_all")),
    addsToCart: sumRows(rows, (r) => variableRowMetric(r, "adds_to_cart")),
    checkoutsInitiated: sumRows(rows, (r) => variableRowMetric(r, "checkouts_initiated")),
    purchases: sumRows(rows, (r) => variableRowMetric(r, "purchases")),
    addsToCartValue: null,
  };
}

function adIdentityKeys(ad: AdRecord): { ids: string[]; names: string[] } {
  return {
    ids: ad.meta_ad_ids ?? (ad.meta_ad_id ? [ad.meta_ad_id] : []),
    names: [ad.ad_name],
  };
}

/**
 * The segment attributed through the reconciliation layer: the per-ad
 * demographic rows name which ads the segment saw (ranked by results), the
 * per-variable segment rows name which variable tokens those ads carried.
 * Null when the layer has no demographic rows for the segment, or when a
 * cell scope is asked for and no registry is there to resolve it.
 */
function evidenceLayerAttribution(
  analysis: AnalysisData,
  seg: SegmentId,
  cellIds: string[] | null,
  ads: readonly AdRecord[] | null | undefined,
  accountSegRows: readonly DemographicRow[],
): SegmentAttribution | null {
  const adRows = (analysis.ad_breakdowns ?? []).filter(
    (r) => r.breakdown === "demographic" && r.segment.age === seg.age && r.segment.gender === seg.gender,
  );
  if (adRows.length === 0) return null;
  if (cellIds && !ads) return null;

  // The result types the segment's own rows carry decide which per-ad rows
  // count; an account whose demographic rows predate the result-event
  // split carries none and every type counts.
  const types = new Set(accountSegRows.map((r) => r["Result type"]).filter((t): t is string => typeof t === "string" && t !== ""));
  const typed = types.size > 0 ? adRows.filter((r) => types.has(r.result_type)) : adRows;

  // A cell scope narrows to the ads the registry files under those cells.
  let scoped = typed;
  let allowedIds: Set<string> | null = null;
  let allowedNames: Set<string> | null = null;
  if (cellIds) {
    const set = new Set(cellIds);
    allowedIds = new Set<string>();
    allowedNames = new Set<string>();
    for (const ad of ads ?? []) {
      if (!ad.cell || !set.has(ad.cell)) continue;
      const k = adIdentityKeys(ad);
      for (const id of k.ids) allowedIds.add(id);
      for (const n of k.names) allowedNames.add(n);
    }
    scoped = typed.filter((r) => (r.ad_identity_kind === "ad_id" ? allowedIds!.has(r.ad_identity) : allowedNames!.has(r.ad_identity)));
  }
  if (scoped.length === 0) return null;

  // Group per ad: the registry row when the identity resolves to one, else the row's own identity.
  const byId = new Map<string, AdRecord>();
  const byName = new Map<string, AdRecord>();
  for (const ad of ads ?? []) {
    if (ad.ad_name.startsWith("__cell_override_")) continue;
    for (const id of adIdentityKeys(ad).ids) if (!byId.has(id)) byId.set(id, ad);
    if (!byName.has(ad.ad_name)) byName.set(ad.ad_name, ad);
  }
  const groups = new Map<string, { ad: AdRecord | null; name: string; ids: Set<string>; rows: AdBreakdownRow[] }>();
  for (const r of scoped) {
    const ad = r.ad_identity_kind === "ad_id" ? byId.get(r.ad_identity) ?? (r.ad_name ? byName.get(r.ad_name) : undefined) ?? null : byName.get(r.ad_identity) ?? null;
    const name = ad?.ad_name ?? r.ad_name ?? r.ad_identity;
    const key = ad ? `ad:${ad.ad_name}` : `id:${r.ad_identity_kind}:${name}`;
    const g = groups.get(key) ?? { ad, name, ids: new Set<string>(), rows: [] };
    if (r.ad_identity_kind === "ad_id") g.ids.add(r.ad_identity);
    if (r.meta_ad_id) g.ids.add(r.meta_ad_id);
    for (const id of ad ? adIdentityKeys(ad).ids : []) g.ids.add(id);
    g.rows.push(r);
    groups.set(key, g);
  }

  // Variables: the per-variable segment rows of this segment, one entry per variable across its result types.
  const varRows = (analysis.variable_segment_performance ?? []).filter(
    (r) =>
      r.breakdown === "demographic" &&
      r.segment.age === seg.age &&
      r.segment.gender === seg.gender &&
      (types.size === 0 || types.has(r.result_type)) &&
      (allowedIds === null || r.contributing_ad_ids.some((id) => allowedIds!.has(id))),
  );
  const byVariable = new Map<string, { rows: VariableSegmentRow[]; adIds: Set<string> }>();
  for (const r of varRows) {
    const e = byVariable.get(r.variable_id) ?? { rows: [], adIds: new Set<string>() };
    e.rows.push(r);
    for (const id of r.contributing_ad_ids) e.adIds.add(id);
    byVariable.set(r.variable_id, e);
  }
  const variables: SegmentVariableAttribution[] = Array.from(byVariable.entries()).map(([code, e]) => {
    const totals = totalsFromVariableRows(e.rows);
    return { code, cellIds: Array.from(e.adIds), totals, derived: deriveSegmentMetrics(totals) };
  });
  variables.sort((a, b) => rankTotals(a.totals, b.totals));

  const cells: SegmentCellAttribution[] = Array.from(groups.values()).map((g) => {
    const totals = totalsFromAdRows(g.rows);
    const codes = variables.filter((v) => v.cellIds.some((id) => g.ids.has(id))).map((v) => v.code);
    const creative = g.ad?.creative ?? null;
    return {
      cellId: g.ad?.meta_ad_id ?? [...g.ids][0] ?? g.name,
      conceptName: g.name,
      copy: creative && (creative.primary_text || creative.headline || creative.cta_type)
        ? { primary: creative.primary_text ?? null, secondary: creative.headline ?? null, cta: creative.cta_type ?? null }
        : null,
      variableCodes: codes,
      totals,
      derived: deriveSegmentMetrics(totals),
    };
  });
  cells.sort((a, b) => rankTotals(a.totals, b.totals));

  return {
    available: true,
    unavailableReason: null,
    basis: "evidence_layer",
    basisNote: `Attributed through the run's reconciled per-ad rows: ${cells.length} ad${cells.length === 1 ? "" : "s"} and ${variables.length} variable token${variables.length === 1 ? "" : "s"} carry this segment. The demographic export is account-level, so no creative cell or concept can be named; the ads and the tokens on them stand in.`,
    cells,
    variables,
  };
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
  cellIds: string[] | null,
  demoCoverage?: DemographicCoverageInput | null,
  /** The account's ads registry, for the evidence-layer attribution (names the ads, scopes them to cells). */
  ads?: readonly AdRecord[] | null,
): SegmentDrilldownData {
  const scoped = scopeDemographicRows(analysis.demographic_registration_signal ?? [], cellIds);
  const segRows = rowsForSegment(scoped, seg);
  const totals = computeSegmentTotals(segRows);
  return {
    segment: seg,
    totals,
    derived: deriveSegmentMetrics(totals),
    signal: assessSegmentSignal(totals, computeSegmentTotals(scoped), demoCoverage),
    attribution: computeSegmentAttribution(analysis, mst, seg, cellIds, ads),
    placements: { available: false, entries: [] },
  };
}
