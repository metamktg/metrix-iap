import { describe, expect, it } from "vitest";
import { buildSegmentMetricCatalog, segmentMetricById, UNSUPPORTED_SEGMENT_METRICS } from "../segmentMetricsCatalog";
import { computeSegmentTotals, deriveSegmentMetrics } from "@/lib/segment-analytics";
import type { DemographicRow } from "../seedTypes";

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

describe("segment metric catalog — downstream funnel metrics", () => {
  it("no longer lists adds-to-cart / checkouts-initiated as structurally unsupported", () => {
    const ids = UNSUPPORTED_SEGMENT_METRICS.map((m) => m.id);
    expect(ids).not.toContain("atc");
    expect(ids).not.toContain("initiate_checkout");
  });

  it("lights up as available once the segment's rows carry funnel data", () => {
    const rows = [row({ adds_to_cart: 12, checkouts_initiated: 3 })];
    const totals = computeSegmentTotals(rows);
    const derived = deriveSegmentMetrics(totals);
    const catalog = buildSegmentMetricCatalog(totals, derived);

    const atc = segmentMetricById(catalog, "atc");
    expect(atc?.availability).toBe("available");
    expect(atc?.value).toBe(12);

    const checkout = segmentMetricById(catalog, "initiate_checkout");
    expect(checkout?.availability).toBe("available");
    expect(checkout?.value).toBe(3);

    const rate = segmentMetricById(catalog, "add_to_cart_rate");
    expect(rate?.availability).toBe("available");
  });

  it("stays honestly unavailable (never fabricated) when the import doesn't carry the columns", () => {
    const rows = [row({})]; // no adds_to_cart/checkouts_initiated field at all
    const totals = computeSegmentTotals(rows);
    const derived = deriveSegmentMetrics(totals);
    const catalog = buildSegmentMetricCatalog(totals, derived);

    const atc = segmentMetricById(catalog, "atc");
    expect(atc?.availability).toBe("unavailable");
    expect(atc?.value).toBeNull();
    expect(atc?.unavailableReason).toBeTruthy();
  });
});
