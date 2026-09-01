// ─── KPI drill-down breakdown selectors ───────────────────────────────
// Pure data layer behind KpiDrilldownModal. Given a scope (manager or
// account), a tile metric id, and a breakdown dimension, returns ranked
// rows computed from existing seed data — no new backend collection.
//
// Honesty rules:
//   - Ratio metrics (CTR, CPA, CPM, CPC, CVR) are ALWAYS recomputed from
//     summed numerators/denominators per group — never averaged.
//   - CTR-family null guard: clicks > impressions (Meta conversion-basis
//     export) or impressions == 0 ⇒ null, never a bogus percentage.
//   - Metrics a group honestly cannot compute return null and render as
//     "n/a" — never zero.
//   - Conversion-basis dimensions (device/platform/placement from
//     conversion_tracking_signal) never mix with delivery-basis metrics:
//     only link_clicks (the one shared field) is offered there.

import { fmtUSD, fmtNum, fmtPct, eventLabel, platformLabel, deviceLabel } from "@/pages/metrix/shared";
import { scopeToRun } from "@/lib/run-supersede";
import type {
  AdAccount, AnalysisData, CellPerformanceRow, PlacementRow, DeviceDeliveryRow,
} from "./seedTypes";

// ─── Group totals + ratio math ────────────────────────────────────────

export interface BreakdownTotals {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicksAll: number | null;
  linkClicks: number | null;
  results: number | null;
}

export const EMPTY_TOTALS: BreakdownTotals = {
  spend: null, impressions: null, reach: null, clicksAll: null, linkClicks: null, results: null,
};

const add = (a: number | null, b: number | null | undefined): number | null =>
  b == null ? a : (a ?? 0) + b;

export function addTotals(t: BreakdownTotals, u: Partial<BreakdownTotals>): BreakdownTotals {
  return {
    spend: add(t.spend, u.spend),
    impressions: add(t.impressions, u.impressions),
    reach: add(t.reach, u.reach),
    clicksAll: add(t.clicksAll, u.clicksAll),
    linkClicks: add(t.linkClicks, u.linkClicks),
    results: add(t.results, u.results),
  };
}

/**
 * Compute a tile metric's value from summed group totals.
 * Ratios are numerator-sum ÷ denominator-sum — never an average of rates.
 * Returns null whenever the inputs can't honestly support the metric.
 */
export function metricValueFromTotals(metricId: string, t: BreakdownTotals): number | null {
  if (metricId.startsWith("result:")) return t.results;
  switch (metricId) {
    case "spend": return t.spend;
    case "impressions": return t.impressions;
    case "reach": return t.reach;
    case "clicks_all": return t.clicksAll;
    case "link_clicks": return t.linkClicks;
    case "link_ctr":
      return t.linkClicks != null && t.impressions != null && t.impressions > 0 && t.linkClicks <= t.impressions
        ? (t.linkClicks / t.impressions) * 100
        : null;
    case "ctr_all":
      return t.clicksAll != null && t.impressions != null && t.impressions > 0 && t.clicksAll <= t.impressions
        ? (t.clicksAll / t.impressions) * 100
        : null;
    case "cpc":
      return t.spend != null && t.linkClicks != null && t.linkClicks > 0 ? t.spend / t.linkClicks : null;
    case "cpm":
      return t.spend != null && t.impressions != null && t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null;
    case "cpa_blended":
      return t.spend != null && t.results != null && t.results > 0 ? t.spend / t.results : null;
    case "cvr":
      return t.results != null && t.linkClicks != null && t.linkClicks > 0 && t.results <= t.linkClicks
        ? (t.results / t.linkClicks) * 100
        : null;
    default:
      return null;
  }
}

export function formatBreakdownValue(metricId: string, v: number | null): string {
  if (v == null) return "n/a";
  if (metricId.startsWith("result:")) return fmtNum(v);
  switch (metricId) {
    case "spend": return fmtUSD(v, 0);
    case "cpc":
    case "cpm":
    case "cpa_blended": return fmtUSD(v);
    case "link_ctr":
    case "ctr_all":
    case "cvr": return fmtPct(v);
    default: return fmtNum(v);
  }
}

/** Lower is better for cost metrics — drives default sort direction. */
export function lowerIsBetter(metricId: string): boolean {
  return metricId === "cpc" || metricId === "cpm" || metricId === "cpa_blended";
}

// ─── Breakdown row shape ──────────────────────────────────────────────

export interface BreakdownRow {
  key: string;
  label: string;
  /** Metric value for this group; null renders as "n/a" — never zero. */
  value: number | null;
  formatted: string;
  /** Context columns for the table. */
  spend: number | null;
  results: number | null;
  /** Manager scope: this account's own reporting window label. */
  windowLabel?: string | null;
  /** Honest reason when value is null. */
  note?: string;
}

function toRow(key: string, label: string, metricId: string, t: BreakdownTotals, extra?: Partial<BreakdownRow>): BreakdownRow {
  const value = metricValueFromTotals(metricId, t);
  return {
    key, label, value,
    formatted: formatBreakdownValue(metricId, value),
    spend: t.spend, results: t.results,
    ...extra,
  };
}

export function sortBreakdownRows(rows: BreakdownRow[], dir: "asc" | "desc"): BreakdownRow[] {
  const withValue = rows.filter((r) => r.value != null);
  const naRows = rows.filter((r) => r.value == null);
  withValue.sort((a, b) => (dir === "asc" ? a.value! - b.value! : b.value! - a.value!));
  return [...withValue, ...naRows]; // n/a rows always trail
}

// ─── Manager scope: per-account breakdown ─────────────────────────────

export interface IsoWindow { start: string; end: string }

export function accountReportingWindow(a: AdAccount): IsoWindow | null {
  const cs = a.iap?.campaign_summary;
  if (!cs?.window_start || !cs.window_end) return null;
  return { start: cs.window_start, end: cs.window_end };
}

export function accountTotalsForMetric(a: AdAccount, metricId: string): BreakdownTotals {
  const cs = a.iap?.campaign_summary;
  if (!cs) return EMPTY_TOTALS;
  const events = Object.entries(cs.bottom_line_totals);
  if (metricId.startsWith("result:")) {
    const key = metricId.slice("result:".length);
    const e = cs.bottom_line_totals[key];
    // Account doesn't track this event → all-null totals ⇒ honest n/a.
    if (!e) return EMPTY_TOTALS;
    return {
      spend: e.spend, impressions: e.impressions, reach: e.reach,
      clicksAll: e.clicks_all, linkClicks: e.link_clicks, results: e.results,
    };
  }
  let reach: number | null = null;
  let clicksAll: number | null = null;
  let results: number | null = null;
  for (const [, e] of events) {
    reach = add(reach, e.reach);
    clicksAll = add(clicksAll, e.clicks_all);
    results = add(results, e.results);
  }
  return {
    spend: cs.total_spend_usd ?? null,
    impressions: cs.total_impressions ?? null,
    linkClicks: cs.total_link_clicks ?? null,
    reach, clicksAll, results,
  };
}

export function fmtWindowLabel(w: IsoWindow | null): string {
  if (!w) return "window unknown";
  return `${w.start} → ${w.end}`;
}

/**
 * Manager modal rows: one per configured account, each valued over the
 * account's own native reporting window (labeled per row). Metrics an
 * account can't compute (tracking basis, missing event) come back null.
 */
export function buildManagerBreakdown(accounts: AdAccount[], metricId: string): BreakdownRow[] {
  return accounts
    .filter((a) => a.status === "configured" && a.iap?.campaign_summary)
    .map((a) => {
      const t = accountTotalsForMetric(a, metricId);
      const row = toRow(a.id, a.name, metricId, t, {
        windowLabel: fmtWindowLabel(accountReportingWindow(a)),
      });
      if (row.value == null) {
        row.note = metricId.startsWith("result:")
          ? `${a.name} doesn't track this result event.`
          : `Not available for ${a.name}'s tracking basis.`;
      }
      return row;
    });
}

/**
 * Common overlap window across accounts' reporting windows.
 * Null when no account has a dated window, or the windows don't intersect.
 */
export function computeOverlapWindow(windows: (IsoWindow | null)[]): IsoWindow | null {
  const dated = windows.filter((w): w is IsoWindow => w != null);
  if (dated.length === 0) return null;
  const start = dated.map((w) => w.start).sort().at(-1)!;
  const end = dated.map((w) => w.end).sort()[0]!;
  return start <= end ? { start, end } : null;
}

// ─── Account scope: dimension catalog ─────────────────────────────────

export interface BreakdownDimension {
  id: string;
  label: string;
  /** conversion-tracking dimensions can only pair with basis-shared metrics. */
  basis: "delivery" | "conversion";
}

const VARIABLE_FAMILY_LABELS: Record<string, string> = {
  hook: "Hook variables",
  tone: "Tone variables",
  framework: "Framework variables",
  concept: "Concept variables",
  pain_proof: "Pain/proof variables",
  proof: "Proof variables",
  cta: "CTA variables",
  communication: "Communication variables",
  copy: "Copy variables",
  funnel_stage: "Funnel-stage variables",
  awareness: "Awareness variables",
  // Not a registry family. The parser emits this for tokens lifted straight
  // out of an ad name when nothing else matched, so the picker offered
  // "raw_token variables" — an internal family id read aloud in a menu.
  raw_token: "Ad-name token",
};

function familyLabel(family: string): string {
  const known = VARIABLE_FAMILY_LABELS[family.toLowerCase()];
  if (known) return known;
  // A family the map has not met is still an id; interpolating it raw is how
  // "raw_token variables" reached the picker in the first place.
  const humanised = family.replace(/[_-]+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
  return `${humanised} variables`;
}

/** Dimensions actually backed by rows in this account's analysis data. */
export function listBreakdownDimensions(a: AnalysisData | null | undefined): BreakdownDimension[] {
  if (!a) return [];
  const dims: BreakdownDimension[] = [];
  // Partial analysis bundles (older fixtures/imports) may omit arrays.
  if ((a.performance_by_cell ?? []).length > 0) {
    dims.push({ id: "concept", label: "Concept", basis: "delivery" });
    dims.push({ id: "cell", label: "Creative cell", basis: "delivery" });
  }
  const families = [
    ...new Set(
      scopeToRun(a.v3_variable_performance ?? [], a.latest_analysis_run_id ?? null).map((r) => r.variable_family),
    ),
  ];
  for (const f of families) dims.push({ id: `var:${f}`, label: familyLabel(f), basis: "delivery" });
  if ((a.demographic_registration_signal ?? []).length > 0) {
    dims.push({ id: "avatar", label: "Avatar segment (age × gender)", basis: "delivery" });
  }
  const placements = [...(a.v3_placement_signal ?? []), ...(a.c4e_placement_signal ?? [])];
  if (placements.length > 0) {
    dims.push({ id: "placement", label: "Placement", basis: "delivery" });
    dims.push({ id: "platform", label: "Platform", basis: "delivery" });
  }
  // Delivery-based device breakdown can be entirely absent for a window even
  // when placement/platform are present — Meta's export can omit the
  // "Impression device" column (see conversion_tracking_signal.devices for
  // the funnel-attributed fallback in that case).
  if ((a.device_delivery_signal ?? []).length > 0) {
    dims.push({ id: "device", label: "Device", basis: "delivery" });
  }
  const conv = a.conversion_tracking_signal;
  if (conv) {
    if (conv.devices.length > 0) dims.push({ id: "conv:device", label: "Device (conversion basis)", basis: "conversion" });
    if (conv.platforms.length > 0) dims.push({ id: "conv:platform", label: "Platform (conversion basis)", basis: "conversion" });
    if (conv.placements.length > 0) dims.push({ id: "conv:placement", label: "Placement (conversion basis)", basis: "conversion" });
  }
  return dims;
}

/**
 * Tracking-basis + grain rules for a dimension × metric pair.
 * Returns null when supported, else an honest reason string.
 */
/**
 * Metrics that cannot exist for an ad-name token, however the import went.
 * CTR and CPM are included because both divide by impressions.
 */
const TOKEN_UNMEASURABLE = new Set(["impressions", "reach", "clicks_all", "ctr_all", "link_ctr", "cpm"]);

export function dimensionMetricRestriction(dimensionId: string, metricId: string): string | null {
  if (dimensionId.startsWith("conv:")) {
    // Conversion-attributed rows carry no spend/impressions by design —
    // link clicks is the only field shared with the delivery basis.
    return metricId === "link_clicks"
      ? null
      : "Conversion-basis rows carry no delivery data (spend, impressions) — delivery metrics never mix with conversion tracking. Only link clicks is available here.";
  }
  if (metricId.startsWith("result:") && !(dimensionId === "cell" || dimensionId === "concept" || dimensionId.startsWith("var:"))) {
    return "The demographic and placement exports carry no result-type column, so per-event results can't be honestly scoped to this dimension.";
  }
  if ((dimensionId === "placement" || dimensionId === "platform" || dimensionId === "device") && (metricId === "reach" || metricId === "clicks_all" || metricId === "ctr_all")) {
    return "Placement/device rows don't carry reach or clicks (all) in this import.";
  }
  if (dimensionId === "var:raw_token" && TOKEN_UNMEASURABLE.has(metricId)) {
    // Structural, not a gap in one import. An ad-name token is a substring
    // shared by many ads, so it has no impression count of its own:
    // analysisEngine's variablePerformancePayload writes Reach, Impressions
    // and Clicks (all) as literal 0 "so numeric consumers don't receive
    // undefined", and sets CTR_link_pct to null for the same reason.
    //
    // Those zeros then rendered as a measurement. The Impressions breakdown
    // for this dimension was a column of "0" against tokens that had really
    // spent thousands — which reads as "these tokens got no impressions"
    // rather than "impressions are not attributable to a token at all".
    return "An ad-name token is a substring shared across many ads, so it has no impressions, reach or clicks of its own — only spend, link clicks and results are attributable at this level.";
  }
  return null;
}

// ─── Account scope: row builders ──────────────────────────────────────

function cellRowTotals(r: CellPerformanceRow): Partial<BreakdownTotals> {
  return {
    spend: r["Amount spent (USD)"], impressions: r.Impressions, reach: r.Reach,
    clicksAll: r["Clicks (all)"], linkClicks: r["Link clicks"], results: r.Results,
  };
}

function groupRows<T>(
  rows: T[],
  keyOf: (r: T) => string,
  labelOf: (r: T) => string,
  totalsOf: (r: T) => Partial<BreakdownTotals>,
  metricId: string,
): BreakdownRow[] {
  const map = new Map<string, { label: string; totals: BreakdownTotals }>();
  for (const r of rows) {
    const key = keyOf(r);
    const prev = map.get(key);
    if (prev) prev.totals = addTotals(prev.totals, totalsOf(r));
    else map.set(key, { label: labelOf(r), totals: addTotals(EMPTY_TOTALS, totalsOf(r)) });
  }
  return [...map.entries()].map(([key, g]) => toRow(key, g.label, metricId, g.totals));
}

/**
 * Account modal rows for a dimension × metric. Rows come pre-scoped —
 * pass cell rows already filtered by the active data window / run scope.
 */
export function buildAccountBreakdown(
  a: AnalysisData,
  dimensionId: string,
  metricId: string,
  scopedCellRows?: CellPerformanceRow[],
): BreakdownRow[] {
  if (dimensionMetricRestriction(dimensionId, metricId) != null) return [];
  const eventKey = metricId.startsWith("result:") ? metricId.slice("result:".length) : null;
  const cellRows = (scopedCellRows ?? a.performance_by_cell ?? []).filter(
    (r) => eventKey == null || r["Result type"] === eventKey,
  );

  if (dimensionId === "cell") {
    return groupRows(cellRows, (r) => r.cell_id, (r) => `${r.cell_id} · ${r.book2_concept_name}`, cellRowTotals, metricId);
  }
  if (dimensionId === "concept") {
    return groupRows(cellRows, (r) => r.book2_concept_name, (r) => r.book2_concept_name, cellRowTotals, metricId);
  }
  if (dimensionId.startsWith("var:")) {
    const family = dimensionId.slice("var:".length);
    // Scoped first: variable_performance keeps one row per analysis run, so
    // grouping the raw array sums the same variable once per run.
    const rows = scopeToRun(a.v3_variable_performance ?? [], a.latest_analysis_run_id ?? null).filter(
      (r) => r.variable_family === family && (eventKey == null || r["Result type"] === eventKey),
    );
    return groupRows(rows, (r) => r.variable_id, (r) => r.variable_id, (r) => ({
      spend: r["Amount spent (USD)"], impressions: r.Impressions, reach: r.Reach,
      clicksAll: r["Clicks (all)"], linkClicks: r["Link clicks"], results: r.Results,
    }), metricId);
  }
  if (dimensionId === "avatar") {
    return groupRows(a.demographic_registration_signal ?? [], (r) => `${r.Age}|${r.Gender}`, (r) => `${r.Age} · ${r.Gender}`, (r) => ({
      spend: r["Amount spent (USD)"], impressions: r.Impressions, reach: r.Reach,
      clicksAll: r["Clicks (all)"], linkClicks: r["Link clicks"], results: r.Results,
    }), metricId);
  }
  if (dimensionId === "placement" || dimensionId === "platform") {
    const rows: PlacementRow[] = [...(a.v3_placement_signal ?? []), ...(a.c4e_placement_signal ?? [])];
    const keyOf = (r: PlacementRow) => (dimensionId === "placement" ? r.Placement : r.Platform);
    // Key stays the raw value (it is what filtering joins on); only the
    // displayed label is humanised.
    const labelOf = (r: PlacementRow) =>
      dimensionId === "placement" ? r.Placement : platformLabel(r.Platform);
    return groupRows(rows, keyOf, labelOf, (r) => ({
      spend: r["Amount spent (USD)"], impressions: r.Impressions,
      linkClicks: r["Link clicks"], results: r.Results,
    }), metricId);
  }
  if (dimensionId === "device") {
    const rows: DeviceDeliveryRow[] = a.device_delivery_signal ?? [];
    return groupRows(rows, (r) => r.device, (r) => deviceLabel(r.device), (r) => ({
      spend: r.spend, impressions: r.impressions, linkClicks: r.link_clicks, results: r.results,
    }), metricId);
  }
  if (dimensionId.startsWith("conv:")) {
    const conv = a.conversion_tracking_signal;
    if (!conv) return [];
    if (dimensionId === "conv:device") {
      return groupRows(conv.devices, (r) => r.device, (r) => deviceLabel(r.device), (r) => ({ linkClicks: r.link_clicks }), metricId);
    }
    if (dimensionId === "conv:platform") {
      return groupRows(conv.platforms, (r) => r.platform, (r) => platformLabel(r.platform), (r) => ({ linkClicks: r.link_clicks }), metricId);
    }
    return groupRows(conv.placements, (r) => r.placement, (r) => r.placement, (r) => ({ linkClicks: r.link_clicks }), metricId);
  }
  return [];
}

/** Friendly metric label for result-event metrics without a catalog lookup. */
export function breakdownMetricLabel(metricId: string, catalogLabel?: string): string {
  if (catalogLabel) return catalogLabel;
  return metricId.startsWith("result:") ? eventLabel(metricId.slice("result:".length)) : metricId;
}
