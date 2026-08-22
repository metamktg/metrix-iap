// ─── Shared metric × concept utilities ───────────────────────────────
// Extracted from the old metric modal so the hover-card popover and the
// full diagnostic modal can share the same ranking logic without duplication.

import { fmtUSD, fmtNum, fmtPct } from "@/pages/metrix/shared";
import type { CellPerformanceRow } from "./seedTypes";
import type { MetricDef } from "./metricsCatalog";

// ── Internal helpers ─────────────────────────────────────────────────

export function conceptMetricValue(row: CellPerformanceRow, metric: MetricDef): number {
  if (metric.id.startsWith("cost:")) return row.CPA_result ?? 0;
  if (metric.isResultEvent) return row.Results;
  switch (metric.id) {
    case "spend":
      return row["Amount spent (USD)"];
    case "impressions":
      return row.Impressions;
    case "reach":
      return row.Reach;
    case "clicks_all":
      return row["Clicks (all)"];
    case "link_clicks":
      return row["Link clicks"];
    case "link_ctr":
      return row.CTR_link_pct;
    case "cpa_blended":
      return row.CPA_result ?? 0;
    // Ratio metrics — the per-row value here is only meaningful in isolation.
    // When aggregated across a concept's rows (topConceptsForMetric) these
    // are recomputed from summed numerator/denominator, never averaged or
    // summed per-row (see isRateMetric / RATE_METRIC_IDS below, and
    // kpiBreakdown.ts's metricValueFromTotals, which this mirrors exactly).
    case "cvr":
      return row.Result_per_link_click_pct;
    case "ctr_all":
      return row.Impressions > 0 ? (row["Clicks (all)"] / row.Impressions) * 100 : 0;
    case "cpc":
      return row["Link clicks"] > 0 ? row["Amount spent (USD)"] / row["Link clicks"] : 0;
    case "cpm":
      return row.Impressions > 0 ? (row["Amount spent (USD)"] / row.Impressions) * 1000 : 0;
    default:
      return row["Amount spent (USD)"];
  }
}

export interface ConceptDriver {
  cellId: string;
  name: string;
  /** null when the metric honestly can't be computed for this concept (e.g. zero results for a cost metric) — never a fabricated 0. */
  value: number | null;
  metricDisplay: string;
  spend: number;
  impressions: number;
  results: number;
}

export function formatConceptMetricValue(value: number | null, metric: MetricDef): string {
  if (value == null) return "n/a";
  if (metric.id.startsWith("cost:")) return fmtUSD(value);
  if (metric.isResultEvent) return fmtNum(value);
  switch (metric.id) {
    case "spend":
      return fmtUSD(value, 0);
    case "impressions":
    case "reach":
    case "clicks_all":
    case "link_clicks":
      return fmtNum(value);
    case "link_ctr":
    case "ctr_all":
    case "cvr":
      return fmtPct(value);
    case "cpc":
    case "cpm":
    case "cpa_blended":
    default:
      return fmtUSD(value);
  }
}

/** Metrics that are already rates/ratios — summing per-row values would double count; recompute from totals instead. */
export const RATE_METRIC_IDS = new Set(["link_ctr", "cpa_blended", "cvr", "ctr_all", "cpc", "cpm"]);

/** True for a rate/ratio metric id, including the dynamic per-event "cost:<key>" ids. */
function isRateMetric(metricId: string): boolean {
  return RATE_METRIC_IDS.has(metricId) || metricId.startsWith("cost:");
}

/** All cell ids that back a metric — the FULL population, not just the top-N shown in the concepts list. */
export function allCellIdsForMetric(rows: CellPerformanceRow[], metric: MetricDef): string[] {
  const scoped = metric.isResultEvent ? rows.filter((r) => r["Result type"] === metric.eventKey) : rows;
  return Array.from(new Set(scoped.map((r) => r.cell_id)));
}

export function topConceptsForMetric(rows: CellPerformanceRow[], metric: MetricDef, max = 5): ConceptDriver[] {
  const scoped = metric.isResultEvent ? rows.filter((r) => r["Result type"] === metric.eventKey) : rows;
  const isRate = isRateMetric(metric.id);
  const isCpa = metric.id === "cpa_blended" || metric.id.startsWith("cost:");
  const map = new Map<string, {
    cellId: string;
    name: string;
    raw: number;
    spend: number;
    impressions: number;
    results: number;
    linkClicks: number;
    clicksAll: number;
  }>();
  for (const r of scoped) {
    const value = conceptMetricValue(r, metric);
    const prev = map.get(r.cell_id);
    if (prev) {
      prev.raw += isRate ? 0 : value;
      prev.spend += r["Amount spent (USD)"];
      prev.impressions += r.Impressions;
      prev.results += r.Results;
      prev.linkClicks += r["Link clicks"];
      prev.clicksAll += r["Clicks (all)"];
    } else {
      map.set(r.cell_id, {
        cellId: r.cell_id,
        name: r.book2_concept_name,
        raw: isRate ? 0 : value,
        spend: r["Amount spent (USD)"],
        impressions: r.Impressions,
        results: r.Results,
        linkClicks: r["Link clicks"],
        clicksAll: r["Clicks (all)"],
      });
    }
  }
  return Array.from(map.values())
    .map((c) => {
      let value: number | null = c.raw;
      // Ratio metrics — recompute from this concept's summed numerator ÷
      // summed denominator (never a per-row average or naive spend sum).
      // Formulas mirror kpiBreakdown.ts's metricValueFromTotals exactly so
      // the hover preview and the full drill-down modal never disagree.
      if (isCpa) {
        // Zero results with real spend is an honest "can't compute a rate
        // yet" — null (renders "n/a"), never a fabricated $0.00 that would
        // sort as the cheapest concept.
        value = c.results > 0 ? c.spend / c.results : null;
      } else if (metric.id === "link_ctr") {
        value = c.impressions > 0 ? (c.linkClicks / c.impressions) * 100 : 0;
      } else if (metric.id === "ctr_all") {
        value = c.impressions > 0 && c.clicksAll <= c.impressions ? (c.clicksAll / c.impressions) * 100 : null;
      } else if (metric.id === "cpc") {
        value = c.linkClicks > 0 ? c.spend / c.linkClicks : null;
      } else if (metric.id === "cpm") {
        value = c.impressions > 0 ? (c.spend / c.impressions) * 1000 : null;
      } else if (metric.id === "cvr") {
        value = c.linkClicks > 0 && c.results <= c.linkClicks ? (c.results / c.linkClicks) * 100 : null;
      }
      return {
        cellId: c.cellId,
        name: c.name,
        value,
        metricDisplay: formatConceptMetricValue(value, metric),
        spend: c.spend,
        impressions: c.impressions,
        results: c.results,
      };
    })
    .sort((a, b) => {
      // Concepts a metric honestly can't be computed for (null) always
      // trail real values, regardless of sort direction — never let a
      // fabricated/zero value outrank a real positive one.
      if (a.value == null && b.value == null) return b.spend - a.spend;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return (isCpa ? a.value - b.value : b.value - a.value) || b.spend - a.spend;
    })
    .slice(0, max);
}
