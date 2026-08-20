// ─── Behavioral audience clustering ────────────────────────────────────
// Groups the real age×gender segments from segment-analytics.ts into a
// small number of behavioral clusters by efficiency profile (CPA × CVR —
// rate metrics, not raw volume, so a big segment and a small segment with
// the same cost/conversion shape land together). Clustering is a
// deterministic k-means pass: centroids are seeded from evenly-spaced,
// CPA-sorted points rather than a random draw, so the same input always
// produces the same clusters — required for the drilldown to be trusted
// and for the clustering test suite to assert exact output.
//
// A cluster's label is never invented narrative ("Time-poor commuters");
// it is mechanically built from its highest-spend member segment names
// (segmentLabel), so every label traces directly to real rows.

import type { SegmentId, SegmentRawTotals, SegmentDerivedMetrics } from "./segment-analytics";
import { deriveSegmentMetrics, segmentLabel } from "./segment-analytics";

export interface ClusterableSegment {
  seg: SegmentId;
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
}

/** One behavioral or demographic group of real segments — the shared shape
 *  rendered by the positioning map, share-of-spend bars, and detail card,
 *  regardless of whether the grouping came from k-means or a plain age split. */
export interface AudienceGroup<T> {
  id: string;
  label: string;
  members: T[];
  totals: SegmentRawTotals;
  derived: SegmentDerivedMetrics;
}

const MAX_CLUSTERS = 6;
const MAX_ITERATIONS = 25;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/** Strict-null field sum across already-computed per-segment totals: a
 *  field is null in the combined total unless every member supplies it,
 *  matching the strict-sum rule computeSegmentTotals applies to raw rows. */
export function combineSegmentTotals(list: SegmentRawTotals[]): SegmentRawTotals {
  const sumField = (pick: (t: SegmentRawTotals) => number | null): number | null => {
    let total = 0;
    for (const t of list) {
      const v = pick(t);
      if (v == null) return null;
      total += v;
    }
    return total;
  };
  return {
    rowCount: list.reduce((n, t) => n + t.rowCount, 0),
    spend: sumField((t) => t.spend),
    results: sumField((t) => t.results),
    reach: sumField((t) => t.reach),
    impressions: sumField((t) => t.impressions),
    linkClicks: sumField((t) => t.linkClicks),
    clicksAll: sumField((t) => t.clicksAll),
    addsToCart: sumField((t) => t.addsToCart),
    checkoutsInitiated: sumField((t) => t.checkoutsInitiated),
    purchases: sumField((t) => t.purchases),
    addsToCartValue: sumField((t) => t.addsToCartValue),
  };
}

/**
 * Target cluster count: roughly one cluster per two real segments so no
 * cluster is built from a single stray row, capped at MAX_CLUSTERS, and
 * never above the number of clusterable segments available. A thin account
 * (say 3 segments) gets 2 clusters, not 6 near-empty ones.
 */
function targetClusterCount(n: number): number {
  if (n <= 0) return 0;
  return Math.max(1, Math.min(MAX_CLUSTERS, Math.ceil(n / 2), n));
}

function labelFromMembers<T extends ClusterableSegment>(members: T[]): string {
  const bySpend = [...members].sort((a, b) => (b.totals.spend ?? 0) - (a.totals.spend ?? 0));
  return bySpend.slice(0, 2).map((m) => segmentLabel(m.seg)).join(" + ");
}

/**
 * Deterministic k-means over normalized (CPA, CVR). Segments missing either
 * metric (no results or no link clicks) can't be placed on an efficiency
 * profile honestly, so they're excluded from clustering entirely rather
 * than guessed into a group — callers that need every segment accounted
 * for should combine this with the excluded set.
 */
export function buildAudienceClusters<T extends ClusterableSegment>(entries: T[]): AudienceGroup<T>[] {
  const clusterable = entries.filter((e) => e.derived.cpa != null && e.derived.cvr != null);
  if (clusterable.length === 0) return [];

  const k = targetClusterCount(clusterable.length);

  const cpas = clusterable.map((e) => e.derived.cpa!);
  const cvrs = clusterable.map((e) => e.derived.cvr!);
  const cpaMean = mean(cpas);
  const cpaSd = stdev(cpas, cpaMean) || 1;
  const cvrMean = mean(cvrs);
  const cvrSd = stdev(cvrs, cvrMean) || 1;

  const points = clusterable.map((e) => ({
    e,
    x: (e.derived.cpa! - cpaMean) / cpaSd,
    y: (e.derived.cvr! - cvrMean) / cvrSd,
  }));

  // Deterministic seed: sort by normalized CPA and take k evenly-spaced
  // points as the initial centroids — never a random draw, so re-running
  // this on the same input always converges to the same clusters.
  const byCpa = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  let centroids = Array.from({ length: k }, (_, i) => {
    const idx = k === 1 ? 0 : Math.round((i * (byCpa.length - 1)) / (k - 1));
    return { x: byCpa[idx].x, y: byCpa[idx].y };
  });

  let assignments = new Array(points.length).fill(-1);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;
    const next = points.map((p, i) => {
      let best = 0;
      let bestDist = Infinity;
      centroids.forEach((c, ci) => {
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = ci;
        }
      });
      if (best !== assignments[i]) changed = true;
      return best;
    });
    assignments = next;
    if (!changed && iter > 0) break;

    centroids = centroids.map((c, ci) => {
      const members = points.filter((_, i) => assignments[i] === ci);
      if (members.length === 0) return c;
      return { x: mean(members.map((m) => m.x)), y: mean(members.map((m) => m.y)) };
    });
  }

  const groups = new Map<number, { e: T }[]>();
  points.forEach((p, i) => {
    const ci = assignments[i];
    const list = groups.get(ci) ?? [];
    list.push({ e: p.e });
    groups.set(ci, list);
  });

  const built = Array.from(groups.values()).map((members) => {
    const segs = members.map((m) => m.e);
    const totals = combineSegmentTotals(segs.map((s) => s.totals));
    return { members: segs, totals, derived: deriveSegmentMetrics(totals), label: labelFromMembers(segs) };
  });

  built.sort((a, b) => (b.totals.spend ?? 0) - (a.totals.spend ?? 0));

  return built.map((c, i) => ({
    id: `C${i + 1}`,
    label: c.label,
    members: c.members,
    totals: c.totals,
    derived: c.derived,
  }));
}

/** Real, non-clustered grouping: segments bucketed by their own age
 *  bracket (genders combined), for the "Age" segment-by mode. */
export function groupSegmentsByAge<T extends ClusterableSegment>(entries: T[]): AudienceGroup<T>[] {
  const byAge = new Map<string, T[]>();
  for (const e of entries) {
    const list = byAge.get(e.seg.age) ?? [];
    list.push(e);
    byAge.set(e.seg.age, list);
  }
  const built = Array.from(byAge.entries()).map(([age, members]) => {
    const totals = combineSegmentTotals(members.map((m) => m.totals));
    return { id: age, label: age, members, totals, derived: deriveSegmentMetrics(totals) };
  });
  built.sort((a, b) => (b.totals.spend ?? 0) - (a.totals.spend ?? 0));
  return built;
}

// ─── Positioning quadrants ──────────────────────────────────────────────
// Reuses this app's established scaling vocabulary (scalingBuckets.ts:
// Scale / Optimize / Explore / Avoid) instead of inventing a parallel
// SCALE/OPTIMIZE/EXPAND/RETIRE set — Explore and Avoid are the closest
// real terms this app already uses for "cheap but low-volume" and
// "expensive and low-volume" respectively.

export type PositioningQuadrant = "scale" | "optimize" | "explore" | "avoid";

export const QUADRANT_LABEL: Record<PositioningQuadrant, string> = {
  scale: "Scale",
  optimize: "Optimize",
  explore: "Explore",
  avoid: "Avoid",
};

/** Low cost + high conversions = Scale; high cost + high conversions =
 *  Optimize; low cost + low conversions = Explore; high cost + low
 *  conversions = Avoid. Cutoffs are the real median cost-per-result and
 *  median conversions across the plotted groups — never a fixed number. */
export function classifyQuadrant(
  cpa: number,
  conversions: number,
  medianCpa: number,
  medianConversions: number
): PositioningQuadrant {
  const lowCost = cpa <= medianCpa;
  const highConversions = conversions >= medianConversions;
  if (lowCost && highConversions) return "scale";
  if (!lowCost && highConversions) return "optimize";
  if (lowCost && !highConversions) return "explore";
  return "avoid";
}
