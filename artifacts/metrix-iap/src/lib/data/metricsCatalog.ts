// ─── Customizable overview metric catalog ─────────────────────────────
// Small shared list of metrics the Manager/Ad Account overview tile rows
// can be customized to show. Only metrics that exist in the seed data
// model today are included — see replit.md for the value-based metrics
// (ROAS, purchase value, unique clicks) intentionally left out because no
// underlying field exists anywhere in the bundle.

import { fmtUSD, fmtNum, fmtPct, eventLabel, costPerResultLabel } from "@/pages/metrix/shared";
import type { CampaignSummary, CellPerformanceRow, ManagerBottomLineTotals, SeedResultEventTotals } from "./seedTypes";

export interface MetricResultEvent {
  key: string;
  label: string;
  /** Null when the source could not measure this event's results — never 0. */
  results: number | null;
  /** Null when the source could not measure this event's spend — never 0. */
  spend: number | null;
}

/** Normalized numeric source both overview scopes can build a catalog from. */
export interface MetricSource {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicksAll: number | null;
  linkClicks: number | null;
  linkCtrPct: number | null;
  resultEvents: MetricResultEvent[];
  /** True when >1 result-event type is present; delivery totals (reach, clicks) are cross-event sums and may over-count. */
  isMultiEvent: boolean;
}

/**
 * Reach and Clicks (all) are summed across all result-event rows.
 * For single-event accounts this is exact. For multi-event accounts Meta's
 * per-event attribution windows can overlap, so the sum is an upper-bound
 * estimate — we surface the figure with a caveat sub-label rather than
 * hiding it entirely as "—".
 */
function accountLevelDeliveryTotal(events: [string, SeedResultEventTotals][], pick: (e: SeedResultEventTotals) => number): number | null {
  if (events.length === 0) return null;
  return events.reduce((s, [, e]) => s + pick(e), 0);
}

export function metricSourceFromCampaignSummary(cs: CampaignSummary): MetricSource {
  const events = Object.entries(cs.bottom_line_totals);
  return {
    spend: cs.total_spend_usd,
    impressions: cs.total_impressions,
    reach: accountLevelDeliveryTotal(events, (e) => e.reach),
    clicksAll: accountLevelDeliveryTotal(events, (e) => e.clicks_all),
    linkClicks: cs.total_link_clicks,
    linkCtrPct: cs.overall_link_ctr_pct,
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results, spend: e.spend })),
    isMultiEvent: events.length > 1,
  };
}

/** Shape of API summary totals (analysis runs / date presets) — structurally a CampaignSummary subset. */
export interface ApiTotalsLike {
  total_spend_usd: number;
  total_impressions: number;
  total_link_clicks: number;
  overall_link_ctr_pct: number | null;
  bottom_line_totals?: Record<string, SeedResultEventTotals>;
}

export function metricSourceFromApiTotals(t: ApiTotalsLike): MetricSource {
  const events = Object.entries(t.bottom_line_totals ?? {});
  return {
    spend: t.total_spend_usd,
    impressions: t.total_impressions,
    reach: accountLevelDeliveryTotal(events, (e) => e.reach),
    clicksAll: accountLevelDeliveryTotal(events, (e) => e.clicks_all),
    linkClicks: t.total_link_clicks,
    linkCtrPct: t.overall_link_ctr_pct,
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results, spend: e.spend })),
    isMultiEvent: events.length > 1,
  };
}

export function metricSourceFromManagerTotals(totals: ManagerBottomLineTotals): MetricSource {
  const events = Object.entries(totals.result_totals_by_event);
  return {
    spend: totals.spend_usd,
    impressions: totals.impressions,
    reach: accountLevelDeliveryTotal(events, (e) => e.reach),
    clicksAll: accountLevelDeliveryTotal(events, (e) => e.clicks_all),
    linkClicks: totals.link_clicks,
    linkCtrPct: totals.link_ctr_pct,
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results, spend: e.spend })),
    isMultiEvent: events.length > 1,
  };
}

/** Static (non-result-event) metric ids, in catalog display order. */
export const STATIC_METRIC_IDS = [
  "spend",
  "impressions",
  "reach",
  "clicks_all",
  "link_clicks",
  "link_ctr",
  "ctr_all",
  "cpc",
  "cpm",
  "cpa_blended",
  "cvr",
] as const;
export type StaticMetricId = (typeof STATIC_METRIC_IDS)[number];

/** Metric ids shown by default, matching the previous hardcoded tile row. */
export const DEFAULT_METRIC_IDS: string[] = ["spend", "impressions", "link_clicks", "link_ctr"];

export function resultMetricId(eventKey: string): string {
  return `result:${eventKey}`;
}

/** Cost-per-result metric id for one real event type — e.g. "cost:Website purchases". */
export function resultCostMetricId(eventKey: string): string {
  return `cost:${eventKey}`;
}

export interface MetricDef {
  id: string;
  label: string;
  /** Raw numeric value, null when there's honestly no data for it. */
  value: number | null;
  formatted: string;
  /** True for per-result-event metrics (dynamic, account-specific). */
  isResultEvent: boolean;
  /** Underlying result-event key, present only when isResultEvent is true. */
  eventKey?: string;
  /** Optional tile subtitle (caveats, derivations). */
  sub?: string;
  /** True for derived ratios that should be omitted entirely (not shown as "—") when the source can't compute them. */
  hideWhenNull?: boolean;
}

/**
 * Build the full pickable catalog (static + derived + this account's own
 * result events) from a source. Metrics the source honestly cannot compute
 * (null value) are omitted entirely — never rendered as blank tiles.
 */
export function buildMetricCatalog(source: MetricSource): MetricDef[] {
  // Strict: null if ANY event's results are unmeasured, so every metric
  // derived from the total (CPA blended, CVR) stays null rather than being
  // computed against a partial sum that looks complete.
  const totalResults = source.resultEvents.some((e) => e.results == null)
    ? null
    : source.resultEvents.reduce((n, e) => n + (e.results ?? 0), 0);
  const cpaBlended = source.spend != null && totalResults != null && totalResults > 0 ? source.spend / totalResults : null;
  // For multi-event accounts, delivery totals (reach, clicks) are cross-event
  // sums that may over-count — flag them with a small caveat sub-label.
  const deliverySub = source.isMultiEvent ? "est. across events" : undefined;

  // ── Derived metrics — only when the underlying data supports them ──
  // CTR-family null guard: clicks > impressions indicates a Meta
  // conversion-basis export; emit null instead of a bogus percentage.
  const ctrAll =
    source.clicksAll != null && source.impressions != null && source.impressions > 0 && source.clicksAll <= source.impressions
      ? (source.clicksAll / source.impressions) * 100
      : null;
  const cpc = source.spend != null && source.linkClicks != null && source.linkClicks > 0
    ? source.spend / source.linkClicks
    : null;
  const cpm = source.spend != null && source.impressions != null && source.impressions > 0
    ? (source.spend / source.impressions) * 1000
    : null;
  const cvr = source.linkClicks != null && source.linkClicks > 0 && totalResults != null && totalResults > 0 && totalResults <= source.linkClicks
    ? (totalResults / source.linkClicks) * 100
    : null;

  const catalog: MetricDef[] = [
    { id: "spend", label: "Total spend", value: source.spend, formatted: fmtUSD(source.spend), isResultEvent: false },
    { id: "impressions", label: "Impressions", value: source.impressions, formatted: fmtNum(source.impressions), isResultEvent: false },
    { id: "reach", label: "Reach", value: source.reach, formatted: fmtNum(source.reach), isResultEvent: false, ...(deliverySub ? { sub: deliverySub } : {}) },
    { id: "clicks_all", label: "Clicks (all)", value: source.clicksAll, formatted: fmtNum(source.clicksAll), isResultEvent: false, ...(deliverySub ? { sub: deliverySub } : {}) },
    { id: "link_clicks", label: "Link clicks", value: source.linkClicks, formatted: fmtNum(source.linkClicks), isResultEvent: false },
    { id: "link_ctr", label: "Link CTR", value: source.linkCtrPct, formatted: fmtPct(source.linkCtrPct), isResultEvent: false },
    { id: "ctr_all", label: "CTR (all)", value: ctrAll, formatted: fmtPct(ctrAll), isResultEvent: false, sub: "clicks (all) ÷ impressions", hideWhenNull: true },
    { id: "cpc", label: "CPC", value: cpc, formatted: cpc != null ? fmtUSD(cpc) : "—", isResultEvent: false, sub: "spend ÷ link clicks", hideWhenNull: true },
    { id: "cpm", label: "CPM", value: cpm, formatted: cpm != null ? fmtUSD(cpm) : "—", isResultEvent: false, sub: "spend ÷ impressions × 1,000", hideWhenNull: true },
    { id: "cpa_blended", label: "CPA (blended)", value: cpaBlended, formatted: cpaBlended != null ? fmtUSD(cpaBlended) : "—", isResultEvent: false, sub: "spend ÷ all results" },
    { id: "cvr", label: "CVR", value: cvr, formatted: cvr != null ? fmtPct(cvr) : "—", isResultEvent: false, sub: "results ÷ link clicks", hideWhenNull: true },
  ];

  // ── Per-objective cost metrics — one "Cost per X" per real event type ──
  // this account reports (never a fixed Purchase/Lead/etc. list); omitted
  // entirely when the event has zero results (no division by zero).
  for (const e of source.resultEvents) {
    catalog.push({
      id: resultMetricId(e.key),
      label: e.label,
      value: e.results,
      formatted: fmtNum(e.results),
      isResultEvent: true,
      eventKey: e.key,
    });
    const costPerResult = e.spend != null && e.results != null && e.results > 0 ? e.spend / e.results : null;
    catalog.push({
      id: resultCostMetricId(e.key),
      label: costPerResultLabel(e.key),
      value: costPerResult,
      formatted: costPerResult != null ? fmtUSD(costPerResult) : "—",
      isResultEvent: true,
      eventKey: e.key,
      sub: `spend ÷ ${e.label.toLowerCase()}`,
      hideWhenNull: true,
    });
  }

  // Hide derived metrics the source can't compute — no blank "—" entries in
  // dropdowns for ratios we chose to add. Base source metrics keep their
  // long-standing "—" behavior (diagnostic modal renders their honest
  // empty state when a value is null).
  return catalog.filter((m) => m.value != null || !m.hideWhenNull);
}

export function metricById(catalog: MetricDef[], id: string): MetricDef | null {
  return catalog.find((m) => m.id === id) ?? null;
}

// ─── IAP Library tile catalog ─────────────────────────────────────────
// Built from the library's metric- and range-filtered performance_by_cell
// rows so the tiles always agree with the grid below them. Delivery
// metrics (impressions, reach, clicks) are only summed when a single
// result event is selected — rows are per (cell, result event) and the
// same delivery can back multiple events, so summing across events would
// double-count. Spend/results keep the existing "sum of selection"
// semantics (the user explicitly picked which events count).

export const LIBRARY_METRIC_STORAGE_KEY = "metrix.library.metric_tiles.v1";
export const LIBRARY_DEFAULT_METRIC_IDS: string[] = ["lib_cells", "lib_spend", "lib_results", "lib_cpa"];

export function buildLibraryMetricCatalog(rows: CellPerformanceRow[]): MetricDef[] {
  const uniqueCells = new Set(rows.map((r) => r.cell_id)).size;
  const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
  const results = rows.reduce((s, r) => s + r.Results, 0);
  const cpa = results > 0 ? spend / results : null;

  const singleEvent = new Set(rows.map((r) => r["Result type"])).size <= 1;
  const deliverySum = (pick: (r: CellPerformanceRow) => number): number | null =>
    singleEvent && rows.length > 0 ? rows.reduce((s, r) => s + pick(r), 0) : null;

  const impressions = deliverySum((r) => r.Impressions);
  const reach = deliverySum((r) => r.Reach);
  const linkClicks = deliverySum((r) => r["Link clicks"]);
  const clicksAll = deliverySum((r) => r["Clicks (all)"]);
  const ctr = impressions != null && impressions > 0 && linkClicks != null ? (linkClicks / impressions) * 100 : null;
  const multiEventSub = singleEvent ? undefined : "select one event to see delivery totals";

  // ── Lower-funnel: conversion event aggregates ─────────────────────
  //
  // ATTRIBUTION GRAIN: performance_by_cell has one row per cell×result-event.
  // The same physical funnel action (ATC, checkout) appears on every event row
  // for a cell — summing across multiple events would double-count. All lower-
  // funnel totals are therefore guarded by singleEvent (same rule as delivery
  // metrics above). When multiple events are selected the tiles show null with
  // a "select one event" sub-label.
  //
  // CVR: results per link click — both denominators share the same grain,
  // so it is naturally null when linkClicks is null (multi-event).
  const cvr = results > 0 && linkClicks != null && linkClicks > 0
    ? (results / linkClicks) * 100
    : null;

  // adds_to_cart / checkouts_initiated are optional fields; null means not measured.
  // Only aggregate when singleEvent to avoid cross-event double-counting.
  const hasAtcData = singleEvent && rows.some((r) => r.adds_to_cart != null);
  const hasChkData = singleEvent && rows.some((r) => r.checkouts_initiated != null);
  const totalAtc = hasAtcData
    ? rows.reduce((s, r) => s + (r.adds_to_cart ?? 0), 0)
    : null;
  const totalChk = hasChkData
    ? rows.reduce((s, r) => s + (r.checkouts_initiated ?? 0), 0)
    : null;
  // Spend denominator for cost metrics: use singleEvent spend (same grain).
  // When multi-event, totalAtc/totalChk are null so cost metrics are also null.
  const singleEventSpend = singleEvent ? spend : null;

  const atcRate = totalAtc != null && linkClicks != null && linkClicks > 0
    ? (totalAtc / linkClicks) * 100
    : null;
  const checkoutRate = totalChk != null && linkClicks != null && linkClicks > 0
    ? (totalChk / linkClicks) * 100
    : null;
  const costPerAtc = totalAtc != null && totalAtc > 0 && singleEventSpend != null
    ? singleEventSpend / totalAtc
    : null;
  const costPerCheckout = totalChk != null && totalChk > 0 && singleEventSpend != null
    ? singleEventSpend / totalChk
    : null;

  const noConvSub = !singleEvent
    ? "select one event to see funnel metrics"
    : "no conversion-event data in selection";

  const def = (id: string, label: string, value: number | null, formatted: string, sub?: string): MetricDef => ({
    id, label, value, formatted, isResultEvent: false, ...(sub ? { sub } : {}),
  });

  return [
    def("lib_cells",           "Creative cells",      uniqueCells,   fmtNum(uniqueCells)),
    def("lib_spend",           "Spend (selected)",    spend,         fmtUSD(spend, 0)),
    def("lib_results",         "Results (selected)",  results,       fmtNum(results)),
    def("lib_cpa",             "Avg CPA",             cpa,           cpa != null ? fmtUSD(cpa) : "—",     "spend ÷ results across selection"),
    def("lib_impressions",     "Impressions",         impressions,   fmtNum(impressions),                  multiEventSub),
    def("lib_reach",           "Reach",               reach,         fmtNum(reach),                        multiEventSub),
    def("lib_link_clicks",     "Link clicks",         linkClicks,    fmtNum(linkClicks),                   multiEventSub),
    def("lib_clicks_all",      "Clicks (all)",        clicksAll,     fmtNum(clicksAll),                    multiEventSub),
    def("lib_link_ctr",        "Link CTR",            ctr,           ctr != null ? fmtPct(ctr) : "—",     multiEventSub ?? "link clicks ÷ impressions"),
    // ── Lower-funnel tiles ───────────────────────────────────────────
    def("lib_cvr",             "CVR",                 cvr,           cvr != null ? fmtPct(cvr) : "—",     "results ÷ link clicks"),
    def("lib_atc_rate",        "ATC rate",            atcRate,       atcRate != null ? fmtPct(atcRate) : "—",  hasAtcData ? "adds-to-cart ÷ link clicks" : noConvSub),
    def("lib_checkout_rate",   "Checkout rate",       checkoutRate,  checkoutRate != null ? fmtPct(checkoutRate) : "—", hasChkData ? "checkouts ÷ link clicks" : noConvSub),
    def("lib_cost_per_atc",    "Cost / ATC",          costPerAtc,    costPerAtc != null ? fmtUSD(costPerAtc) : "—", hasAtcData ? "spend ÷ adds-to-cart" : noConvSub),
    def("lib_cost_per_checkout","Cost / Checkout",    costPerCheckout, costPerCheckout != null ? fmtUSD(costPerCheckout) : "—", hasChkData ? "spend ÷ checkouts initiated" : noConvSub),
  ];
}
