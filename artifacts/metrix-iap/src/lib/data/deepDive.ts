// ─── Deep-dive module builders (pure, unit-testable) ──────────────────
// The deep-dive panel (Nocturne "Metrix v1" design handoff) is a right
// slide-over that stacks modules: click a segment anywhere → its full
// metric profile → chain into any other segment, with a breadcrumb trail.
//
// This file is the DATA side only: it turns one (dimension, segment) pair
// into a renderable module by reusing the exact same breakdown math the
// KPI drill-down modal uses (kpiBreakdown.ts). Nothing here fetches —
// modules are built from the already-loaded analysis bundle at push time.
//
// Honesty rules carry over verbatim from kpiBreakdown.ts: metrics a
// dimension can't support surface the restriction reason, unavailable
// values render "n/a", never zero, and cross-dimension filtering is NOT
// offered because the import's aggregates are pre-bucketed per dimension
// (a placement-within-concept number does not exist in this data).

import type { AnalysisData, CellPerformanceRow } from "./seedTypes";
import type { MetricDef } from "./metricsCatalog";
import {
  buildAccountBreakdown,
  dimensionMetricRestriction,
  listBreakdownDimensions,
  sortBreakdownRows,
  lowerIsBetter,
  type BreakdownRow,
  type BreakdownDimension,
} from "./kpiBreakdown";

// ─── Module shape ─────────────────────────────────────────────────────

export interface DeepDiveStat {
  metricId: string;
  label: string;
  /** Formatted display value ("$1,510.47", "1.7%", "n/a"). */
  value: string;
  /** Honest reason when the value is n/a (tracking basis, missing column). */
  note?: string;
}

/** Ranked row with an optional drill closure that builds the next module. */
export interface DeepDiveRankedRow extends BreakdownRow {
  /** Present when this row can chain into its own deep-dive module. */
  drill?: () => DeepDiveModule;
  /** Marks the row the current module is about (rendered highlighted, not drillable). */
  current?: boolean;
}

export type DeepDiveBlock =
  | { kind: "stats"; title: string; stats: DeepDiveStat[] }
  | { kind: "ranked"; title: string; metricLabel: string; rows: DeepDiveRankedRow[] }
  | { kind: "note"; text: string };

export interface DeepDiveModule {
  /** Stable id for breadcrumb keys (dimension + segment). */
  id: string;
  /** Mono uppercase eyebrow, e.g. the dimension label ("Concept"). */
  kicker: string;
  /** The segment's own human-readable name — never a code the user didn't write. */
  title: string;
  subtitle?: string;
  blocks: DeepDiveBlock[];
}

// ─── Segment profile builder ──────────────────────────────────────────

const RANK_METRIC_ID = "spend";

export interface SegmentModuleInput {
  analysis: AnalysisData;
  dimension: BreakdownDimension;
  segmentKey: string;
  catalog: MetricDef[];
  /** Cell rows pre-scoped by the active window/run selection (cell/concept dims only). */
  scopedCellRows?: CellPerformanceRow[];
  windowLabel?: string;
}

/**
 * Full metric profile for one segment of one dimension, plus a ranked
 * "peers" list over the same dimension so the user can chain sideways.
 * Every value comes from buildAccountBreakdown — the same summed-
 * numerator ÷ summed-denominator math as the KPI drill-down modal.
 */
export function buildSegmentModule(input: SegmentModuleInput): DeepDiveModule {
  const { analysis, dimension, segmentKey, catalog, scopedCellRows, windowLabel } = input;

  // Per-metric rows for this dimension, computed once per metric.
  const stats: DeepDiveStat[] = [];
  let segmentLabel = segmentKey;
  let restrictedCount = 0;
  for (const metric of catalog) {
    const restriction = dimensionMetricRestriction(dimension.id, metric.id);
    if (restriction) {
      restrictedCount += 1;
      stats.push({ metricId: metric.id, label: metric.label, value: "n/a", note: restriction });
      continue;
    }
    const rows = buildAccountBreakdown(analysis, dimension.id, metric.id, scopedCellRows);
    const row = rows.find((r) => r.key === segmentKey);
    if (row) segmentLabel = row.label;
    stats.push({
      metricId: metric.id,
      label: metric.label,
      value: row?.formatted ?? "n/a",
      ...(row?.value == null ? { note: row?.note ?? "No rows back this metric for this segment in the current import." } : {}),
    });
  }

  // Peers: the whole dimension ranked by spend, current segment marked,
  // every other segment drillable into its own module (the chain).
  const rankRestriction = dimensionMetricRestriction(dimension.id, RANK_METRIC_ID);
  const peerMetricId = rankRestriction ? "link_clicks" : RANK_METRIC_ID;
  const peerRows = sortBreakdownRows(
    buildAccountBreakdown(analysis, dimension.id, peerMetricId, scopedCellRows),
    lowerIsBetter(peerMetricId) ? "asc" : "desc",
  );
  const ranked: DeepDiveRankedRow[] = peerRows.map((r) =>
    r.key === segmentKey
      ? { ...r, current: true }
      : {
          ...r,
          drill: () => buildSegmentModule({ ...input, segmentKey: r.key }),
        },
  );

  const blocks: DeepDiveBlock[] = [
    { kind: "stats", title: "Metric profile", stats },
    {
      kind: "ranked",
      title: `All ${dimension.label.toLowerCase()} segments`,
      metricLabel: peerMetricId === "spend" ? "Spend" : "Link clicks",
      rows: ranked,
    },
  ];
  if (restrictedCount > 0) {
    blocks.push({
      kind: "note",
      text:
        `${restrictedCount} metric(s) show n/a because this dimension's tracking basis or source export ` +
        `can't honestly support them — values are never fabricated as zero.`,
    });
  }

  return {
    id: `${dimension.id}${segmentKey}`,
    kicker: dimension.label,
    title: segmentLabel,
    subtitle: windowLabel ? `Data window · ${windowLabel}` : undefined,
    blocks,
  };
}

/** Resolve a dimension descriptor by id from the account's live dimension list. */
export function findDimension(analysis: AnalysisData | null | undefined, dimensionId: string): BreakdownDimension | null {
  return listBreakdownDimensions(analysis).find((d) => d.id === dimensionId) ?? null;
}
