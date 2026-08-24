// Unit tests for the degraded-data honesty layer: per-report-class join
// coverage (computeDataCoverage), whole-period aggregate ad_summary
// detection (detectAggregateAdSummary), and the metadata-only merge mode
// that keeps an aggregate export's whole-period spend out of daily totals.
//
// Grounded in the real AAFE numbers: a demographic export carrying $856.52
// across 11 ads against a $42,290.67 / 399-ad daily baseline (1.3% spend
// coverage) rendered Signal badges and ranked segment cards with no
// indication of coverage; an aggregate ad-summary export ($45,467.69,
// every row dated at the report window start) inflated the displayed
// account total by ~41% when treated as daily data.
//
// Pure unit tests — no DB, no network.

import { describe, expect, it } from "vitest";
import {
  COVERAGE_THRESHOLD_PCT,
  computeDataCoverage,
  detectAggregateAdSummary,
  mergeAdPerformanceBuckets,
} from "../analysisEngine";
import type { IapCsvRow } from "../iapCsvParser";

function row(day: string, adName: string, spend: number | null, extraBreakdowns: Record<string, string> = {}): IapCsvRow {
  return {
    breakdowns: { Day: day, "Campaign name": "C1", "Ad set name": "AS", "Ad name": adName, ...extraBreakdowns },
    base: { amount_spent: spend, impressions: 100, results: 1, result_type: "Purchases" },
    extra: {},
  };
}

const PLACEMENT_DIMS = { Placement: "feed", Platform: "facebook" };
const DEMO_DIMS = { Gender: "female", Age: "25-34" };

describe("detectAggregateAdSummary", () => {
  it("flags a single-date summary alongside multi-day companions", () => {
    const summary = [row("2026-07-01", "A", 100), row("2026-07-01", "B", 200)];
    expect(detectAggregateAdSummary(summary, ["2026-07-01", "2026-07-02", "2026-07-03"])).toBe(true);
  });

  it("does not flag a genuinely daily summary", () => {
    const summary = [row("2026-07-01", "A", 100), row("2026-07-02", "A", 100)];
    expect(detectAggregateAdSummary(summary, ["2026-07-01", "2026-07-02"])).toBe(false);
  });

  it("does not flag when companions are also single-day (cannot tell)", () => {
    const summary = [row("2026-07-01", "A", 100)];
    expect(detectAggregateAdSummary(summary, ["2026-07-01"])).toBe(false);
  });

  it("does not flag when no summary is staged", () => {
    expect(detectAggregateAdSummary([], ["2026-07-01", "2026-07-02"])).toBe(false);
  });
});

describe("mergeAdPerformanceBuckets summaryMetadataOnly", () => {
  const placement = [row("2026-07-01", "AdA", 50, PLACEMENT_DIMS), row("2026-07-02", "AdA", 50, PLACEMENT_DIMS)];
  const aggregateSummary = [
    { ...row("2026-07-01", "AdA", 5000), creativeMetadata: { "Body (ad settings)": "hello" } },
    { ...row("2026-07-01", "AdB", 7000), creativeMetadata: { "Body (ad settings)": "world" } },
  ];

  it("excludes aggregate summary spend from daily buckets but keeps creative metadata", () => {
    const { adBuckets, adCreativeMetadata } = mergeAdPerformanceBuckets([], placement, aggregateSummary, {
      summaryMetadataOnly: true,
    });
    const totalSpend = [...adBuckets.values()].reduce((s, b) => s + (b.spend ?? 0), 0);
    expect(totalSpend).toBe(100); // placement only — no $12K whole-period dump
    expect([...adBuckets.values()].every((b) => b.adName === "AdA")).toBe(true); // no summary-only AdB day row
    expect(adCreativeMetadata.get("AdA")).toEqual({ "Body (ad settings)": "hello" });
    expect(adCreativeMetadata.get("AdB")).toEqual({ "Body (ad settings)": "world" });
  });

  it("still uses a daily summary fully when not aggregate", () => {
    const { adBuckets } = mergeAdPerformanceBuckets([], placement, aggregateSummary);
    const totalSpend = [...adBuckets.values()].reduce((s, b) => s + (b.spend ?? 0), 0);
    expect(totalSpend).toBeGreaterThan(100); // without the flag, summary-only rows land (the pre-fix behaviour)
  });
});

describe("computeDataCoverage", () => {
  it("measures the AAFE shape: tiny demographic slice → below threshold with cause+remedy note", () => {
    // Baseline: 4 ads × 2 days of placement spend = $800.
    const placement: IapCsvRow[] = [];
    for (const ad of ["A", "B", "C", "D"]) {
      placement.push(row("2026-07-01", ad, 100, PLACEMENT_DIMS), row("2026-07-02", ad, 100, PLACEMENT_DIMS));
    }
    // Demo covers ONE ad with $8 (1% of spend).
    const demo = [row("2026-07-01", "A", 8, DEMO_DIMS)];
    const { adBuckets } = mergeAdPerformanceBuckets(demo, placement, []);
    const cov = computeDataCoverage({
      window: { start: "2026-07-01", end: "2026-07-02" },
      scopedDemo: demo,
      scopedPlacement: placement,
      scopedSummary: [],
      scopedConversionDevice: [],
      adBuckets,
      summaryAggregate: false,
    });
    expect(cov.baseline_spend).toBe(800);
    expect(cov.baseline_distinct_ads).toBe(4);
    const demoCov = cov.classes.find((c) => c.report_class === "demographic")!;
    expect(demoCov.spend).toBe(8);
    expect(demoCov.spend_coverage_pct).toBe(1);
    expect(demoCov.below_threshold).toBe(true);
    expect(demoCov.note).toContain("1%");
    expect(demoCov.note).toContain("1 of 4 ads");
    expect(demoCov.note).toContain("re-export Demographics");
    const placementCov = cov.classes.find((c) => c.report_class === "device_placement")!;
    expect(placementCov.spend_coverage_pct).toBe(100);
    expect(placementCov.below_threshold).toBe(false);
    expect(placementCov.note).toBeNull();
    // Absent classes are not fabricated into the coverage list.
    expect(cov.classes.some((c) => c.report_class === "ad_summary")).toBe(false);
    expect(cov.threshold_pct).toBe(COVERAGE_THRESHOLD_PCT);
  });

  it("marks an aggregate ad_summary with an aggregate note, never below_threshold", () => {
    const placement = [row("2026-07-01", "A", 100, PLACEMENT_DIMS), row("2026-07-02", "A", 100, PLACEMENT_DIMS)];
    const summary = [row("2026-07-01", "A", 5000)];
    const { adBuckets } = mergeAdPerformanceBuckets([], placement, summary, { summaryMetadataOnly: true });
    const cov = computeDataCoverage({
      window: { start: "2026-07-01", end: "2026-07-02" },
      scopedDemo: [],
      scopedPlacement: placement,
      scopedSummary: summary,
      scopedConversionDevice: [],
      adBuckets,
      summaryAggregate: true,
    });
    const sumCov = cov.classes.find((c) => c.report_class === "ad_summary")!;
    expect(sumCov.aggregate_shape).toBe(true);
    expect(sumCov.below_threshold).toBe(false);
    expect(sumCov.note).toContain("whole-period");
    expect(sumCov.spend).toBe(5000);
  });

  it("never applies spend coverage to conversion_device (no spend by design)", () => {
    const placement = [row("2026-07-01", "A", 100, PLACEMENT_DIMS)];
    const conv = [row("2026-07-01", "A", null, { "Conversion device": "iphone" })];
    const { adBuckets } = mergeAdPerformanceBuckets([], placement, []);
    const cov = computeDataCoverage({
      window: { start: "2026-07-01", end: "2026-07-01" },
      scopedDemo: [],
      scopedPlacement: placement,
      scopedSummary: [],
      scopedConversionDevice: conv,
      adBuckets,
      summaryAggregate: false,
    });
    const convCov = cov.classes.find((c) => c.report_class === "conversion_device")!;
    expect(convCov.spend).toBeNull();
    expect(convCov.below_threshold).toBe(false);
    expect(convCov.note).toBeNull();
  });
});
