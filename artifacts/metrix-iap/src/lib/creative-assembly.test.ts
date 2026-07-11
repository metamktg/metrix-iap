// ─── Creative assembly + Ads Manager link tests ───────────────────────
// Covers the ad-registry resolution added for the Meta backfill pipeline:
// primary-ad preference order per cell, card wiring of assetUrl/metaAdId/
// adAccountId, and the Ads Manager deep-link URL format.

import { describe, it, expect } from "vitest";
import { cardFromCell, primaryAdForCell } from "./creative-assembly";
import { buildAdsManagerAdUrl } from "@/components/creative/AdsManagerLink";
import type { AdRecord } from "@/lib/data/seedTypes";

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

  it("returns null when the cell has no ads with asset or id", () => {
    expect(primaryAdForCell(ads, "C3C")).toBeNull();
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

  it("fallback still returns null when mapped names have no asset or id", () => {
    const bare: AdRecord[] = [{ ad_name: "Plain Ad", cell: null, meta_ad_id: null, creative_asset_url: null }];
    expect(primaryAdForCell(bare, "C1A", ["Plain Ad"])).toBeNull();
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
