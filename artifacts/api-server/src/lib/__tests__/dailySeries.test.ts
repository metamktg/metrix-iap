// ─── Daily series aggregation ─────────────────────────────────────────
//
// Two mistakes are easy to make here and hard to notice once a chart is
// drawn over the result:
//
//   1. Averaging a rate across ads. The mean of five ads' CPAs is not the
//      day's CPA — it weights a $3 ad the same as a $3,000 one. The day's
//      CPA is the day's spend over the day's results, and nothing else.
//   2. Turning "not measured" into 0. A trend that dips to zero and a trend
//      with a hole in it are different findings.

import { describe, it, expect } from "vitest";
import { aggregateDailySeries } from "../analysisEngine";

const row = (day: string, o: Partial<Record<string, number | null>> = {}) => ({
  date_start: day,
  spend: null, impressions: null, reach: null,
  clicks_all: null, link_clicks: null, results: null,
  ...o,
});

describe("aggregateDailySeries — rates come from the day's sums", () => {
  it("computes CPA from summed spend over summed results, not the mean of per-ad CPAs", () => {
    // Ad A: $3 / 1 result  -> CPA 3.    Ad B: $3000 / 10 results -> CPA 300.
    // Mean of the two CPAs is 151.50. The day's real CPA is 3003/11 = 273.0.
    const out = aggregateDailySeries([
      row("2026-08-01", { spend: 3, results: 1 }),
      row("2026-08-01", { spend: 3000, results: 10 }),
    ]);
    expect(out.points[0]!.cpa).toBeCloseTo(3003 / 11, 6);
    expect(out.points[0]!.cpa).not.toBeCloseTo(151.5, 1);
  });

  it("computes CTR from summed link clicks over summed impressions", () => {
    const out = aggregateDailySeries([
      row("2026-08-01", { link_clicks: 10, impressions: 1000 }),
      row("2026-08-01", { link_clicks: 90, impressions: 9000 }),
    ]);
    expect(out.points[0]!.ctr_link_pct).toBeCloseTo(1.0, 6);
  });

  it("computes CVR from summed results over summed link clicks", () => {
    const out = aggregateDailySeries([
      row("2026-08-01", { results: 5, link_clicks: 50 }),
      row("2026-08-01", { results: 15, link_clicks: 150 }),
    ]);
    expect(out.points[0]!.cvr_link_pct).toBeCloseTo(10.0, 6);
  });

  it("returns null for a rate with a zero denominator rather than 0 or Infinity", () => {
    const out = aggregateDailySeries([row("2026-08-01", { spend: 500, results: 0, impressions: 0, link_clicks: 0 })]);
    expect(out.points[0]!.cpa).toBeNull();
    expect(out.points[0]!.ctr_link_pct).toBeNull();
    expect(out.points[0]!.cvr_link_pct).toBeNull();
  });
});

describe("aggregateDailySeries — not measured stays null", () => {
  it("keeps a metric null when no contributing row measured it", () => {
    const out = aggregateDailySeries([
      row("2026-08-01", { spend: 100 }),
      row("2026-08-01", { spend: 200 }),
    ]);
    expect(out.points[0]!.spend).toBe(300);
    expect(out.points[0]!.results).toBeNull();
    expect(out.points[0]!.impressions).toBeNull();
  });

  it("sums the rows that did measure it and ignores the ones that did not", () => {
    const out = aggregateDailySeries([
      row("2026-08-01", { results: 4 }),
      row("2026-08-01", { results: null }),
      row("2026-08-01", { results: 6 }),
    ]);
    expect(out.points[0]!.results).toBe(10);
  });

  it("distinguishes a measured zero from an unmeasured metric", () => {
    const out = aggregateDailySeries([row("2026-08-01", { results: 0 })]);
    expect(out.points[0]!.results).toBe(0);
    expect(out.points[0]!.spend).toBeNull();
  });
});

describe("aggregateDailySeries — days", () => {
  it("orders points ascending and counts the ads behind each", () => {
    const out = aggregateDailySeries([
      row("2026-08-03", { spend: 3 }),
      row("2026-08-01", { spend: 1 }),
      row("2026-08-01", { spend: 1 }),
    ]);
    expect(out.points.map((p) => p.day)).toEqual(["2026-08-01", "2026-08-03"]);
    expect(out.points[0]!.ads).toBe(2);
    expect(out.points[1]!.ads).toBe(1);
  });

  it("names the days inside the span that have no rows at all", () => {
    const out = aggregateDailySeries([
      row("2026-08-01", { spend: 1 }),
      row("2026-08-04", { spend: 1 }),
    ]);
    expect(out.missing_days).toEqual(["2026-08-02", "2026-08-03"]);
    expect(out.date_start).toBe("2026-08-01");
    expect(out.date_end).toBe("2026-08-04");
  });

  it("reports no gaps for a contiguous span", () => {
    const out = aggregateDailySeries([
      row("2026-08-01", { spend: 1 }),
      row("2026-08-02", { spend: 1 }),
    ]);
    expect(out.missing_days).toEqual([]);
  });

  it("crosses a month boundary without inventing days", () => {
    const out = aggregateDailySeries([
      row("2026-08-30", { spend: 1 }),
      row("2026-09-02", { spend: 1 }),
    ]);
    expect(out.missing_days).toEqual(["2026-08-31", "2026-09-01"]);
  });

  it("handles an empty result set", () => {
    const out = aggregateDailySeries([]);
    expect(out).toEqual({ points: [], date_start: null, date_end: null, missing_days: [] });
  });

  it("drops a row whose day is not a normalized ISO date rather than bucketing it under a bad key", () => {
    const out = aggregateDailySeries([
      row("2026-08-01", { spend: 5 }),
      row("08/02/2026", { spend: 99 }),
    ]);
    expect(out.points).toHaveLength(1);
    expect(out.points[0]!.spend).toBe(5);
  });
});
