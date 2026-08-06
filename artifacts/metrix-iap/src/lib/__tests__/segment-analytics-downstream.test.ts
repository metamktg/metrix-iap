import { describe, expect, it } from "vitest";
import { computeSegmentTotals, deriveSegmentMetrics } from "../segment-analytics";
import type { DemographicRow } from "../data/seedTypes";

function row(overrides: Partial<DemographicRow>): DemographicRow {
  return {
    cell_id: "ACCOUNT",
    "Ad name": "All ads",
    Age: "65+",
    Gender: "female",
    "Amount spent (USD)": 100,
    Reach: 1000,
    Impressions: 2000,
    Results: 5,
    "Clicks (all)": 60,
    "Link clicks": 50,
    CPA_result: 20,
    CTR_link_pct: 2.5,
    Result_per_link_click_pct: 10,
    ...overrides,
  };
}

describe("downstream funnel totals/derived metrics", () => {
  it("sums adds_to_cart/checkouts_initiated/purchases when every row carries them", () => {
    const rows = [
      row({ adds_to_cart: 4, checkouts_initiated: 1, purchases: 0 }),
      row({ adds_to_cart: 6, checkouts_initiated: 2, purchases: 1 }),
    ];
    const totals = computeSegmentTotals(rows);
    expect(totals.addsToCart).toBe(10);
    expect(totals.checkoutsInitiated).toBe(3);
    expect(totals.purchases).toBe(1);
  });

  it("reports null (never a partial sum) when any row is missing the field", () => {
    const rows = [
      row({ adds_to_cart: 4, checkouts_initiated: 1, purchases: 0 }),
      row({}), // no funnel fields carried on this row
    ];
    const totals = computeSegmentTotals(rows);
    expect(totals.addsToCart).toBeNull();
    expect(totals.checkoutsInitiated).toBeNull();
    expect(totals.purchases).toBeNull();
  });

  it("derives add-to-cart rate and cost per ATC from link clicks and spend", () => {
    const totals = computeSegmentTotals([
      row({ "Amount spent (USD)": 200, "Link clicks": 100, adds_to_cart: 20, checkouts_initiated: 5 }),
    ]);
    const derived = deriveSegmentMetrics(totals);
    expect(derived.addToCartRate).toBe(20); // 20 ATC / 100 link clicks * 100
    expect(derived.costPerAddToCart).toBe(10); // 200 spend / 20 ATC
    expect(derived.checkoutRate).toBe(5); // 5 checkouts / 100 link clicks * 100
    expect(derived.costPerCheckout).toBe(40); // 200 spend / 5 checkouts
  });

  it("surfaces a high-CTR, low-direct-conversion segment as high downstream intent via ATC rate", () => {
    // e.g. a 65+ segment with the best CTR/reach but weak direct Results —
    // ATC rate should still reveal real funnel intent independent of CPA.
    const totals = computeSegmentTotals([
      row({
        Age: "65+",
        "Amount spent (USD)": 150,
        "Link clicks": 80,
        Results: 1,
        adds_to_cart: 24,
        checkouts_initiated: 6,
      }),
    ]);
    const derived = deriveSegmentMetrics(totals);
    expect(derived.addToCartRate).toBeCloseTo(30, 5); // 24 / 80 * 100
    expect(derived.checkoutRate).toBeCloseTo(7.5, 5); // 6 / 80 * 100
  });

  it("is null-safe when link clicks are zero", () => {
    const totals = computeSegmentTotals([
      row({ "Link clicks": 0, adds_to_cart: 0, checkouts_initiated: 0 }),
    ]);
    const derived = deriveSegmentMetrics(totals);
    expect(derived.addToCartRate).toBeNull();
    expect(derived.checkoutRate).toBeNull();
  });
});
