// Spec §3/§4/§6/§10: what each staged file can prove, detected from its
// resolved columns and rows — the same function at staging and at run time.
import { describe, expect, it } from "vitest";
import { parseIapCsv } from "../iapCsvParser";
import {
  ADDITIVE_METRIC_SLUGS,
  NON_ADDITIVE_METRIC_SLUGS,
  adIdentityOf,
  assetContentHash,
  assetTypeForColumn,
  detectReportGrain,
  isAdditiveMetric,
  normalizeAssetValue,
  resolveNameToInstances,
} from "../reportGrain";
import {
  FIXTURE_ACCOUNT_ID,
  FIXTURE_WINDOW,
  buildAdSummaryCsv,
  buildAssetCsv,
  buildDemographicCsv,
  buildPlacementCsv,
} from "./fixtures/reconciliationFixtures";

describe("detectReportGrain", () => {
  it("classifies the tester's original file as demographic_asset — daily, Text-broken-down, 34 Ad IDs", () => {
    const grain = detectReportGrain(parseIapCsv(buildDemographicCsv({ grain: "partial" }), "demographic"), "demographic");
    expect(grain.report_class).toBe("demographic_asset");
    expect(grain.has_day).toBe(true);
    expect(grain.distinct_days).toBe(30);
    expect(grain.aggregate_shape).toBe(false);
    expect(grain.has_ad_id).toBe(true);
    expect(grain.ad_id_joinable).toBe(true);
    expect(grain.ad_id_fill_pct).toBe(100);
    expect(grain.distinct_ad_ids).toBe(34);
    expect(grain.dimensions).toEqual(["Gender", "Age"]);
    expect(grain.asset_columns).toEqual([{ column: "Text", asset_type: "primary_text", role: "breakdown" }]);
    expect(grain.currency).toBe("CAD");
    expect(grain.account_ids).toEqual([FIXTURE_ACCOUNT_ID]);
    expect(grain.period).toEqual({ start: "2026-08-01", end: "2026-08-30" });
  });

  it("classifies the re-export as demographic — whole-period, 44 Ad IDs under 19 reused names", () => {
    const grain = detectReportGrain(parseIapCsv(buildDemographicCsv({ grain: "reconciled" }), "demographic"), "demographic");
    expect(grain.report_class).toBe("demographic");
    expect(grain.has_day).toBe(false);
    expect(grain.aggregate_shape).toBe(true);
    expect(grain.distinct_ad_ids).toBe(44);
    expect(grain.distinct_ad_names).toBe(19);
    expect(grain.reused_ad_names).toBe(19);
    expect(grain.asset_columns).toEqual([]);
    // Period end comes from "Reporting ends", not from the single Day value.
    expect(grain.period).toEqual({ start: FIXTURE_WINDOW.start, end: FIXTURE_WINDOW.end });
    expect(grain.non_additive_metrics).toEqual(["reach"]);
    expect(grain.additive_metrics).toContain("purchases");
    expect(grain.additive_metrics).toContain("website_purchases_conversion_value");
  });

  it("classifies the ad summary by period shape and reports a missing Ad ID honestly", () => {
    const whole = detectReportGrain(parseIapCsv(buildAdSummaryCsv({ withAdId: true }), "ad_summary"), "ad_summary");
    expect(whole.report_class).toBe("ad_summary");
    expect(whole.has_ad_id).toBe(true);
    const daily = detectReportGrain(parseIapCsv(buildAdSummaryCsv({ withAdId: true, daily: true }), "ad_summary"), "ad_summary");
    expect(daily.report_class).toBe("time_series");
    expect(daily.distinct_days).toBe(30);
    const noId = detectReportGrain(parseIapCsv(buildAdSummaryCsv({ withAdId: false }), "ad_summary"), "ad_summary");
    expect(noId.has_ad_id).toBe(false);
    expect(noId.ad_id_joinable).toBe(false);
    expect(noId.distinct_ad_ids).toBe(0);
    expect(noId.distinct_ad_names).toBe(19);
  });

  it("classifies placement and asset-only exports", () => {
    const placement = detectReportGrain(parseIapCsv(buildPlacementCsv({ days: 2 }), "device_placement"), "device_placement");
    expect(placement.report_class).toBe("placement");
    expect(placement.dimensions).toEqual(["Platform", "Placement", "Impression device"]);
    const asset = detectReportGrain(parseIapCsv(buildAssetCsv(), "asset"), "asset");
    expect(asset.report_class).toBe("asset");
    expect(asset.dimensions).toEqual([]);
    expect(asset.asset_columns).toEqual([{ column: "Text", asset_type: "primary_text", role: "breakdown" }]);
  });
});

describe("adIdentityOf / resolveNameToInstances", () => {
  const parsed = parseIapCsv(buildDemographicCsv({ grain: "reconciled" }), "demographic");
  const grain = detectReportGrain(parsed, "demographic");

  it("keys by Ad ID when the file is joinable", () => {
    const id = adIdentityOf(parsed.rows[0]!, grain);
    expect(id.kind).toBe("ad_id");
    expect(id.key).toBe(parsed.rows[0]!.breakdowns["Ad ID"]);
    expect(id.meta_ad_id).toBe(id.key);
  });

  it("falls to NAME grain, never a blind Ad ID, when the column is absent or conflicting", () => {
    const noId = parseIapCsv(buildAdSummaryCsv({ withAdId: false }), "ad_summary");
    const id = adIdentityOf(noId.rows[0]!, detectReportGrain(noId, "ad_summary"));
    expect(id.kind).toBe("ad_name");
    expect(id.meta_ad_id).toBeNull();
    const conflicting = adIdentityOf(parsed.rows[0]!, { ad_id_joinable: false });
    expect(conflicting.kind).toBe("ad_name");
  });

  it("is unjoinable with neither Ad ID nor name", () => {
    const row = { ...parsed.rows[0]!, breakdowns: { ...parsed.rows[0]!.breakdowns, "Ad ID": "", "Ad name": "" } };
    expect(adIdentityOf(row, grain).kind).toBe("unjoinable");
  });

  it("resolves a name to an instance only when the registry proves it unique", () => {
    const registry = new Map<string, string[]>([
      ["Unique_Ad", ["1"]],
      ["Reused_Ad", ["2", "3"]],
    ]);
    expect(resolveNameToInstances("Unique_Ad", registry)).toEqual({ meta_ad_id: "1", instances: 1 });
    expect(resolveNameToInstances("Reused_Ad", registry)).toEqual({ meta_ad_id: null, instances: 2 });
    expect(resolveNameToInstances("Unknown", registry)).toEqual({ meta_ad_id: null, instances: 0 });
  });
});

describe("metric additivity", () => {
  it("declares reach, frequency and unique metrics non-additive and everything countable additive", () => {
    for (const slug of ["reach", "frequency", "unique_clicks_all", "unique_outbound_clicks"]) {
      expect(NON_ADDITIVE_METRIC_SLUGS.has(slug)).toBe(true);
      expect(isAdditiveMetric(slug)).toBe(false);
    }
    for (const slug of ["amount_spent", "impressions", "link_clicks", "purchases", "leads", "app_installs", "thruplays"]) {
      expect(ADDITIVE_METRIC_SLUGS).toContain(slug);
    }
    // Pre-divided ratios and string columns are neither.
    expect(isAdditiveMetric("ctr_all")).toBe(false);
    expect(isAdditiveMetric("cpm_cost_per_1_000_impressions")).toBe(false);
    expect(isAdditiveMetric("result_type")).toBe(false);
  });
});

describe("asset identity", () => {
  it("maps delivered breakdown headers to asset types case-insensitively and rejects unknown ones", () => {
    expect(assetTypeForColumn("Text")).toBe("primary_text");
    expect(assetTypeForColumn("headline")).toBe("headline");
    expect(assetTypeForColumn("Image, video and slideshow")).toBe("media");
    expect(assetTypeForColumn("Gender")).toBeNull();
  });

  it("normalizes copy without changing case, and media/CTA/link values to lower case", () => {
    expect(normalizeAssetValue("headline", "  Vet-formulated\n fresh  food ")).toBe("Vet-formulated fresh food");
    expect(normalizeAssetValue("headline", "VET-FORMULATED")).not.toBe(normalizeAssetValue("headline", "vet-formulated"));
    expect(normalizeAssetValue("image", "C8A_Hero.PNG")).toBe("c8a_hero.png");
    expect(normalizeAssetValue("cta_type", "Shop_Now")).toBe("shop_now");
  });

  it("hashes the same content to the same identity and distinguishes asset types", () => {
    const a = assetContentHash("primary_text", "Real meat first.");
    expect(a).toBe(assetContentHash("primary_text", "Real meat first."));
    expect(a).not.toBe(assetContentHash("headline", "Real meat first."));
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });
});
