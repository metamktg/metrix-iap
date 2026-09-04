// ─── summaryTrends tests ──────────────────────────────────────────────
// The pure derivations behind the Nocturne KPI trend layer. Honesty
// rules under test: no delta without a real prior (never a fabricated
// 0%), cost metrics improve downward, ratio metrics guard zero priors,
// and sparklines exist only for exactly-mappable per-day metrics.

import { describe, it, expect } from "vitest";
import {
  metricValueFromTotals, trendForMetric, sparkSeriesForMetric, sparkPoints,
} from "../summaryTrends";
import type { AnalysisSummaryTotals, AnalysisSummaryDayRow } from "@workspace/api-client-react";

const totals = (o: Partial<AnalysisSummaryTotals> = {}): AnalysisSummaryTotals => ({
  total_spend_usd: 1000,
  total_impressions: 200000,
  total_link_clicks: 500,
  overall_link_ctr_pct: 0.25,
  bottom_line_totals: {
    "Mobile app installs": { spend: 800, reach: 1, impressions: 1, results: 100, clicks_all: 1, link_clicks: 1 },
    "Website registrations completed": { spend: 200, reach: 1, impressions: 1, results: 25, clicks_all: 1, link_clicks: 1 },
  },
  ...o,
});

const day = (date: string, o: Partial<AnalysisSummaryDayRow> = {}): AnalysisSummaryDayRow => ({
  date, spend: 10, impressions: 1000, link_clicks: 20, results: 2, ...o,
});

describe("metricValueFromTotals", () => {
  it("maps direct totals and derived ratios", () => {
    const t = totals();
    expect(metricValueFromTotals("spend", t)).toBe(1000);
    expect(metricValueFromTotals("impressions", t)).toBe(200000);
    expect(metricValueFromTotals("link_clicks", t)).toBe(500);
    expect(metricValueFromTotals("link_ctr", t)).toBe(0.25);
    // cpa_blended = 1000 / (100 + 25)
    expect(metricValueFromTotals("cpa_blended", t)).toBe(8);
    expect(metricValueFromTotals("cpc", t)).toBe(2);
    expect(metricValueFromTotals("cpm", t)).toBe(5);
  });

  it("maps per-event result metrics via the result: prefix", () => {
    expect(metricValueFromTotals("result:Mobile app installs", totals())).toBe(100);
    expect(metricValueFromTotals("result:unknown_event", totals())).toBeNull();
  });

  it("returns null for cost ratios with a zero denominator. Never divides into a fabricated number", () => {
    const t = totals({ bottom_line_totals: {} , total_link_clicks: 0, total_impressions: 0 });
    expect(metricValueFromTotals("cpa_blended", t)).toBeNull();
    expect(metricValueFromTotals("cpc", t)).toBeNull();
    expect(metricValueFromTotals("cpm", t)).toBeNull();
  });

  it("returns null for metrics with no exact windowed mapping (reach, clicks_all)", () => {
    expect(metricValueFromTotals("reach", totals())).toBeNull();
    expect(metricValueFromTotals("clicks_all", totals())).toBeNull();
  });
});

describe("trendForMetric", () => {
  it("computes the delta vs the prior window", () => {
    const t = trendForMetric("spend", totals({ total_spend_usd: 1200 }), totals({ total_spend_usd: 1000 }));
    expect(t).not.toBeNull();
    expect(t!.deltaPct).toBeCloseTo(20);
    expect(t!.improved).toBe(true);
  });

  it("cost metrics improve when they go DOWN", () => {
    const cur = totals({ total_spend_usd: 800 });   // cpa 800/125 = 6.4
    const prior = totals({ total_spend_usd: 1000 }); // cpa 8
    const t = trendForMetric("cpa_blended", cur, prior);
    expect(t!.deltaPct).toBeLessThan(0);
    expect(t!.improved).toBe(true);
  });

  it("returns null without a prior window. Never a fabricated 0%", () => {
    expect(trendForMetric("spend", totals(), null)).toBeNull();
    expect(trendForMetric("spend", totals(), undefined)).toBeNull();
  });

  it("returns null when the prior value is zero (no meaningful % change)", () => {
    expect(trendForMetric("spend", totals(), totals({ total_spend_usd: 0 }))).toBeNull();
  });
});

describe("sparkSeriesForMetric", () => {
  const daily = [day("2026-05-01"), day("2026-05-02", { spend: 20, impressions: 2000, link_clicks: 60 })];

  it("maps additive metrics and the exact per-day CTR ratio", () => {
    expect(sparkSeriesForMetric("spend", daily)).toEqual([10, 20]);
    expect(sparkSeriesForMetric("impressions", daily)).toEqual([1000, 2000]);
    expect(sparkSeriesForMetric("link_ctr", daily)).toEqual([2, 3]);
  });

  it("returns null for cost metrics and single-day windows", () => {
    expect(sparkSeriesForMetric("cpa_blended", daily)).toBeNull();
    expect(sparkSeriesForMetric("spend", [day("2026-05-01")])).toBeNull();
  });
});

describe("sparkPoints", () => {
  it("spans the 100×24 viewBox with the min at the bottom and max at the top", () => {
    const pts = sparkPoints([0, 10]).split(" ");
    expect(pts).toHaveLength(2);
    const [x0, y0] = pts[0]!.split(",").map(Number);
    const [x1, y1] = pts[1]!.split(",").map(Number);
    expect(x0).toBe(0);
    expect(x1).toBe(100);
    expect(y0).toBeGreaterThan(y1); // higher value → smaller y
  });

  it("handles a flat series without dividing by zero", () => {
    expect(() => sparkPoints([5, 5, 5])).not.toThrow();
  });
});
