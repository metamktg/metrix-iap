// ─── One placement rollup, not three (E-c) ────────────────────────────
//
// rollupPlacements existed twice — PlacementsView's full version and
// AnalysisOverview's trimmed near-copy — plus a third inline derivation of
// cpa/ctr for placement rows arriving from the analysis-run API. Two
// implementations of one number invite exactly one of them to be corrected
// later. These pin the shared behaviour both entry points now share.

import { describe, it, expect } from "vitest";
import { rollupPlacements, derivePlacementRollup } from "../placement-rollup";
import type { PlacementRow } from "@/lib/data/seedTypes";

function row(over: Partial<PlacementRow> = {}): PlacementRow {
  return {
    Placement: "facebook_feed",
    Platform: "facebook",
    "Amount spent (USD)": 100,
    Impressions: 10_000,
    "Link clicks": 200,
    Results: 10,
    CPA: 10,
    ...over,
  } as PlacementRow;
}

describe("rollupPlacements", () => {
  it("sums rows sharing a placement across platforms", () => {
    const [r] = rollupPlacements([
      row({ Platform: "facebook" }),
      row({ Platform: "instagram", "Amount spent (USD)": 50, Impressions: 5_000, "Link clicks": 100, Results: 5 }),
    ]);
    expect(r.placement).toBe("facebook_feed");
    expect(r.spend).toBe(150);
    expect(r.results).toBe(15);
    expect(r.impressions).toBe(15_000);
    expect(r.linkClicks).toBe(300);
  });

  it("derives the blend rather than averaging per-row ratios", () => {
    // Row CPAs are $10 and $20; the blend over the combined totals is $12.
    const [r] = rollupPlacements([
      row({ "Amount spent (USD)": 100, Results: 10, CPA: 10 }),
      row({ Platform: "instagram", "Amount spent (USD)": 200, Results: 10, CPA: 20 }),
    ]);
    expect(r.cpa).toBeCloseTo(300 / 20, 6);
  });

  it("keeps every ratio null when its denominator is zero", () => {
    const [r] = rollupPlacements([
      row({ Results: 0, Impressions: 0, "Link clicks": 0, CPA: null }),
    ]);
    // Zero impressions has no CTR — 0% would assert a measurement.
    expect(r.cpa).toBeNull();
    expect(r.ctr).toBeNull();
    expect(r.cpm).toBeNull();
    expect(r.cpc).toBeNull();
  });

  it("separates distinct placements", () => {
    const out = rollupPlacements([row(), row({ Placement: "instagram_stories" })]);
    expect(out.map((p) => p.placement).sort()).toEqual(["facebook_feed", "instagram_stories"]);
  });
});

describe("derivePlacementRollup", () => {
  it("produces the same ratios for pre-aggregated run rows as for seed rows", () => {
    const fromRows = rollupPlacements([
      row({ "Amount spent (USD)": 100, Results: 10, Impressions: 10_000, "Link clicks": 200 }),
      row({ Platform: "instagram", "Amount spent (USD)": 50, Results: 5, Impressions: 5_000, "Link clicks": 100 }),
    ])[0];
    const fromTotals = derivePlacementRollup("facebook_feed", {
      spend: 150, results: 15, impressions: 15_000, linkClicks: 300,
    });
    expect(fromTotals).toEqual(fromRows);
  });
});
