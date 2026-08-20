// ─── Summary trends — pure derivations from the analysis-summary API ──
// Maps metric-catalog ids onto the summary endpoint's totals / prior_totals
// / daily series so KPI tiles can render the Nocturne trend layer (delta vs
// the preceding equal-length window + a per-day sparkline) from REAL
// measured values only.
//
// Honesty rules:
//   • A delta exists only when both windows carry a real value (and, for
//     ratios, a non-zero prior) — otherwise null, never a fabricated 0%.
//   • Sparklines exist only for metrics whose per-day value is a direct
//     sum or an exact per-day ratio of the daily fields — cost metrics get
//     a delta but no sparkline (a day with zero results has no real CPA).

import type { AnalysisSummaryTotals, AnalysisSummaryDayRow } from "@workspace/api-client-react";

export interface MetricTrend {
  current: number;
  prior: number;
  /** Percent change current vs prior ((cur − prior) / prior × 100). */
  deltaPct: number;
  /** True when the movement is an improvement for this metric (cost metrics improve downward). */
  improved: boolean;
}

/** Metric ids whose delta improves when the value goes DOWN. */
const LOWER_IS_BETTER = new Set(["cpa_blended", "cpc", "cpm"]);

function sumResults(t: AnalysisSummaryTotals): number {
  return Object.values(t.bottom_line_totals ?? {}).reduce((n, e) => n + (e.results ?? 0), 0);
}

/** Extract a metric's scalar value from summary totals; null when the metric has no exact mapping. */
export function metricValueFromTotals(metricId: string, t: AnalysisSummaryTotals): number | null {
  switch (metricId) {
    case "spend": return t.total_spend_usd;
    case "impressions": return t.total_impressions;
    case "link_clicks": return t.total_link_clicks;
    case "link_ctr": return t.overall_link_ctr_pct;
    case "cpa_blended": {
      const r = sumResults(t);
      return r > 0 ? t.total_spend_usd / r : null;
    }
    case "cpc": return t.total_link_clicks > 0 ? t.total_spend_usd / t.total_link_clicks : null;
    case "cpm": return t.total_impressions > 0 ? (t.total_spend_usd / t.total_impressions) * 1000 : null;
    case "cvr": {
      const r = sumResults(t);
      return t.total_link_clicks > 0 ? (r / t.total_link_clicks) * 100 : null;
    }
    default: {
      if (metricId.startsWith("result:")) {
        const key = metricId.slice("result:".length);
        const e = (t.bottom_line_totals ?? {})[key];
        return e ? e.results : null;
      }
      return null; // reach / clicks_all cross-event sums and library metrics: no exact windowed mapping
    }
  }
}

/** Delta vs the preceding window — null when either side has no real value. */
export function trendForMetric(
  metricId: string,
  totals: AnalysisSummaryTotals,
  priorTotals: AnalysisSummaryTotals | null | undefined,
): MetricTrend | null {
  if (!priorTotals) return null;
  const current = metricValueFromTotals(metricId, totals);
  const prior = metricValueFromTotals(metricId, priorTotals);
  if (current == null || prior == null || prior === 0) return null;
  const deltaPct = ((current - prior) / prior) * 100;
  const improved = LOWER_IS_BETTER.has(metricId) ? deltaPct < 0 : deltaPct > 0;
  return { current, prior, deltaPct, improved };
}

/** Per-day series for the sparkline — null when the metric has no exact per-day mapping. */
export function sparkSeriesForMetric(metricId: string, daily: AnalysisSummaryDayRow[]): number[] | null {
  if (!daily || daily.length < 2) return null;
  switch (metricId) {
    case "spend": return daily.map((d) => d.spend);
    case "impressions": return daily.map((d) => d.impressions);
    case "link_clicks": return daily.map((d) => d.link_clicks);
    case "link_ctr": return daily.map((d) => (d.impressions > 0 ? (d.link_clicks / d.impressions) * 100 : 0));
    default: return null; // results are per-event in the seed; daily results are cross-event sums — no exact mapping per metric
  }
}

/** SVG polyline points for a 100×24 viewBox, matching the canvas sparkline. */
export function sparkPoints(series: number[]): string {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const stepX = 100 / (series.length - 1);
  return series
    .map((v, i) => `${(i * stepX).toFixed(1)},${(22 - ((v - min) / span) * 20 + 1).toFixed(1)}`)
    .join(" ");
}
