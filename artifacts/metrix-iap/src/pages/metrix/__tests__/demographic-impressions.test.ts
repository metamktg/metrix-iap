// ─── Demographic CTR was structurally impossible ──────────────────────
//
// placement_performance, platform_performance and device_performance all
// declare an `impressions` column natively. demographic_performance never
// did — even though the manual-analysis engine HAD the value the whole
// time and read it to derive each row's cpa and cvr_link_pct, then dropped
// it because there was nowhere to put it.
//
// The cost was a whole class of audience analysis. With no impressions per
// age/gender there is no demographic CTR and no demographic CPM, so the
// Audience view could answer "which age band spends" but never "which age
// band actually engages". The client had given up too: adaptApiDemoRows
// hardcoded Impressions to 0 and CTR_link_pct to 0, with a comment saying
// impressions were not stored at demographic level.
//
// The column exists now and the engine persists it, so the rate is a real
// derivation. These pin the client end of that chain — the one place a
// regression would silently reinstate a hardcoded zero.

import { describe, it, expect } from "vitest";
import { adaptApiDemoRows } from "../analysis/AudienceView";

const base = {
  age: "25-34",
  gender: "female",
  spend: 100,
  results: 10,
  link_clicks: 200,
  adds_to_cart: null,
  checkouts_initiated: null,
  purchases: null,
  adds_to_cart_value: null,
};

describe("adaptApiDemoRows · demographic impressions", () => {
  it("carries the real impressions figure through instead of zero", () => {
    const [row] = adaptApiDemoRows([{ ...base, impressions: 50_000 }]);
    expect(row!.Impressions).toBe(50_000);
  });

  it("derives CTR from impressions rather than reporting a hardcoded 0", () => {
    const [row] = adaptApiDemoRows([{ ...base, impressions: 50_000, link_clicks: 500 }]);
    // 500 / 50,000 = 1%
    expect(row!.CTR_link_pct).toBeCloseTo(1, 6);
  });

  it("reports no CTR when the row predates the column", () => {
    // Rows ingested before the backfill carry no measurement. A rate must
    // not be invented for them.
    const [row] = adaptApiDemoRows([{ ...base, impressions: null, link_clicks: 500 }]);
    expect(row!.CTR_link_pct).toBe(0);
    expect(row!.Impressions).toBe(0);
  });

  it("does not divide by zero when impressions are recorded as zero", () => {
    const [row] = adaptApiDemoRows([{ ...base, impressions: 0, link_clicks: 500 }]);
    expect(Number.isFinite(row!.CTR_link_pct)).toBe(true);
    expect(row!.CTR_link_pct).toBe(0);
  });

  it("leaves the other derivations alone", () => {
    const [row] = adaptApiDemoRows([{ ...base, impressions: 10_000 }]);
    expect(row!.Age).toBe("25-34");
    expect(row!.Gender).toBe("female");
    expect(row!["Amount spent (USD)"]).toBe(100);
    // $100 over 10 results
    expect(row!.CPA_result).toBeCloseTo(10, 6);
    // 10 results over 200 link clicks
    expect(row!.Result_per_link_click_pct).toBeCloseTo(5, 6);
  });
});
