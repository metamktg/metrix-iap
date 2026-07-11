// ─── Segment drill-down metric catalog ────────────────────────────────
// Metric definitions for the age × gender segment drill-down. Built per
// segment from real demographic-row totals: metrics whose inputs exist
// are available with a value; metrics whose inputs are missing in this
// segment's rows are unavailable with an explicit reason; metrics with
// no underlying per-segment field anywhere in the data model (ROAS, ATC,
// purchase value, …) are structurally unavailable — offered in the
// picker as disabled so they light up if a future export carries them,
// but never rendered with a fabricated value.

import { fmtUSD, fmtNum, fmtPct } from "@/pages/metrix/shared";
import type { SegmentDerivedMetrics, SegmentRawTotals } from "@/lib/segment-analytics";

export type SegmentMetricAvailability = "available" | "unavailable";

export interface SegmentMetricDef {
  id: string;
  label: string;
  availability: SegmentMetricAvailability;
  /** Raw numeric value; null exactly when availability is "unavailable". */
  value: number | null;
  formatted: string;
  /** Honest explanation shown when the metric can't be computed. */
  unavailableReason?: string;
}

/** Hard cap on simultaneously visible segment metrics (readability). */
export const MAX_VISIBLE_SEGMENT_METRICS = 8;

/** Default visible set — well inside the cap. */
export const DEFAULT_SEGMENT_METRIC_IDS: string[] = [
  "spend",
  "results",
  "cpa",
  "ctr",
  "impressions",
  "link_clicks",
];

const fmtRatio = (n: number | null) => (n == null ? "—" : n.toFixed(2));

interface CatalogRowSpec {
  id: string;
  label: string;
  pick: (t: SegmentRawTotals, d: SegmentDerivedMetrics) => number | null;
  format: (v: number) => string;
  /** Which inputs are missing, for the honest reason string. */
  missing: (t: SegmentRawTotals) => string | null;
}

const missingOf = (t: SegmentRawTotals, deps: Array<[keyof SegmentRawTotals, string]>): string | null => {
  const gone = deps.filter(([k]) => t[k] == null).map(([, label]) => label);
  return gone.length ? gone.join(" and ") : null;
};

const ROWS: CatalogRowSpec[] = [
  { id: "spend", label: "Amount spent", pick: (t) => t.spend, format: (v) => fmtUSD(v), missing: (t) => missingOf(t, [["spend", "spend"]]) },
  { id: "results", label: "Results", pick: (t) => t.results, format: fmtNum, missing: (t) => missingOf(t, [["results", "results"]]) },
  { id: "reach", label: "Reach", pick: (t) => t.reach, format: fmtNum, missing: (t) => missingOf(t, [["reach", "reach"]]) },
  { id: "impressions", label: "Impressions", pick: (t) => t.impressions, format: fmtNum, missing: (t) => missingOf(t, [["impressions", "impressions"]]) },
  { id: "link_clicks", label: "Link clicks", pick: (t) => t.linkClicks, format: fmtNum, missing: (t) => missingOf(t, [["linkClicks", "link clicks"]]) },
  { id: "clicks_all", label: "Clicks (all)", pick: (t) => t.clicksAll, format: fmtNum, missing: (t) => missingOf(t, [["clicksAll", "clicks (all)"]]) },
  { id: "cpa", label: "CPA", pick: (_t, d) => d.cpa, format: (v) => fmtUSD(v), missing: (t) => (t.spend == null || t.results == null ? missingOf(t, [["spend", "spend"], ["results", "results"]]) : t.results === 0 ? "no results in this segment" : null) },
  { id: "ctr", label: "CTR", pick: (_t, d) => d.ctr, format: (v) => fmtPct(v), missing: (t) => (t.linkClicks == null || t.impressions == null ? missingOf(t, [["linkClicks", "link clicks"], ["impressions", "impressions"]]) : t.impressions === 0 ? "no impressions in this segment" : null) },
  { id: "cpm", label: "CPM", pick: (_t, d) => d.cpm, format: (v) => fmtUSD(v), missing: (t) => (t.spend == null || t.impressions == null ? missingOf(t, [["spend", "spend"], ["impressions", "impressions"]]) : t.impressions === 0 ? "no impressions in this segment" : null) },
  { id: "cpc", label: "CPC", pick: (_t, d) => d.cpc, format: (v) => fmtUSD(v), missing: (t) => (t.spend == null || t.linkClicks == null ? missingOf(t, [["spend", "spend"], ["linkClicks", "link clicks"]]) : t.linkClicks === 0 ? "no link clicks in this segment" : null) },
  { id: "frequency", label: "Frequency", pick: (_t, d) => d.frequency, format: fmtRatio as (v: number) => string, missing: (t) => (t.impressions == null || t.reach == null ? missingOf(t, [["impressions", "impressions"], ["reach", "reach"]]) : t.reach === 0 ? "no reach in this segment" : null) },
  { id: "cvr", label: "CVR", pick: (_t, d) => d.cvr, format: (v) => fmtPct(v), missing: (t) => (t.results == null || t.linkClicks == null ? missingOf(t, [["results", "results"], ["linkClicks", "link clicks"]]) : t.linkClicks === 0 ? "no link clicks in this segment" : null) },
];

/**
 * Metrics with no per-segment field anywhere in the current data model.
 * Kept in the picker (disabled, with reason) so a future export that
 * carries these columns lights them up via `extendedValues` — no redesign.
 */
export const UNSUPPORTED_SEGMENT_METRICS: Array<{ id: string; label: string; format: (v: number) => string }> = [
  { id: "roas", label: "ROAS", format: fmtRatio as (v: number) => string },
  { id: "avg_result_value", label: "Average result value", format: (v) => fmtUSD(v) },
  { id: "atc", label: "Adds to cart", format: fmtNum },
  { id: "initiate_checkout", label: "Checkouts initiated", format: fmtNum },
  { id: "purchase_value", label: "Purchase value", format: (v) => fmtUSD(v) },
];

const NOT_IN_DATA_REASON =
  "Not available in current data — the demographic export doesn't carry this column. It lights up automatically if a future import includes it.";

export function buildSegmentMetricCatalog(
  totals: SegmentRawTotals,
  derived: SegmentDerivedMetrics,
  /** Future-proofing: values for currently-unsupported metrics, keyed by id. */
  extendedValues?: Partial<Record<string, number | null>>
): SegmentMetricDef[] {
  const catalog: SegmentMetricDef[] = ROWS.map((row) => {
    const value = row.pick(totals, derived);
    if (value == null) {
      const why = row.missing(totals);
      return {
        id: row.id,
        label: row.label,
        availability: "unavailable" as const,
        value: null,
        formatted: "—",
        unavailableReason: why
          ? `No ${why} data in this segment's rows.`
          : "No data for this segment in the current import.",
      };
    }
    return { id: row.id, label: row.label, availability: "available" as const, value, formatted: row.format(value) };
  });

  for (const m of UNSUPPORTED_SEGMENT_METRICS) {
    const v = extendedValues?.[m.id];
    if (typeof v === "number" && Number.isFinite(v)) {
      catalog.push({ id: m.id, label: m.label, availability: "available", value: v, formatted: m.format(v) });
    } else {
      catalog.push({
        id: m.id,
        label: m.label,
        availability: "unavailable",
        value: null,
        formatted: "—",
        unavailableReason: NOT_IN_DATA_REASON,
      });
    }
  }

  return catalog;
}

export function segmentMetricById(catalog: SegmentMetricDef[], id: string): SegmentMetricDef | null {
  return catalog.find((m) => m.id === id) ?? null;
}
