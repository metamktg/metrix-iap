// ─── analysisEngine merge/dedupe + CTR/CVR field-mapping regression tests ──
//
// Locks in two audit-confirmed bugs:
//
//  BUG 1 (double-counting): the optional ad_summary export's "Campaign name"
//  breakdown is tolerated blank (see iapCsvSpec.ts's ad_summary
//  requiredBreakdownColumns comment). When it's blank for every row,
//  mergeAdPerformanceBuckets must still recognize a summary row as a
//  supplement to the matching placement-export bucket (same ad + date, real
//  campaign name) rather than inserting it as a second, distinct
//  ad_performance row under campaign_name="". Ad name must still
//  distinguish two different blank-campaign ads on the same date.
//
//  BUG 2 (CTR/CVR field swap): variablePerformancePayload must never write
//  the CVR (results-per-link-click) value into CTR_link_pct — true CTR is
//  not computable at the token level (Impressions is hardcoded to 0), so
//  CTR_link_pct must reflect "not computable" (null, matching derivedRates()
//  in this file and pctOf() in scripts/src/metrix-supabase/import.ts on a
//  zero/absent denominator) while the real CVR value still lands on
//  Result_per_link_click_pct.

import { describe, it, expect } from "vitest";
import { mergeAdPerformanceBuckets, variablePerformancePayload } from "../analysisEngine";
import type { IapCsvRow } from "../iapCsvParser";

/** Builds a minimal IapCsvRow for these tests — only the fields the merge/
 * accumulate logic actually reads are populated; everything else defaults
 * to null/absent exactly as the real parser would leave an untouched column. */
function makeRow(
  breakdowns: Record<string, string>,
  base: Partial<{
    amount_spent: number | null;
    impressions: number | null;
    reach: number | null;
    clicks_all: number | null;
    link_clicks: number | null;
    results: number | null;
    result_type: string | null;
  }> = {},
): IapCsvRow {
  return {
    breakdowns,
    base: {
      amount_spent: null,
      impressions: null,
      reach: null,
      clicks_all: null,
      link_clicks: null,
      results: null,
      result_type: null,
      ...base,
    },
    extra: {},
  };
}

describe("mergeAdPerformanceBuckets — blank-Campaign-name ad_summary handling (BUG 1)", () => {
  it("supplements the matching placement bucket instead of inserting a second, distinct row", () => {
    // Placement export: impression-only device-breakdown row — no spend/results,
    // exactly the case the ad_summary supplement exists to fill in.
    const placement = [
      makeRow(
        { "Campaign name": "Prospecting - Broad", "Ad name": "C2E_STC_QF_BOOK2_T1", Day: "2026-06-01", Placement: "feed", Platform: "facebook" },
        { impressions: 1000, reach: 800, clicks_all: 50, link_clicks: 20 },
      ),
    ];
    // ad_summary export: same ad/day, but this account's export has Campaign
    // name blank for every row (tolerated per iapCsvSpec.ts).
    const summary = [
      makeRow(
        { "Campaign name": "", "Ad name": "C2E_STC_QF_BOOK2_T1", Day: "2026-06-01" },
        { amount_spent: 123.45, results: 5, result_type: "onb_complete_registration", link_clicks: 20, clicks_all: 22 },
      ),
    ];

    const { adBuckets, unknownResultTypeRows } = mergeAdPerformanceBuckets([], placement, summary);

    // Exactly one ad_performance row for this ad/day — not two.
    expect(adBuckets.size).toBe(1);
    const bucket = Array.from(adBuckets.values())[0]!;
    // The surviving row keeps the REAL campaign name from the placement export...
    expect(bucket.campaign).toBe("Prospecting - Broad");
    // ...and picked up spend/results/resultType from the blank-campaign summary row.
    expect(bucket.spend).toBe(123.45);
    expect(bucket.results).toBe(5);
    expect(bucket.resultType).toBe("onb_complete_registration");
    // Placement-sourced fields are untouched.
    expect(bucket.impressions).toBe(1000);
    // A real result type was found — never falls back to the "unknown" sentinel.
    expect(unknownResultTypeRows).toBe(0);
  });

  it("still supplements when placement carries no rows for that ad/day at all (summary-only surfacing)", () => {
    // No placement, no demo — only a blank-campaign summary row. Nothing to
    // supplement against, so this must surface as its own row (this is NOT
    // the double-count bug — there is only one source for this ad/day).
    const summary = [
      makeRow(
        { "Campaign name": "", "Ad name": "SoloAd_v1", Day: "2026-06-02" },
        { amount_spent: 50, results: 2, result_type: "purchase" },
      ),
    ];
    const { adBuckets } = mergeAdPerformanceBuckets([], [], summary);
    expect(adBuckets.size).toBe(1);
    const bucket = Array.from(adBuckets.values())[0]!;
    expect(bucket.adName).toBe("SoloAd_v1");
    expect(bucket.spend).toBe(50);
  });

  it("does not collide two different ads that both have a blank campaign on the same date", () => {
    const summary = [
      makeRow({ "Campaign name": "", "Ad name": "AdOne", Day: "2026-06-03" }, { amount_spent: 10, results: 1 }),
      makeRow({ "Campaign name": "", "Ad name": "AdTwo", Day: "2026-06-03" }, { amount_spent: 20, results: 2 }),
    ];
    const { adBuckets } = mergeAdPerformanceBuckets([], [], summary);
    expect(adBuckets.size).toBe(2);
    const byName = new Map(Array.from(adBuckets.values()).map((b) => [b.adName, b]));
    expect(byName.get("AdOne")?.spend).toBe(10);
    expect(byName.get("AdTwo")?.spend).toBe(20);
  });

  it("regression guard: a real (non-blank) campaign name in ad_summary still matches placement exactly as before", () => {
    const placement = [
      makeRow(
        { "Campaign name": "Retargeting", "Ad name": "AdX", Day: "2026-06-04", Placement: "feed", Platform: "facebook" },
        { impressions: 500 },
      ),
    ];
    const summary = [
      makeRow({ "Campaign name": "Retargeting", "Ad name": "AdX", Day: "2026-06-04" }, { amount_spent: 75, results: 3 }),
    ];
    const { adBuckets } = mergeAdPerformanceBuckets([], placement, summary);
    expect(adBuckets.size).toBe(1);
    const bucket = Array.from(adBuckets.values())[0]!;
    expect(bucket.spend).toBe(75);
    expect(bucket.impressions).toBe(500);
  });

  it("demo-only ad/days are still surfaced (unrelated existing behavior stays intact)", () => {
    const demo = [
      makeRow(
        { "Campaign name": "Prospecting", "Ad name": "DemoOnlyAd", Day: "2026-06-05", Gender: "female", Age: "25-34" },
        { amount_spent: 30, results: 1, result_type: "lead" },
      ),
    ];
    const { adBuckets } = mergeAdPerformanceBuckets(demo, [], []);
    expect(adBuckets.size).toBe(1);
    const bucket = Array.from(adBuckets.values())[0]!;
    expect(bucket.adName).toBe("DemoOnlyAd");
    expect(bucket.spend).toBe(30);
  });
});

describe("variablePerformancePayload — CTR/CVR field mapping (BUG 2)", () => {
  it("never writes the CVR value onto CTR_link_pct; CVR lands only on Result_per_link_click_pct", () => {
    const payload = variablePerformancePayload(
      "STC",
      { spend: 100, results: 10, linkClicks: 50, adCount: 3 },
      "onb_complete_registration",
    );
    // The CVR-shaped ratio (results / link clicks * 100 = 20) must not appear
    // under CTR_link_pct — true CTR (link clicks / impressions) is not
    // computable at the token level (Impressions is hardcoded to 0).
    expect(payload["CTR_link_pct"]).toBeNull();
    expect(payload["Result_per_link_click_pct"]).toBe(20);
    // Sanity on the surrounding fields this same row carries.
    expect(payload["CPA_result"]).toBe(10);
    expect(payload["Impressions"]).toBe(0);
    expect(payload["Reach"]).toBe(0);
    expect(payload["Clicks (all)"]).toBe(0);
    expect(payload["Link clicks"]).toBe(50);
    expect(payload["Results"]).toBe(10);
    expect(payload["unique_ads"]).toBe(3);
    expect(payload["Result type"]).toBe("onb_complete_registration");
  });

  it("CTR_link_pct stays null even when CVR itself is not computable (zero link clicks)", () => {
    const payload = variablePerformancePayload("QF", { spend: 40, results: 0, linkClicks: 0, adCount: 1 }, "purchase");
    expect(payload["CTR_link_pct"]).toBeNull();
    expect(payload["Result_per_link_click_pct"]).toBe(0);
    expect(payload["CPA_result"]).toBeNull();
  });
});
