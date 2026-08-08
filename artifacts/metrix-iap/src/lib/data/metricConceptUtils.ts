// ─── Shared metric × concept utilities ───────────────────────────────
// Extracted from the old metric modal so the hover-card popover and the
// full diagnostic modal can share the same ranking logic without duplication.

import { fmtUSD, fmtNum } from "@/pages/metrix/shared";
import type { CellPerformanceRow } from "./seedTypes";
import type { MetricDef } from "./metricsCatalog";

// ── Internal helpers ─────────────────────────────────────────────────

export function conceptMetricValue(row: CellPerformanceRow, metric: MetricDef): number {
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
    default:
      return row["Amount spent (USD)"];
  }
}

export interface ConceptDriver {
  cellId: string;
  name: string;
  value: number;
  metricDisplay: string;
  spend: number;
  impressions: number;
  results: number;
}

export function formatConceptMetricValue(value: number, metric: MetricDef): string {
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
      return `${value.toFixed(2)}%`;
    case "cpa_blended":
    default:
      return fmtUSD(value);
  }
}

/** Metrics that are already rates/ratios — summing per-row values would double count; recompute from totals instead. */
export const RATE_METRIC_IDS = new Set(["link_ctr", "cpa_blended"]);

/** All cell ids that back a metric — the FULL population, not just the top-N shown in the concepts list. */
export function allCellIdsForMetric(rows: CellPerformanceRow[], metric: MetricDef): string[] {
  const scoped = metric.isResultEvent ? rows.filter((r) => r["Result type"] === metric.eventKey) : rows;
  return Array.from(new Set(scoped.map((r) => r.cell_id)));
}

export function topConceptsForMetric(rows: CellPerformanceRow[], metric: MetricDef, max = 5): ConceptDriver[] {
  const scoped = metric.isResultEvent ? rows.filter((r) => r["Result type"] === metric.eventKey) : rows;
  const isRate = RATE_METRIC_IDS.has(metric.id);
  const map = new Map<string, {
    cellId: string;
    name: string;
    raw: number;
    spend: number;
    impressions: number;
    results: number;
    linkClicks: number;
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
    } else {
      map.set(r.cell_id, {
        cellId: r.cell_id,
        name: r.book2_concept_name,
        raw: isRate ? 0 : value,
        spend: r["Amount spent (USD)"],
        impressions: r.Impressions,
        results: r.Results,
        linkClicks: r["Link clicks"],
      });
    }
  }
  return Array.from(map.values())
    .map((c) => {
      let value = c.raw;
      if (metric.id === "cpa_blended") value = c.results > 0 ? c.spend / c.results : 0;
      if (metric.id === "link_ctr") value = c.impressions > 0 ? (c.linkClicks / c.impressions) * 100 : 0;
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
    .sort((a, b) => (metric.id === "cpa_blended" ? a.value - b.value : b.value - a.value) || b.spend - a.spend)
    .slice(0, max);
}
