// ─── Creative assembly + Ads Manager link tests ───────────────────────
// Covers the ad-registry resolution added for the Meta backfill pipeline:
// primary-ad preference order per cell, card wiring of assetUrl/metaAdId/
// adAccountId, and the Ads Manager deep-link URL format.

import { describe, it, expect } from "vitest";
import { cardFromCell, primaryAdForCell, perfRowsForCell, aggregatePerfStats } from "./creative-assembly";
import { buildAdsManagerAdUrl } from "@/components/creative/AdsManagerLink";
import type { AdRecord, CellPerformanceRow, MST } from "@/lib/data/seedTypes";

const ads: AdRecord[] = [
  { ad_name: "C1A_T1", cell: "C1A", meta_ad_id: null, creative_asset_url: null },
  { ad_name: "C1A_T2", cell: "C1A", meta_ad_id: "120210000000000001", creative_asset_url: null },
  { ad_name: "C1A_T3", cell: "C1A", meta_ad_id: "120210000000000002", creative_asset_url: "https://cdn.example.com/c1a.jpg" },
  { ad_name: "C2B_T1", cell: "C2B", meta_ad_id: null, creative_asset_url: "https://cdn.example.com/c2b.jpg" },
  { ad_name: "C3C_T1", cell: "C3C", meta_ad_id: null, creative_asset_url: null },
];

describe("primaryAdForCell", () => {
  it("prefers the ad with both asset and meta id", () => {
    expect(primaryAdForCell(ads, "C1A")?.ad_name).toBe("C1A_T3");
  });

  it("falls back to an ad with only an asset", () => {
    expect(primaryAdForCell(ads, "C2B")?.ad_name).toBe("C2B_T1");
  });

  it("falls back to an ad with only a meta id", () => {
    const idOnly = ads.filter((a) => !a.creative_asset_url);
    expect(primaryAdForCell(idOnly, "C1A")?.ad_name).toBe("C1A_T2");
  });

  it("returns the name-only row when the cell has no ads with asset or id", () => {
    // The card still shows the ad name; assetUrl/metaAdId stay null so the
    // UI renders a placeholder and a pending Ads Manager link.
    const ad = primaryAdForCell(ads, "C3C");
    expect(ad?.ad_name).toBe("C3C_T1");
    expect(ad?.creative_asset_url).toBeNull();
    expect(ad?.meta_ad_id).toBeNull();
  });

  it("returns null for unknown cells and undefined registries", () => {
    expect(primaryAdForCell(ads, "ZZZ")).toBeNull();
    expect(primaryAdForCell(undefined, "C1A")).toBeNull();
  });

  it("falls back to library mapped_ad_names when no ads row carries the cell", () => {
    // Manual accounts: ads.cell is null until a Meta export backfill, but the
    // MST library knows which ad names belong to the cell.
    const manualAds: AdRecord[] = [
      { ad_name: "Summer Sale v2", cell: null, meta_ad_id: null, creative_asset_url: "https://cdn.example.com/summer.jpg" },
      { ad_name: "Other Ad", cell: null, meta_ad_id: null, creative_asset_url: null },
    ];
    expect(primaryAdForCell(manualAds, "C1A", ["Summer Sale v2"])?.ad_name).toBe("Summer Sale v2");
  });

  it("prefers a direct cell match over the mapped-name fallback", () => {
    expect(primaryAdForCell(ads, "C1A", ["C2B_T1"])?.ad_name).toBe("C1A_T3");
  });

  it("fallback returns the name-only row when mapped names have no asset or id", () => {
    const bare: AdRecord[] = [{ ad_name: "Plain Ad", cell: null, meta_ad_id: null, creative_asset_url: null }];
    const ad = primaryAdForCell(bare, "C1A", ["Plain Ad"]);
    expect(ad?.ad_name).toBe("Plain Ad");
    expect(ad?.creative_asset_url).toBeNull();
    expect(ad?.meta_ad_id).toBeNull();
  });
});

describe("cardFromCell ad wiring", () => {
  it("wires assetUrl, metaAdId, and the Meta account id into the card", () => {
    const card = cardFromCell("C1A", { ads, metaAdAccountId: "1234567890" });
    expect(card.assetUrl).toBe("https://cdn.example.com/c1a.jpg");
    expect(card.metaAdId).toBe("120210000000000002");
    expect(card.adAccountId).toBe("1234567890");
  });

  it("stays honest when nothing is backfilled", () => {
    const card = cardFromCell("C3C", { ads, metaAdAccountId: null });
    expect(card.assetUrl).toBeNull();
    expect(card.metaAdId).toBeNull();
    expect(card.adAccountId).toBeNull();
  });
});

describe("cardFromCell tag propagation", () => {
  const mst: MST = {
    status: "active",
    render_policy: "",
    local_book2_library: [
      {
        cell_id: "C1A",
        concept_id: "C1",
        book2_concept_name: "Concept One",
        mapped_ad_names: [],
        primary_message: "",
        secondary_message: "",
        cta: "",
        visual_system: "",
        tone_variable: "TN_bold",
        funnel_stage_variable: "ST_Lower",
        awareness_variable: "AW_ProblemAware",
        stage: "MOF", // display label — must stay distinct from the registry codes
      },
    ],
    source_artifacts: [],
  };

  it("exposes confirmed funnel_stage/awareness registry codes as tags without touching the display `stage` label", () => {
    const card = cardFromCell("C1A", { ads: [], metaAdAccountId: null, mst });
    expect(card.tags).toContain("ST_Lower");
    expect(card.tags).toContain("AW_ProblemAware");
    expect(card.stage).toBe("MOF");
  });
});

// ─── Resolver collapse regression (Bookster C2B pattern) ──────────────
// performance_by_cell carries one row per Result-type/campaign-flight
// sharing a concept_code, e.g. the same creative flighted first toward
// registrations, then trials, then checkout as three separate campaigns.
// A join that picks only the highest-spend row silently discards the
// other two real rows. See BRIEF_01_resolvercollapsebug.md.
function perfRow(overrides: Partial<CellPerformanceRow> & { "Amount spent (USD)": number }): CellPerformanceRow {
  return {
    cell_id: "C2B",
    "Result type": "Website registrations completed",
    Reach: 0,
    Impressions: 0,
    Results: 0,
    "Clicks (all)": 0,
    "Link clicks": 0,
    CPA_result: null,
    CTR_link_pct: 0,
    Result_per_link_click_pct: 0,
    book2_concept_name: "Time-poor learner product demo",
    ...overrides,
  };
}

const multiRowCell: CellPerformanceRow[] = [
  perfRow({ "Result type": "Website registrations completed", "Amount spent (USD)": 675.81, Results: 74, CTR_link_pct: 1.5031 }),
  perfRow({ "Result type": "Website trials started", "Amount spent (USD)": 441.7, Results: 2, CTR_link_pct: 1.3182 }),
  perfRow({ "Result type": "onb_initiate_checkout", "Amount spent (USD)": 110.92, Results: 0, CTR_link_pct: 1.9307 }),
];

describe("perfRowsForCell", () => {
  it("returns every real row for a cell, not just one", () => {
    expect(perfRowsForCell(multiRowCell, "C2B")).toHaveLength(3);
  });

  it("returns an empty array for a cell with no rows", () => {
    expect(perfRowsForCell(multiRowCell, "C9Z")).toEqual([]);
  });
});

describe("aggregatePerfStats", () => {
  it("sums real spend across every row instead of keeping only the highest-spend one", () => {
    const stats = aggregatePerfStats(multiRowCell);
    expect(stats?.spend).toBeCloseTo(675.81 + 441.7 + 110.92);
  });

  // Regression guard: summing 74 registrations + 2 trials + 0 checkouts into
  // "76 results" and dividing spend by it yields $16.16 — a cost per result
  // that belongs to no ad, campaign, or event. Mixed-event sets must report
  // no single results/CPA number at all.
  it("reports NO results or CPA when rows span different result types", () => {
    const stats = aggregatePerfStats(multiRowCell);
    expect(stats?.results).toBeNull();
    expect(stats?.cpa).toBeNull();
    expect(stats?.resultLabel).toBe("3 events");
  });

  it("sums results and derives CPA when every row shares one result type", () => {
    // Same creative, same event, three separate campaign flights — genuinely additive.
    const sameEvent = [
      perfRow({ "Amount spent (USD)": 100, Results: 10, CTR_link_pct: 2 }),
      perfRow({ "Amount spent (USD)": 200, Results: 15, CTR_link_pct: 1 }),
      perfRow({ "Amount spent (USD)": 300, Results: 25, CTR_link_pct: 3 }),
    ];
    const stats = aggregatePerfStats(sameEvent);
    expect(stats?.spend).toBeCloseTo(600);
    expect(stats?.results).toBe(50);
    expect(stats?.cpa).toBeCloseTo(12);
  });

  it("labels by DISTINCT event count, not row count", () => {
    // 4 rows, 2 distinct events → "2 events" (not "4 events").
    const stats = aggregatePerfStats([
      perfRow({ "Result type": "Website registrations completed", "Amount spent (USD)": 10, Results: 1 }),
      perfRow({ "Result type": "Website registrations completed", "Amount spent (USD)": 20, Results: 2 }),
      perfRow({ "Result type": "Website trials started", "Amount spent (USD)": 30, Results: 3 }),
      perfRow({ "Result type": "Website trials started", "Amount spent (USD)": 40, Results: 4 }),
    ]);
    expect(stats?.resultLabel).toBe("2 events");
  });

  it("takes CTR from the highest-spend row since it isn't additive", () => {
    const stats = aggregatePerfStats(multiRowCell);
    expect(stats?.ctrPct).toBe(1.5031);
  });

  it("labels a single row with its own result type via the label callback", () => {
    const stats = aggregatePerfStats([multiRowCell[0]!], (key) => (key === "Website registrations completed" ? "Registrations" : key));
    expect(stats?.resultLabel).toBe("Registrations");
  });

  it("returns undefined for no rows", () => {
    expect(aggregatePerfStats([])).toBeUndefined();
  });
});

describe("cardFromCell multi-row performance (no silent collapse)", () => {
  it("totals real spend across every row for the cell, without inventing a blended result", () => {
    const card = cardFromCell("C2B", { perfRows: multiRowCell, ads: [], metaAdAccountId: null });
    expect(card.stats?.spend).toBeCloseTo(675.81 + 441.7 + 110.92);
    expect(card.stats?.results).toBeNull();
    expect(card.stats?.cpa).toBeNull();
  });

  it("exposes every real row on the card so detail views can show each one distinctly", () => {
    const card = cardFromCell("C2B", { perfRows: multiRowCell, ads: [], metaAdAccountId: null });
    expect(card.perfRows).toHaveLength(3);
    expect(card.perfRows?.map((r) => r["Result type"])).toEqual([
      "Website registrations completed",
      "Website trials started",
      "onb_initiate_checkout",
    ]);
  });
});

describe("buildAdsManagerAdUrl", () => {
  it("builds the verified Ads Manager deep-link format", () => {
    expect(buildAdsManagerAdUrl("1234567890", "120210000000000002")).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/ads?act=1234567890&selected_ad_ids=120210000000000002"
    );
  });

  it("strips a defensive act_ prefix", () => {
    expect(buildAdsManagerAdUrl("act_1234567890", "9")).toContain("act=1234567890&");
  });
});
