// ─── Customizable overview metric catalog ─────────────────────────────
// Small shared list of metrics the Manager/Ad Account overview tile rows
// can be customized to show. Only metrics that exist in the seed data
// model today are included — see replit.md for the value-based metrics
// (ROAS, purchase value, unique clicks) intentionally left out because no
// underlying field exists anywhere in the bundle.

import { fmtUSD, fmtNum, fmtPct, eventLabel } from "@/pages/metrix/shared";
import type { CampaignSummary, CellPerformanceRow, ManagerBottomLineTotals, SeedResultEventTotals } from "./seedTypes";

export interface MetricResultEvent {
  key: string;
  label: string;
  results: number;
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
}

/**
 * Reach and Clicks (all) are only available broken down per result-event in
 * the seed's `bottom_line_totals`/`result_totals_by_event` maps — there's no
 * separate account-wide delivery total field. When only one result event
 * exists, its per-event figure IS the account total. When multiple result
 * events exist, the same underlying delivery can be attributed to more than
 * one event key, so summing across events would double-count — report
 * honestly as unavailable (null) rather than fabricate a blended figure.
 */
function accountLevelDeliveryTotal(events: [string, SeedResultEventTotals][], pick: (e: SeedResultEventTotals) => number): number | null {
  if (events.length === 0) return null;
  if (events.length === 1) return pick(events[0][1]);
  return null;
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
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results })),
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
    resultEvents: events.map(([key, e]) => ({ key, label: eventLabel(key), results: e.results })),
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
  "cpa_blended",
] as const;
export type StaticMetricId = (typeof STATIC_METRIC_IDS)[number];

/** Metric ids shown by default, matching the previous hardcoded tile row. */
export const DEFAULT_METRIC_IDS: string[] = ["spend", "impressions", "link_clicks", "link_ctr"];

export function resultMetricId(eventKey: string): string {
  return `result:${eventKey}`;
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
}

/** Build the full pickable catalog (static + this account's own result events) from a source. */
export function buildMetricCatalog(source: MetricSource): MetricDef[] {
  const totalResults = source.resultEvents.reduce((n, e) => n + e.results, 0);
  const cpaBlended = source.spend != null && totalResults > 0 ? source.spend / totalResults : null;

  const catalog: MetricDef[] = [
    { id: "spend", label: "Total spend", value: source.spend, formatted: fmtUSD(source.spend), isResultEvent: false },
    { id: "impressions", label: "Impressions", value: source.impressions, formatted: fmtNum(source.impressions), isResultEvent: false },
    { id: "reach", label: "Reach", value: source.reach, formatted: fmtNum(source.reach), isResultEvent: false },
    { id: "clicks_all", label: "Clicks (all)", value: source.clicksAll, formatted: fmtNum(source.clicksAll), isResultEvent: false },
    { id: "link_clicks", label: "Link clicks", value: source.linkClicks, formatted: fmtNum(source.linkClicks), isResultEvent: false },
    { id: "link_ctr", label: "Link CTR", value: source.linkCtrPct, formatted: fmtPct(source.linkCtrPct), isResultEvent: false },
    { id: "cpa_blended", label: "CPA (blended)", value: cpaBlended, formatted: cpaBlended != null ? fmtUSD(cpaBlended) : "—", isResultEvent: false },
  ];

  for (const e of source.resultEvents) {
    catalog.push({
      id: resultMetricId(e.key),
      label: e.label,
      value: e.results,
      formatted: fmtNum(e.results),
      isResultEvent: true,
      eventKey: e.key,
    });
  }

  return catalog;
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

  const def = (id: string, label: string, value: number | null, formatted: string, sub?: string): MetricDef => ({
    id, label, value, formatted, isResultEvent: false, ...(sub ? { sub } : {}),
  });

  return [
    def("lib_cells", "Creative cells", uniqueCells, fmtNum(uniqueCells)),
    def("lib_spend", "Spend (selected)", spend, fmtUSD(spend, 0)),
    def("lib_results", "Results (selected)", results, fmtNum(results)),
    def("lib_cpa", "Avg CPA", cpa, cpa != null ? fmtUSD(cpa) : "—", "spend ÷ results across selection"),
    def("lib_impressions", "Impressions", impressions, fmtNum(impressions), multiEventSub),
    def("lib_reach", "Reach", reach, fmtNum(reach), multiEventSub),
    def("lib_link_clicks", "Link clicks", linkClicks, fmtNum(linkClicks), multiEventSub),
    def("lib_clicks_all", "Clicks (all)", clicksAll, fmtNum(clicksAll), multiEventSub),
    def("lib_link_ctr", "Link CTR", ctr, ctr != null ? fmtPct(ctr) : "—", multiEventSub ?? "link clicks ÷ impressions"),
  ];
}
