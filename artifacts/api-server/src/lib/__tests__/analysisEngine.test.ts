// ─── Analysis engine adapter tests ─────────────────────────────────────
// Covers the pure mapping functions extracted for the shared aggregation
// core: CSV rows and normalized live-Meta insights rows must both resolve
// to the same AggInputRow shape, and the live-Meta path must never invent
// a Result/CPA figure it can't honestly back.

import { describe, it, expect } from "vitest";
import {
  withinRange,
  csvDemoRowToAgg,
  csvPlacementRowToAgg,
  metaDemoRowToAgg,
  metaPlacementRowToAgg,
  DELIVERY_ONLY_RESULT_TYPE,
} from "../analysisEngine";
import type { IapCsvRow } from "../iapCsvParser";
import type { NormalizedReportRow } from "../metaGraph";

describe("withinRange", () => {
  const maxDate = "2026-07-20";
  it("includes every date for the 'all' preset", () => {
    expect(withinRange("2020-01-01", "all", maxDate)).toBe(true);
  });
  it("keeps only the trailing N days for 7d/14d/30d", () => {
    expect(withinRange("2026-07-14", "7d", maxDate)).toBe(true);
    expect(withinRange("2026-07-13", "7d", maxDate)).toBe(false);
    expect(withinRange("2026-06-21", "30d", maxDate)).toBe(true);
    expect(withinRange("2026-06-20", "30d", maxDate)).toBe(false);
  });
});

describe("csvDemoRowToAgg", () => {
  it("maps a parsed demographic CSV row without any ad-level fields", () => {
    const row: IapCsvRow = {
      breakdowns: { Gender: "female", Age: "25-34", Date: "2026-07-01" },
      base: {
        amount_spent: 120.5,
        impressions: 4000,
        reach: 3000,
        clicks_all: 80,
        link_clicks: 40,
        results: 6,
        result_type: "onb_initiate_checkout",
      },
      extra: { adds_to_cart: 10 },
    };
    const agg = csvDemoRowToAgg(row);
    expect(agg.gender).toBe("female");
    expect(agg.age).toBe("25-34");
    expect(agg.date).toBe("2026-07-01");
    expect(agg.resultType).toBe("onb_initiate_checkout");
    expect(agg.spend).toBe(120.5);
    expect(agg.results).toBe(6);
    expect(agg.extra).toEqual({ adds_to_cart: 10 });
    expect(agg.campaign).toBe("");
  });

  it("falls back to 'Results' when result_type is blank", () => {
    const row: IapCsvRow = {
      breakdowns: { Gender: "male", Age: "35-44", Date: "2026-07-01" },
      base: { amount_spent: 10, impressions: 100, reach: 90, clicks_all: 2, link_clicks: 1, results: null, result_type: null },
      extra: {},
    };
    expect(csvDemoRowToAgg(row).resultType).toBe("Results");
  });
});

describe("csvPlacementRowToAgg", () => {
  it("maps a parsed device/placement/platform CSV row with ad-level fields", () => {
    const row: IapCsvRow = {
      breakdowns: {
        "Campaign name": "Campaign A",
        "Ad set name": "Ad Set 1",
        "Ad name": "Ad 1",
        Date: "2026-07-02",
        "Impression device": "mobile",
        Placement: "feed",
        Platform: "facebook",
      },
      base: {
        amount_spent: 55,
        impressions: 900,
        reach: 800,
        clicks_all: 20,
        link_clicks: 12,
        results: 3,
        result_type: "purchase",
      },
      extra: {},
    };
    const agg = csvPlacementRowToAgg(row);
    expect(agg.campaign).toBe("Campaign A");
    expect(agg.adSet).toBe("Ad Set 1");
    expect(agg.adName).toBe("Ad 1");
    expect(agg.device).toBe("mobile");
    expect(agg.placement).toBe("feed");
    expect(agg.platform).toBe("facebook");
    expect(agg.resultType).toBe("purchase");
    expect(agg.results).toBe(3);
  });
});

function normalizedRow(overrides: Partial<NormalizedReportRow>): NormalizedReportRow {
  return {
    campaign_id: "1",
    campaign_name: "Live Campaign",
    adset_id: "2",
    adset_name: "Live Ad Set",
    ad_id: "3",
    ad_name: "Live Ad",
    date: "2026-07-10",
    dimensions: {},
    metrics: {},
    ...overrides,
  };
}

describe("metaDemoRowToAgg", () => {
  it("maps delivery metrics honestly and never invents results/CPA", () => {
    const row = normalizedRow({
      dimensions: { age: "18-24", gender: "female", text: null, body_asset_id: null },
      metrics: { spend: 200, reach: 1500, impressions: 5000, clicks: 90, inline_link_clicks: 45 },
    });
    const agg = metaDemoRowToAgg(row);
    expect(agg.gender).toBe("female");
    expect(agg.age).toBe("18-24");
    expect(agg.spend).toBe(200);
    expect(agg.impressions).toBe(5000);
    expect(agg.linkClicks).toBe(45);
    expect(agg.results).toBeNull();
    expect(agg.resultType).toBeNull();
    expect(agg.extra).toEqual({});
  });
});

describe("metaPlacementRowToAgg", () => {
  it("maps device/placement/platform dimensions and ad-level identity", () => {
    const row = normalizedRow({
      dimensions: { impression_device: "desktop", platform: "instagram", placement: "story" },
      metrics: { spend: 75, reach: 600, impressions: 2200, clicks: 30, inline_link_clicks: 18 },
    });
    const agg = metaPlacementRowToAgg(row);
    expect(agg.campaign).toBe("Live Campaign");
    expect(agg.adName).toBe("Live Ad");
    expect(agg.device).toBe("desktop");
    expect(agg.platform).toBe("instagram");
    expect(agg.placement).toBe("story");
    expect(agg.results).toBeNull();
    expect(agg.resultType).toBeNull();
  });

  it("resolves to the honest delivery-only label once bucketed (not this function's job, but the constant is exported for callers)", () => {
    expect(DELIVERY_ONLY_RESULT_TYPE).toBe("Delivery only (live connection)");
  });
});
