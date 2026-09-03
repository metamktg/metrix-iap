// ─── Customizable overview metric catalog ─────────────────────────────
// Small shared list of metrics the Manager/Ad Account overview tile rows
// can be customized to show. Only metrics that exist in the seed data
// model today are included — see replit.md for the value-based metrics
// (ROAS, purchase value, unique clicks) intentionally left out because no
// underlying field exists anywhere in the bundle.

import { fmtUSD, fmtNum, fmtPct, eventLabel, costPerResultLabel } from "@/pages/metrix/shared";
import { sumStrictWithCoverage, type StrictSum } from "@/lib/strict-sum";
import { blendableEvents, classifyResultEvent, type EvaluationScale } from "@/lib/resultEvents";
import type { CampaignSummary, CellPerformanceRow, ManagerBottomLineTotals, SeedResultEventTotals } from "./seedTypes";

export interface MetricResultEvent {
  key: string;
  label: string;
  /** Null when the source could not measure this event's results — never 0. */
  results: number | null;
  /** Null when the source could not measure this event's spend — never 0. */
  spend: number | null;
  /** Impressions the event's ads delivered — the denominator of an awareness event's own rate. */
  impressions?: number | null;
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
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results, spend: e.spend, impressions: e.impressions })),
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
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results, spend: e.spend, impressions: e.impressions })),
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
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results, spend: e.spend, impressions: e.impressions })),
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

/** Own-rate metric id for an awareness event — e.g. "rate:ThruPlays" (results ÷ impressions). */
function resultRateMetricId(eventKey: string): string {
  return `rate:${eventKey}`;
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
  // Blended results are TERMINAL CONVERSION events only (resultEvents.ts
  // blendableEvents — a purchase and a lead, never a checkout step, never
  // a ThruPlay). With one terminal event the blend IS that event; with none
  // there is nothing honest to blend and the tiles hide themselves. Strict:
  // null if any blended event's results are unmeasured, so a derived figure
  // never reads complete over a partial sum.
  const blendKeys = blendableEvents(source.resultEvents.map((e) => e.key));
  const blendEvents =
    blendKeys.length >= 2
      ? source.resultEvents.filter((e) => blendKeys.includes(e.key))
      : source.resultEvents.filter((e) => { const c = classifyResultEvent(e.key); return c.intent === "conversion" && c.stage === "terminal"; });
  const blendLabel = blendEvents.length > 1 ? "conversions" : (blendEvents[0] ? blendEvents[0].label.toLowerCase() : "conversions");
  const totalResults = blendEvents.length === 0 || blendEvents.some((e) => e.results == null)
    ? null
    : blendEvents.reduce((n, e) => n + (e.results ?? 0), 0);
  const blendSpend = blendEvents.length === 0 || blendEvents.some((e) => e.spend == null)
    ? null
    : blendEvents.reduce((n, e) => n + (e.spend ?? 0), 0);
  const cpaBlended = blendSpend != null && totalResults != null && totalResults > 0 ? blendSpend / totalResults : null;
  const blendSub = blendEvents.length > 1
    ? `spend ÷ results across ${blendEvents.map((e) => e.label.toLowerCase()).join(" + ")} — terminal conversion events only`
    : blendEvents.length === 1
      ? `spend ÷ ${blendLabel} — the account's one terminal conversion event`
      : "no terminal conversion event in this source — awareness and traffic events are never blended into a cost per result";
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
    { id: "results_blended", label: blendEvents.length > 1 ? "Conversions (blended)" : "Conversions", value: totalResults, formatted: fmtNum(totalResults), isResultEvent: false, sub: blendEvents.length > 0 ? blendEvents.map((e) => e.label).join(" + ") : blendSub, hideWhenNull: true },
    { id: "cpa_blended", label: blendEvents.length > 1 ? "Cost per conversion (blended)" : "Cost per conversion", value: cpaBlended, formatted: cpaBlended != null ? fmtUSD(cpaBlended) : "—", isResultEvent: false, sub: blendSub, hideWhenNull: blendEvents.length === 0 },
    { id: "cvr", label: "CVR", value: cvr, formatted: cvr != null ? fmtPct(cvr) : "—", isResultEvent: false, sub: `${blendLabel} ÷ link clicks`, hideWhenNull: true },
  ];

  // ── Per-objective cost metrics — one "Cost per X" per real event type ──
  // this account reports (never a fixed Purchase/Lead/etc. list); omitted
  // entirely when the event has zero results (no division by zero).
  // Each event on ITS OWN scale (owner direction 2026-09-03): a cost per
  // result for purchase-intent and traffic events; for an awareness event
  // the event's own rate (ThruPlays ÷ impressions) — never a cost per
  // ThruPlay, which would weight reach against a purchase.
  for (const e of source.resultEvents) {
    const c = classifyResultEvent(e.key);
    catalog.push({
      id: resultMetricId(e.key),
      label: e.label,
      value: e.results,
      formatted: fmtNum(e.results),
      isResultEvent: true,
      eventKey: e.key,
      sub: c.intent === "awareness" ? "awareness event · communication scale" : c.intent === null ? "result type not placed on a scale" : undefined,
    });
    if (c.scale === "communication") {
      const rate = e.impressions != null && e.impressions > 0 && e.results != null && e.results <= e.impressions ? (e.results / e.impressions) * 100 : null;
      catalog.push({
        id: resultRateMetricId(e.key),
        label: `${c.noun.charAt(0).toUpperCase() + c.noun.slice(1)} rate`,
        value: rate,
        formatted: rate != null ? fmtPct(rate) : "—",
        isResultEvent: true,
        eventKey: e.key,
        sub: `${e.label.toLowerCase()} ÷ impressions — an awareness event is read on communication signals, never cost per result`,
        hideWhenNull: true,
      });
      continue;
    }
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

export interface LibraryCatalogScope {
  /** The scale the rows are judged on; communication hides cost per result and leads with CPM / CTR / frequency. */
  scale?: EvaluationScale | null;
  /** The scope's label for the results tiles ("Purchases", "All conversions"). */
  label?: string;
}

export function buildLibraryMetricCatalog(rows: CellPerformanceRow[], scopeInfo: LibraryCatalogScope = {}): MetricDef[] {
  const uniqueCells = new Set(rows.map((r) => r.cell_id)).size;
  const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
  const results = rows.reduce((s, r) => s + r.Results, 0);
  const communication = scopeInfo.scale === "communication";
  const cpa = !communication && results > 0 ? spend / results : null;
  const resultsLabel = scopeInfo.label ? `${scopeInfo.label}` : "Results (selected)";

  const singleEvent = new Set(rows.map((r) => r["Result type"])).size <= 1;
  const deliverySum = (pick: (r: CellPerformanceRow) => number): number | null =>
    singleEvent && rows.length > 0 ? rows.reduce((s, r) => s + pick(r), 0) : null;

  const impressions = deliverySum((r) => r.Impressions);
  const reach = deliverySum((r) => r.Reach);
  const linkClicks = deliverySum((r) => r["Link clicks"]);
  const clicksAll = deliverySum((r) => r["Clicks (all)"]);
  const ctr = impressions != null && impressions > 0 && linkClicks != null ? (linkClicks / impressions) * 100 : null;
  const multiEventSub = singleEvent ? undefined : "select one event to see delivery totals";
  // Communication scale (awareness scope): the event's own rate, CPM and
  // frequency lead; cost per result is not a verdict here and is omitted.
  const cpm = impressions != null && impressions > 0 ? (spend / impressions) * 1000 : null;
  const frequency = impressions != null && reach != null && reach > 0 && reach <= impressions ? impressions / reach : null;
  const resultRate = communication && impressions != null && impressions > 0 && results <= impressions ? (results / impressions) * 100 : null;

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

  // adds_to_cart / checkouts_initiated are optional fields; null means not
  // measured on that row (Meta reports a real 0 when the column is present
  // and the ad had no such events — absence is absence, not zero).
  //
  // These used to aggregate on "ANY row carries the field", folding the rest
  // with `?? 0`: three measured cells out of eleven produced a total that
  // rendered exactly like a complete one and was then divided by a COMPLETE
  // link-click denominator, understating every downstream rate. They now
  // follow the one aggregation-null policy (lib/strict-sum) — null unless
  // every row in the selection carries the field — and report coverage so
  // the null can be explained rather than shown as a bare dash.
  //
  // Still gated on singleEvent first: rows are per (cell, result event) and
  // the same physical funnel action appears on each of a cell's event rows,
  // so summing across events would double-count regardless of coverage.
  const atc = singleEvent ? sumStrictWithCoverage(rows, (r) => r.adds_to_cart) : null;
  const chk = singleEvent ? sumStrictWithCoverage(rows, (r) => r.checkouts_initiated) : null;
  const totalAtc = atc?.total ?? null;
  const totalChk = chk?.total ?? null;
  const hasAtcData = totalAtc != null;
  const hasChkData = totalChk != null;
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

  /**
   * Why a funnel metric is null. Partial coverage is the case that used to
   * be silently summed, so it gets a real count rather than the generic
   * "no data" line — "4 of 11 cells carry it" is actionable; a dash isn't.
   */
  const coverageSub = (c: StrictSum | null, denominator: string): string => {
    if (!singleEvent) return noConvSub;
    if (c == null || c.covered === 0) return noConvSub;
    return `not summed — only ${c.covered} of ${c.contributing} cells in this selection carry ${denominator}`;
  };

  const def = (id: string, label: string, value: number | null, formatted: string, sub?: string): MetricDef => ({
    id, label, value, formatted, isResultEvent: false, ...(sub ? { sub } : {}),
  });

  const communicationTiles: MetricDef[] = communication
    ? [
        def("lib_result_rate", "Result rate", resultRate, resultRate != null ? fmtPct(resultRate) : "—", "results ÷ impressions — the awareness event's own rate"),
        def("lib_cpm", "CPM", cpm, cpm != null ? fmtUSD(cpm) : "—", multiEventSub ?? "spend ÷ impressions × 1,000"),
        def("lib_frequency", "Frequency", frequency, frequency != null ? frequency.toFixed(2) : "—", multiEventSub ?? "impressions ÷ reach"),
      ]
    : [];

  return [
    def("lib_cells",           "Creative cells",      uniqueCells,   fmtNum(uniqueCells)),
    def("lib_spend",           "Spend (selected)",    spend,         fmtUSD(spend, 0)),
    def("lib_results",         resultsLabel,          results,       fmtNum(results), communication ? "awareness event · communication scale" : undefined),
    ...(communication ? [] : [def("lib_cpa", "Avg CPA", cpa, cpa != null ? fmtUSD(cpa) : "—", "spend ÷ results across the scope")]),
    ...communicationTiles,
    def("lib_impressions",     "Impressions",         impressions,   fmtNum(impressions),                  multiEventSub),
    def("lib_reach",           "Reach",               reach,         fmtNum(reach),                        multiEventSub),
    def("lib_link_clicks",     "Link clicks",         linkClicks,    fmtNum(linkClicks),                   multiEventSub),
    def("lib_clicks_all",      "Clicks (all)",        clicksAll,     fmtNum(clicksAll),                    multiEventSub),
    def("lib_link_ctr",        "Link CTR",            ctr,           ctr != null ? fmtPct(ctr) : "—",     multiEventSub ?? "link clicks ÷ impressions"),
    // ── Lower-funnel tiles ───────────────────────────────────────────
    def("lib_cvr",             "CVR",                 cvr,           cvr != null ? fmtPct(cvr) : "—",     "results ÷ link clicks"),
    def("lib_atc_rate",        "ATC rate",            atcRate,       atcRate != null ? fmtPct(atcRate) : "—",  hasAtcData ? "adds-to-cart ÷ link clicks" : coverageSub(atc, "adds-to-cart")),
    def("lib_checkout_rate",   "Checkout rate",       checkoutRate,  checkoutRate != null ? fmtPct(checkoutRate) : "—", hasChkData ? "checkouts ÷ link clicks" : coverageSub(chk, "checkouts initiated")),
    def("lib_cost_per_atc",    "Cost / ATC",          costPerAtc,    costPerAtc != null ? fmtUSD(costPerAtc) : "—", hasAtcData ? "spend ÷ adds-to-cart" : coverageSub(atc, "adds-to-cart")),
    def("lib_cost_per_checkout","Cost / Checkout",    costPerCheckout, costPerCheckout != null ? fmtUSD(costPerCheckout) : "—", hasChkData ? "spend ÷ checkouts initiated" : coverageSub(chk, "checkouts initiated")),
  ];
}

// ─── Variable drill-down catalog ─────────────────────────────────────────
// Owner direction (2026-09-02): the IAP Library's catalog-driven, configurable
// tile row is THE metric header pattern — every variable / metric surface
// uses it, persisted per view. This builds the catalog for one variable from
// the import's own variable-level totals (v3_variable_performance), with the
// same formatters as every other tile in this file. Token-level rows carry no impressions
// (the engine sets 0 — CTR is not computable at token grain), so the
// impression-based entries hide themselves rather than render a dash.
export interface VariableCatalogTotals {
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
  uniqueAds: number;
  cpa: number | null;
  ctrPct: number | null;
  resultTypes: string[];
  /** The scale the rows are judged on; communication omits cost per result. */
  scale?: EvaluationScale | null;
}

export function buildVariableMetricCatalog(t: VariableCatalogTotals): MetricDef[] {
  const hasImpressions = t.impressions > 0;
  const communication = t.scale === "communication";
  const cvr = !communication && t.linkClicks > 0 && t.results > 0 ? (t.results / t.linkClicks) * 100 : null;
  const cpc = t.linkClicks > 0 ? t.spend / t.linkClicks : null;
  const cpm = hasImpressions ? (t.spend / t.impressions) * 1000 : null;
  const eventSub = t.resultTypes.length > 0 ? t.resultTypes.map((rt) => classifyResultEvent(rt).label).join(" + ") : undefined;
  return [
    { id: "spend", label: "Spend", value: t.spend, formatted: fmtUSD(t.spend, 0), isResultEvent: false },
    { id: "results", label: "Results", value: t.results, formatted: fmtNum(t.results), isResultEvent: false, sub: communication ? `${eventSub ?? "awareness event"} · communication scale` : eventSub },
    { id: "cpa", label: "Cost per result", value: communication ? null : t.cpa, formatted: fmtUSD(communication ? null : t.cpa), isResultEvent: false, sub: communication ? "not a verdict for an awareness event" : t.cpa == null ? "no results yet" : undefined, hideWhenNull: communication },
    { id: "unique_ads", label: "Unique ads", value: t.uniqueAds, formatted: fmtNum(t.uniqueAds), isResultEvent: false },
    { id: "link_clicks", label: "Link clicks", value: t.linkClicks, formatted: fmtNum(t.linkClicks), isResultEvent: false },
    { id: "cvr", label: "Link CVR", value: cvr, formatted: fmtPct(cvr), isResultEvent: false, hideWhenNull: true, sub: "results ÷ link clicks" },
    { id: "cpc", label: "Cost per link click", value: cpc, formatted: fmtUSD(cpc), isResultEvent: false, hideWhenNull: true },
    { id: "impressions", label: "Impressions", value: hasImpressions ? t.impressions : null, formatted: fmtNum(hasImpressions ? t.impressions : null), isResultEvent: false, hideWhenNull: true },
    { id: "link_ctr", label: "Link CTR", value: t.ctrPct, formatted: fmtPct(t.ctrPct), isResultEvent: false, hideWhenNull: true },
    { id: "cpm", label: "CPM", value: cpm, formatted: fmtUSD(cpm), isResultEvent: false, hideWhenNull: true },
  ].filter((m) => !(m.hideWhenNull && m.value == null));
}
