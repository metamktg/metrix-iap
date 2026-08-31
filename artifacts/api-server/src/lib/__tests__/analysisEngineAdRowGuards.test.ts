// Unit tests for buildAdPerformanceRows' pre-write consistency guards —
// the defense-in-depth layer behind the parser's Day normalization.
//
// The guards convert what used to be a raw Postgres "duplicate key value
// violates unique constraint" mid-insert (after the window-delete had
// already destroyed prior rows — the August 2026 AAFE failure) into an
// actionable error thrown BEFORE any destructive DB write.
//
// Pure unit tests — no DB, no network.

import { describe, expect, it } from "vitest";
import { AnalysisError, buildAdPerformanceRows, mergeAdPerformanceBuckets } from "../analysisEngine";
import type { IapCsvRow } from "../iapCsvParser";

type AdBuckets = Parameters<typeof buildAdPerformanceRows>[2];

function bucket(overrides: Partial<AdBuckets extends Map<string, infer V> ? V : never>) {
  return {
    spend: 10,
    impressions: 1000,
    reach: 900,
    clicksAll: 20,
    linkClicks: 15,
    results: 2,
    resultType: "Purchases",
    addsToCart: null,
    checkoutsInitiated: null,
    purchases: null,
    addsToCartValue: null,
    extra: {},
    campaign: "C1",
    adSet: "AS1",
    adName: "Ad A",
    date: "2026-07-01",
    ...overrides,
  };
}

describe("buildAdPerformanceRows guards", () => {
  it("maps distinct buckets to per-day rows", () => {
    const buckets = new Map([
      ["k1", bucket({ date: "2026-07-01" })],
      ["k2", bucket({ date: "2026-07-02" })],
    ]) as unknown as AdBuckets;
    const rows = buildAdPerformanceRows("acct", "run", buckets, new Map());
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({
      account_id: "acct",
      ad_name: "Ad A",
      campaign_name: "C1",
      date_start: "2026-07-01",
      date_end: "2026-07-01",
      manual_analysis_run_id: "run",
    });
  });

  it("preserves Meta ad and asset identity on normalized performance rows", () => {
    const buckets = new Map([
      [
        "k1",
        bucket({
          metaAdId: "120253000000000001",
          imageName: "launch-hero-final.png",
          videoName: undefined,
        }),
      ],
    ]) as unknown as AdBuckets;
    const rows = buildAdPerformanceRows("acct", "run", buckets, new Map());
    expect(rows[0]).toMatchObject({
      meta_ad_id: "120253000000000001",
      image_name: "launch-hero-final.png",
      video_name: null,
    });
  });

  it("rejects a non-normalized date before any write", () => {
    const buckets = new Map([["k1", bucket({ date: "7/1/2026" })]]) as unknown as AdBuckets;
    expect(() => buildAdPerformanceRows("acct", "run", buckets, new Map())).toThrow(AnalysisError);
    expect(() => buildAdPerformanceRows("acct", "run", buckets, new Map())).toThrow(/non-normalized date "7\/1\/2026"/);
  });

  it("rejects two buckets resolving to the same unique-key tuple with an actionable message", () => {
    // Distinct bucket keys, same DB tuple — exactly what mixed date formats
    // used to produce before parse-time normalization existed.
    const buckets = new Map([
      ["C1Ad A2026-07-01", bucket({})],
      ["C1Ad A2026-07-01#2", bucket({})],
    ]) as unknown as AdBuckets;
    expect(() => buildAdPerformanceRows("acct", "run", buckets, new Map())).toThrow(/same ad\/day/);
    expect(() => buildAdPerformanceRows("acct", "run", buckets, new Map())).toThrow(/date formats/);
  });
});

describe("mixed-format inputs merge after parse-time normalization", () => {
  it("same day in ISO (placement) and normalized slash (demo) lands in ONE bucket", () => {
    const mkRow = (breakdowns: Record<string, string>, spend: number): IapCsvRow => ({
      breakdowns,
      base: { amount_spent: spend, impressions: 100, results: 1, result_type: "Purchases" },
      extra: {},
    });
    // Post-normalization both sources carry ISO — this pins the merge
    // property the AAFE failure violated.
    const placement = [
      mkRow({ "Campaign name": "C1", "Ad set name": "AS", "Ad name": "Ad A", Day: "2026-07-13", Placement: "feed", Platform: "facebook" }, 5),
    ];
    const demo = [
      mkRow({ "Campaign name": "C1", "Ad set name": "AS", "Ad name": "Ad A", Day: "2026-07-13", Gender: "female", Age: "25-34" }, 5),
    ];
    const { adBuckets } = mergeAdPerformanceBuckets(demo, placement, []);
    expect(adBuckets.size).toBe(1);
    const rows = buildAdPerformanceRows("acct", "run", adBuckets, new Map());
    expect(rows.length).toBe(1);
    expect(rows[0]!["date_start"]).toBe("2026-07-13");
  });

  it("carries Ad ID and Meta asset names from the summary into a placement bucket", () => {
    const placement: IapCsvRow[] = [{
      breakdowns: {
        "Campaign name": "C1",
        "Ad set name": "AS",
        "Ad name": "Ad A",
        "Ad ID": "120253000000000001",
        Day: "2026-07-13",
        Placement: "feed",
        Platform: "facebook",
      },
      base: { impressions: 100, result_type: "Purchases" },
      extra: {},
    }];
    const summary: IapCsvRow[] = [{
      breakdowns: {
        "Campaign name": "C1",
        "Ad set name": "AS",
        "Ad name": "Ad A",
        "Ad ID": "120253000000000001",
        Day: "2026-07-13",
      },
      base: { amount_spent: 5, results: 1, result_type: "Purchases" },
      extra: {},
      creativeMetadata: { "Image name": "launch-hero.png" },
    }];
    const { adBuckets, adCreativeMetadata } = mergeAdPerformanceBuckets([], placement, summary);
    const rows = buildAdPerformanceRows("acct", "run", adBuckets, adCreativeMetadata);
    expect(rows[0]).toMatchObject({
      meta_ad_id: "120253000000000001",
      image_name: "launch-hero.png",
    });
  });

  it("keeps reused ad names separate when Meta ad IDs differ", () => {
    const placement: IapCsvRow[] = [
      {
        breakdowns: {
          "Campaign name": "C1", "Ad set name": "AS", "Ad name": "Reused Name",
          "Ad ID": "1001", Day: "2026-07-13", Placement: "feed", Platform: "facebook",
        },
        base: { impressions: 100, result_type: "Purchases" },
        extra: {},
      },
      {
        breakdowns: {
          "Campaign name": "C1", "Ad set name": "AS", "Ad name": "Reused Name",
          "Ad ID": "1002", Day: "2026-07-13", Placement: "feed", Platform: "facebook",
        },
        base: { impressions: 200, result_type: "Purchases" },
        extra: {},
      },
    ];
    const { adBuckets } = mergeAdPerformanceBuckets([], placement, []);
    const rows = buildAdPerformanceRows("acct", "run", adBuckets, new Map());
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.meta_ad_id).sort()).toEqual(["1001", "1002"]);
    expect(rows.map((row) => row.impressions).sort((a, b) => a - b)).toEqual([100, 200]);
  });
});
