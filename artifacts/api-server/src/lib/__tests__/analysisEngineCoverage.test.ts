// Unit tests for the degraded-data honesty layer: per-report-class join
// coverage (computeDataCoverage), whole-period export detection
// (wholePeriodOf), and what a whole-period row contributes to the ad rows
// (mergeAdPerformanceBuckets with `periodOf`).
//
// Grounded in real numbers. AAFE (2026-08): a demographic export carrying
// $856.52 across 11 ads against a $42,290.67 / 399-ad daily baseline (1.3%
// spend coverage) rendered Signal badges with no indication of coverage;
// an aggregate ad-summary export ($45,467.69, every row dated at the
// report window start) inflated the account total by ~41% when treated as
// daily data. Pure Path (2026-09-04): every pivot was whole-period, each
// built one "day" of ad rows carrying its 28-day total, and the account
// read $4.07M against Meta's $1.44M.
//
// Pure unit tests — no DB, no network.

import { describe, expect, it } from "vitest";
import {
  COVERAGE_THRESHOLD_PCT,
  buildAdPerformanceRows,
  computeDataCoverage,
  computeDataCoverageReport,
  mergeAdPerformanceBuckets,
  overlapWarning,
  wholePeriodOf,
  wholePeriodWarning,
  type ReportPeriod,
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
const PERIOD: ReportPeriod = { start: "2026-07-01", end: "2026-07-28", endKnown: true };
const periodFor = (rows: IapCsvRow[], period: ReportPeriod = PERIOD) => {
  const set = new Set(rows);
  return (r: IapCsvRow): ReportPeriod | null => (set.has(r) ? period : null);
};
const spendOf = (buckets: Map<string, { spend: number | null }>) => [...buckets.values()].reduce((s, b) => s + (b.spend ?? 0), 0);

describe("wholePeriodOf", () => {
  it("a single-date file with a later stated reporting end is whole-period even on its own", () => {
    expect(wholePeriodOf({ aggregate_shape: true, period: { start: "2026-07-01", end: "2026-07-28" } }, false)).toEqual({
      start: "2026-07-01",
      end: "2026-07-28",
      endKnown: true,
    });
  });

  it("a single-date file with no stated end is whole-period when another file in the run spans days (the AAFE heuristic)", () => {
    expect(wholePeriodOf({ aggregate_shape: true, period: { start: "2026-07-01", end: "2026-07-01" } }, true)).toEqual({
      start: "2026-07-01",
      end: "2026-07-01",
      endKnown: false,
    });
  });

  it("a single-date file with no stated end and no multi-day companion stays daily (cannot tell)", () => {
    expect(wholePeriodOf({ aggregate_shape: true, period: { start: "2026-07-01", end: "2026-07-01" } }, false)).toBeNull();
  });

  it("a daily file is never whole-period", () => {
    expect(wholePeriodOf({ aggregate_shape: false, period: { start: "2026-07-01", end: "2026-07-28" } }, true)).toBeNull();
    expect(wholePeriodOf({ aggregate_shape: true, period: null }, true)).toBeNull();
  });

  it("the Day column's source header decides when the grain carries it: Reporting starts is a period, Day is a day", () => {
    // Meta's whole-period export: Day aliased from "Reporting starts", no end stated, no companion.
    expect(wholePeriodOf({ aggregate_shape: true, period: { start: "2026-07-01", end: "2026-07-01" }, day_header: "reporting starts" }, false)).toEqual({
      start: "2026-07-01",
      end: "2026-07-01",
      endKnown: false,
    });
    // One real day of daily data beside a multi-day file, with the report range stated: still a day.
    expect(wholePeriodOf({ aggregate_shape: true, period: { start: "2026-07-01", end: "2026-07-28" }, day_header: "day" }, true)).toBeNull();
    expect(wholePeriodOf({ aggregate_shape: true, period: { start: "2026-07-01", end: "2026-07-01" }, day_header: "date" }, true)).toBeNull();
    // A non-ISO stated end never proves a period.
    expect(wholePeriodOf({ aggregate_shape: true, period: { start: "2026-07-01", end: "9/2/2026" }, day_header: "reporting starts" }, false)).toEqual({
      start: "2026-07-01",
      end: "2026-07-01",
      endKnown: false,
    });
  });
});

describe("mergeAdPerformanceBuckets with whole-period rows", () => {
  const placement = [row("2026-07-01", "AdA", 50, PLACEMENT_DIMS), row("2026-07-02", "AdA", 50, PLACEMENT_DIMS)];
  const aggregateSummary = [
    { ...row("2026-07-01", "AdA", 5000), creativeMetadata: { "Body (ad settings)": "hello" } },
    { ...row("2026-07-01", "AdB", 7000), creativeMetadata: { "Body (ad settings)": "world" } },
  ];

  it("legacy summaryMetadataOnly: excludes aggregate summary spend from daily buckets, keeps creative metadata, counts the ads no daily row covers", () => {
    const { adBuckets, adCreativeMetadata, grain, periodOnlyAds } = mergeAdPerformanceBuckets([], placement, aggregateSummary, {
      summaryMetadataOnly: true,
    });
    expect(spendOf(adBuckets)).toBe(100); // placement only — no $12K whole-period dump
    expect([...adBuckets.values()].every((b) => b.adName === "AdA")).toBe(true); // no summary-only AdB day row
    expect(adCreativeMetadata.get("AdA")).toEqual({ "Body (ad settings)": "hello" });
    expect(adCreativeMetadata.get("AdB")).toEqual({ "Body (ad settings)": "world" });
    expect(grain).toBe("daily");
    expect(periodOnlyAds).toEqual({ count: 1, spend: 7000 });
  });

  it("still uses a daily summary fully when nothing marks it whole-period", () => {
    const { adBuckets, grain } = mergeAdPerformanceBuckets([], placement, aggregateSummary);
    expect(spendOf(adBuckets)).toBeGreaterThan(100); // without the flag, summary-only rows land (the pre-fix behaviour)
    expect(grain).toBe("daily");
  });

  it("the Pure Path shape: a whole-period placement pivot beside a daily Ad Summary builds the ad rows from the daily rows alone", () => {
    // One placement pivot of the whole period (its rows all dated at the
    // period start) carrying AdA's 28-day total across two placements.
    const pivot = [
      row("2026-07-01", "AdA", 1800, { Placement: "feed", Platform: "facebook" }),
      row("2026-07-01", "AdA", 1000, { Placement: "stories", Platform: "instagram" }),
    ];
    const daily: IapCsvRow[] = [];
    for (let d = 1; d <= 28; d++) daily.push(row(`2026-07-${String(d).padStart(2, "0")}`, "AdA", 100));
    const { adBuckets, grain, periodOnlyAds } = mergeAdPerformanceBuckets([], pivot, daily, { periodOf: periodFor(pivot) });
    expect(adBuckets.size).toBe(28);
    expect(spendOf(adBuckets)).toBe(2800); // never 2,800 + 2,800 on the first day
    expect([...adBuckets.values()].every((b) => b.dateEnd === undefined)).toBe(true);
    expect(grain).toBe("daily");
    expect(periodOnlyAds).toEqual({ count: 0, spend: 0 });
    const first = [...adBuckets.values()].find((b) => b.date === "2026-07-01")!;
    expect(first.spend).toBe(100);
  });

  it("a run with no daily source at all carries the period on every ad row", () => {
    const pivot = [row("2026-07-01", "AdA", 2800, PLACEMENT_DIMS), row("2026-07-01", "AdB", 700, PLACEMENT_DIMS)];
    const demo = [row("2026-07-01", "AdA", 2500, DEMO_DIMS)];
    const { adBuckets, grain, periodOnlyAds } = mergeAdPerformanceBuckets(demo, pivot, [], {
      periodOf: periodFor([...pivot, ...demo]),
    });
    expect(grain).toBe("period");
    expect(adBuckets.size).toBe(2);
    expect(spendOf(adBuckets)).toBe(3500);
    for (const b of adBuckets.values()) {
      expect(b.date).toBe("2026-07-01");
      expect(b.dateEnd).toBe("2026-07-28");
    }
    expect(periodOnlyAds).toEqual({ count: 0, spend: 0 });
    const rows = buildAdPerformanceRows("acct", "run", adBuckets, new Map());
    expect(rows.map((r) => [r["date_start"], r["date_end"]])).toEqual([
      ["2026-07-01", "2026-07-28"],
      ["2026-07-01", "2026-07-28"],
    ]);
  });

  it("in period grain, one ad with two classes stating different periods is one row over the union of both", () => {
    const demo = [row("2026-07-01", "AdA", 3000, DEMO_DIMS)]; // Gender × Age pivot, 07-01 to 07-30
    const pivot = [row("2026-07-03", "AdA", 2800, PLACEMENT_DIMS)]; // Platform × Placement pivot, 07-03 to 07-30
    const demoPeriod = periodFor(demo, { start: "2026-07-01", end: "2026-07-30", endKnown: true });
    const pivotPeriod = periodFor(pivot, { start: "2026-07-03", end: "2026-07-30", endKnown: true });
    const { adBuckets, grain } = mergeAdPerformanceBuckets(demo, pivot, [], { periodOf: (r) => demoPeriod(r) ?? pivotPeriod(r) });
    expect(grain).toBe("period");
    expect(adBuckets.size).toBe(1); // never two rows, never $5,800 for one ad
    const only = [...adBuckets.values()][0]!;
    expect(only.spend).toBe(2800); // the placement rows carry the ad; the demographic total supplements only what is missing
    expect(only.date).toBe("2026-07-01");
    expect(only.dateEnd).toBe("2026-07-30");
  });

  it("creative metadata survives a whole-period summary losing its rows to a daily one", () => {
    const daily = [row("2026-07-01", "AdA", 100), row("2026-07-02", "AdA", 100)];
    const whole = [{ ...row("2026-07-01", "AdA", 200), creativeMetadata: { "Body (ad settings)": "hello" } }];
    const { adBuckets, adCreativeMetadata } = mergeAdPerformanceBuckets([], [], daily, { creativeMetadataRows: whole });
    expect(spendOf(adBuckets)).toBe(200);
    expect(adCreativeMetadata.get("AdA")).toEqual({ "Body (ad settings)": "hello" });
  });

  it("a daily row keeps date_end equal to its day", () => {
    const { adBuckets } = mergeAdPerformanceBuckets([], placement, []);
    const rows = buildAdPerformanceRows("acct", "run", adBuckets, new Map());
    expect(rows.map((r) => r["date_end"])).toEqual(["2026-07-01", "2026-07-02"]);
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

  it("marks a whole-period ad_summary with an aggregate note, never below_threshold", () => {
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
      periodOf: periodFor(summary, { start: "2026-07-01", end: "2026-07-02", endKnown: true }),
    });
    const sumCov = cov.classes.find((c) => c.report_class === "ad_summary")!;
    expect(sumCov.aggregate_shape).toBe(true);
    expect(sumCov.below_threshold).toBe(false);
    expect(sumCov.note).toContain("whole-period");
    expect(sumCov.note).toContain("2026-07-01 to 2026-07-02");
    expect(sumCov.note).not.toContain("Reconciliation check failed");
    expect(sumCov.spend).toBe(5000);
  });

  it("flags a class whose spend EXCEEDS the baseline as a failed reconciliation (the BUG-19 double-count shape)", () => {
    // Baseline: one ad, one day, $100. Demo rows carry $200 for the same
    // window — exactly what staging the same export twice produces.
    const placement = [row("2026-07-01", "A", 100, PLACEMENT_DIMS)];
    const demo = [row("2026-07-01", "A", 100, DEMO_DIMS), row("2026-07-01", "A", 100, DEMO_DIMS)];
    const { adBuckets } = mergeAdPerformanceBuckets([], placement, []);
    const cov = computeDataCoverage({
      window: { start: "2026-07-01", end: "2026-07-01" },
      scopedDemo: demo,
      scopedPlacement: placement,
      scopedSummary: [],
      scopedConversionDevice: [],
      adBuckets,
    });
    const demoCov = cov.classes.find((c) => c.report_class === "demographic")!;
    expect(demoCov.spend_coverage_pct).toBe(200);
    expect(demoCov.below_threshold).toBe(false);
    expect(demoCov.note).toContain("Reconciliation check failed");
    expect(demoCov.note).toContain("counted more than once");
    expect(demoCov.note).not.toMatch(/—/);
  });

  it("a whole-period pivot inside the daily span is a slice: at 100% it carries the period note and no failure", () => {
    const daily: IapCsvRow[] = [];
    for (let d = 1; d <= 28; d++) daily.push(row(`2026-07-${String(d).padStart(2, "0")}`, "A", 100));
    const pivot = [row("2026-07-01", "A", 2800, PLACEMENT_DIMS)];
    const { adBuckets } = mergeAdPerformanceBuckets([], pivot, daily, { periodOf: periodFor(pivot) });
    const cov = computeDataCoverage({
      window: { start: "2026-07-01", end: "2026-07-28" },
      scopedDemo: [],
      scopedPlacement: pivot,
      scopedSummary: daily,
      scopedConversionDevice: [],
      adBuckets,
      periodOf: periodFor(pivot),
    });
    expect(cov.baseline_spend).toBe(2800);
    const pc = cov.classes.find((c) => c.report_class === "device_placement")!;
    expect(pc.aggregate_shape).toBe(true);
    expect(pc.spend_coverage_pct).toBe(100);
    expect(pc.below_threshold).toBe(false);
    expect(pc.note).toContain("whole-period report covering 2026-07-01 to 2026-07-28");
    expect(pc.note).toContain("Placements breakdowns");
    expect(pc.note).not.toContain("Reconciliation check failed");
    const sc = cov.classes.find((c) => c.report_class === "ad_summary")!;
    expect(sc.aggregate_shape).toBe(false);
    expect(sc.note).toBeNull();
  });

  it("a whole-period pivot reaching beyond the daily span may exceed the baseline: that is days, not duplication", () => {
    const daily: IapCsvRow[] = [];
    for (let d = 3; d <= 30; d++) daily.push(row(`2026-07-${String(d).padStart(2, "0")}`, "A", 100)); // 28 days
    const pivot = [row("2026-07-01", "A", 3000, PLACEMENT_DIMS)]; // 30 days
    const { adBuckets } = mergeAdPerformanceBuckets([], pivot, daily, {
      periodOf: periodFor(pivot, { start: "2026-07-01", end: "2026-07-30", endKnown: true }),
    });
    const cov = computeDataCoverage({
      window: { start: "2026-07-01", end: "2026-07-30" },
      scopedDemo: [],
      scopedPlacement: pivot,
      scopedSummary: daily,
      scopedConversionDevice: [],
      adBuckets,
      periodOf: periodFor(pivot, { start: "2026-07-01", end: "2026-07-30", endKnown: true }),
    });
    const pc = cov.classes.find((c) => c.report_class === "device_placement")!;
    expect(pc.spend_coverage_pct).toBe(107.1);
    expect(pc.note).not.toContain("Reconciliation check failed");
    expect(pc.note).toContain("because the export covers 2026-07-01 to 2026-07-30 while the daily rows cover 2026-07-03 to 2026-07-30");
  });

  it("a whole-period pivot inside the daily span at 200% is still a failed reconciliation", () => {
    const daily = [row("2026-07-01", "A", 50), row("2026-07-02", "A", 50)];
    const pivot = [row("2026-07-01", "A", 100, PLACEMENT_DIMS), row("2026-07-01", "A", 100, PLACEMENT_DIMS)];
    const { adBuckets } = mergeAdPerformanceBuckets([], pivot, daily, {
      periodOf: periodFor(pivot, { start: "2026-07-01", end: "2026-07-02", endKnown: true }),
    });
    const period = { start: "2026-07-01", end: "2026-07-02", endKnown: true };
    const { coverage: cov, warnings } = computeDataCoverageReport({
      window: { start: "2026-07-01", end: "2026-07-02" },
      scopedDemo: [],
      scopedPlacement: pivot,
      scopedSummary: daily,
      scopedConversionDevice: [],
      adBuckets,
      periodOf: periodFor(pivot, period),
    });
    const pc = cov.classes.find((c) => c.report_class === "device_placement")!;
    expect(pc.spend_coverage_pct).toBe(200);
    expect(pc.note).toContain("Reconciliation check failed");
    expect(pc.note).toMatch(/This placements export is a whole-period report/); // the period sentence still closes it
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[Coverage\] Reconciliation check failed/);
    expect(warnings[0]).not.toContain("whole-period report"); // the [Whole-period] run warning says that already
  });

  it("run warnings carry every problem note and never the whole-period sentence on its own", () => {
    const daily = [row("2026-07-01", "A", 100)];
    const pivot = [row("2026-07-01", "A", 100, PLACEMENT_DIMS)];
    const demo = [row("2026-07-01", "A", 8, DEMO_DIMS)];
    const periodOf = periodFor(pivot, { start: "2026-07-01", end: "2026-07-01", endKnown: true });
    const { adBuckets } = mergeAdPerformanceBuckets(demo, pivot, daily, { periodOf });
    const { coverage: cov, warnings } = computeDataCoverageReport({
      window: { start: "2026-07-01", end: "2026-07-01" },
      scopedDemo: demo,
      scopedPlacement: pivot,
      scopedSummary: daily,
      scopedConversionDevice: [],
      adBuckets,
      periodOf,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[Coverage\] Demographic rows carry \$8/);
    expect(cov.classes.find((c) => c.report_class === "device_placement")!.note).toMatch(/^This placements export/);
  });

  it("a class that mixes daily rows with a whole-period file's surviving rows is judged on its daily rows, never called a duplicate", () => {
    // Daily demographic rows for A ($50 × 2), a whole-period demographic row for B ($500) that no daily row covers,
    // daily placement rows for A: the overlap rule keeps B's row, and B is outside the daily baseline.
    const dailyDemo = [row("2026-07-01", "A", 50, DEMO_DIMS), row("2026-07-02", "A", 50, DEMO_DIMS)];
    const periodDemo = [row("2026-07-01", "B", 500, DEMO_DIMS)];
    const placement = [row("2026-07-01", "A", 50, PLACEMENT_DIMS), row("2026-07-02", "A", 50, PLACEMENT_DIMS)];
    const periodOf = periodFor(periodDemo, { start: "2026-07-01", end: "2026-07-02", endKnown: true });
    const { adBuckets, periodOnlyAds } = mergeAdPerformanceBuckets([...dailyDemo, ...periodDemo], placement, [], { periodOf });
    expect(periodOnlyAds).toEqual({ count: 1, spend: 500 });
    const { coverage: cov, warnings } = computeDataCoverageReport({
      window: { start: "2026-07-01", end: "2026-07-02" },
      scopedDemo: [...dailyDemo, ...periodDemo],
      scopedPlacement: placement,
      scopedSummary: [],
      scopedConversionDevice: [],
      adBuckets,
      periodOf,
    });
    const dc = cov.classes.find((c) => c.report_class === "demographic")!;
    expect(dc.aggregate_shape).toBe(false);
    expect(dc.note).not.toContain("Reconciliation check failed");
    expect(dc.note).toContain("$500 of the Demographic");
    expect(dc.note).toContain("for 1 ad(s) the daily rows do not carry");
    expect(warnings.some((w) => w.includes("counted more than once"))).toBe(false);
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
    });
    const convCov = cov.classes.find((c) => c.report_class === "conversion_device")!;
    expect(convCov.spend).toBeNull();
    expect(convCov.spend_coverage_pct).toBeNull();
    expect(convCov.below_threshold).toBe(false);
    expect(convCov.note).toBeNull();
  });
});

describe("run warnings for overlaps and whole-period files", () => {
  const files = [
    { importId: "a", label: "Placements", filename: "IAP-PLACEPLAT-28D.csv", grain: { dimensions: ["Platform", "Placement"], period: { start: "2026-08-06", end: "2026-09-02" } } },
    { importId: "b", label: "Placements", filename: "IAP-devi-28D.csv", grain: { dimensions: ["Platform", "Placement", "Impression device"], period: { start: "2026-08-06", end: "2026-09-02" } } },
  ];

  it("names both files, the ads, the reason and what was not counted, without an em dash", () => {
    const finer = overlapWarning(files, { loser: "a", winner: "b", reason: "finer_breakdown", rows: 3436, spend: 1340876.12, groups: 1718 });
    expect(finer).toContain('[Overlap] Placements "IAP-PLACEPLAT-28D.csv" and "IAP-devi-28D.csv" both cover 1,718 ad(s)');
    expect(finer).toContain("finer breakdown (Platform · Placement · Impression device)");
    expect(finer).toContain("3,436 row(s) ($1,340,876.12) are not counted again");
    expect(finer).not.toMatch(/—/);
    const later = overlapWarning(files, { loser: "a", winner: "b", reason: "later_staged", rows: 1, spend: 1, groups: 1 });
    expect(later).toContain("was staged later");
    expect(later).toContain("If both are the same export, remove one of them.");
    const daily = overlapWarning(files, { loser: "a", winner: "b", reason: "daily_over_period", rows: 1, spend: 1, groups: 1 });
    expect(daily).toContain("carries them by day");
  });

  it("says what a whole-period file is, what it covers and where its spend goes", () => {
    const period: ReportPeriod = { start: "2026-08-06", end: "2026-09-02", endKnown: true };
    const pivot = wholePeriodWarning({ cls: "device_placement", label: "Placements", filename: "IAP-devi-28D.csv" }, period, 1340876.12, "daily");
    expect(pivot).toContain("[Whole-period] Placements \"IAP-devi-28D.csv\"");
    expect(pivot).toContain("covering 2026-08-06 to 2026-09-02, not a daily export");
    expect(pivot).toContain("feeds the Placements breakdowns and the reconciliation ledger at period grain");
    expect(pivot).not.toMatch(/—/);
    const demo = wholePeriodWarning({ cls: "demographic", label: "Demographics", filename: "d.csv" }, period, 1, "daily");
    expect(demo).toContain("Audience breakdowns");
    const summary = wholePeriodWarning({ cls: "ad_summary", label: "Ad Summary", filename: "s.xlsx" }, period, 1, "daily");
    expect(summary).toContain("creative metadata and total-spend cross-checking only");
    const alone = wholePeriodWarning({ cls: "device_placement", label: "Placements", filename: "p.csv" }, { ...period, endKnown: false }, 1, "period");
    expect(alone).toContain("states no reporting end");
    expect(alone).toContain("every ad row carries this period rather than a day");
  });
});
