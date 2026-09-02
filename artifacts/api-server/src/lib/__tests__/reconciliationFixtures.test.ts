// The fixtures are a claim about the validated exports (spec §1); this suite
// proves the claim before any test relies on it. If a number here drifts, the
// acceptance tests downstream are testing the wrong world.
import { describe, expect, it } from "vitest";
import { parseIapCsv } from "../iapCsvParser";
import {
  ACCOUNT_TRUTH,
  PARTIAL_OBSERVED,
  allocate,
  buildAdSummaryCsv,
  buildAssetCsv,
  buildDemographicCsv,
  buildPlacementCsv,
  fixtureAds,
  fixtureTruth,
  partialTruth,
} from "./fixtures/reconciliationFixtures";

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const spendCents = (rows: { base: Record<string, unknown> }[]): number =>
  Math.round(sum(rows.map((r) => (r.base["amount_spent"] as number | null) ?? 0)) * 100);
const metric = (rows: { base: Record<string, unknown>; extra: Record<string, unknown> }[], slug: string): number =>
  sum(rows.map((r) => ((r.base[slug] ?? r.extra[slug]) as number | null) ?? 0));

describe("allocate", () => {
  it("sums exactly to the total by largest remainder", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(sum(parts)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });
  it("gives zero weights zero", () => {
    expect(allocate(10, [0, 5, 0])).toEqual([0, 10, 0]);
  });
});

describe("fixture account", () => {
  it("has 44 Ad IDs under 19 reused names, ten of them absent from the partial export", () => {
    const ads = fixtureAds();
    expect(ads).toHaveLength(44);
    expect(new Set(ads.map((a) => a.adId)).size).toBe(44);
    expect(new Set(ads.map((a) => a.adName)).size).toBe(19);
    expect(ads.filter((a) => a.omittedFromPartial)).toHaveLength(10);
  });

  it("per-ad truth sums to the account totals and the omitted ads to 483.14", () => {
    const truth = fixtureTruth();
    const ads = fixtureAds();
    expect(sum([...truth.values()].map((t) => t.spendCents))).toBe(ACCOUNT_TRUTH.spendCents);
    expect(sum([...truth.values()].map((t) => t.impressions))).toBe(ACCOUNT_TRUTH.impressions);
    expect(sum([...truth.values()].map((t) => t.linkClicks))).toBe(ACCOUNT_TRUTH.linkClicks);
    expect(sum([...truth.values()].map((t) => t.purchases))).toBe(ACCOUNT_TRUTH.purchases);
    const omitted = ads.filter((a) => a.omittedFromPartial).map((a) => truth.get(a.adId)!.spendCents);
    expect(sum(omitted)).toBe(PARTIAL_OBSERVED.omittedAdsSpendCents);
  });

  it("partial per-ad observed never exceeds truth and under-reports 1,276.73 within present ads", () => {
    const truth = fixtureTruth();
    const partial = partialTruth();
    let under = 0;
    for (const [adId, p] of partial) {
      const t = truth.get(adId)!;
      expect(p.spendCents).toBeLessThanOrEqual(t.spendCents);
      under += t.spendCents - p.spendCents;
    }
    expect(under).toBe(PARTIAL_OBSERVED.underReportedWithinPresentCents);
  });
});

describe("reconciled demographic export (Ad ID × Age × Gender × period)", () => {
  const parsed = parseIapCsv(buildDemographicCsv({ grain: "reconciled" }), "demographic");

  it("has 643 rows, 44 Ad IDs, zero duplicate Ad ID × Age × Gender keys", () => {
    expect(parsed.rows).toHaveLength(643);
    expect(new Set(parsed.rows.map((r) => r.breakdowns["Ad ID"])).size).toBe(44);
    const keys = new Set(parsed.rows.map((r) => `${r.breakdowns["Ad ID"]}|${r.breakdowns["Age"]}|${r.breakdowns["Gender"]}`));
    expect(keys.size).toBe(643);
  });

  it("sums to 4,405.61 and every additive metric matches the totals row", () => {
    expect(spendCents(parsed.rows)).toBe(ACCOUNT_TRUTH.spendCents);
    expect(metric(parsed.rows, "impressions")).toBe(ACCOUNT_TRUTH.impressions);
    expect(metric(parsed.rows, "clicks_all")).toBe(ACCOUNT_TRUTH.clicksAll);
    expect(metric(parsed.rows, "link_clicks")).toBe(ACCOUNT_TRUTH.linkClicks);
    expect(metric(parsed.rows, "landing_page_views")).toBe(ACCOUNT_TRUTH.landingPageViews);
    expect(metric(parsed.rows, "adds_to_cart")).toBe(ACCOUNT_TRUTH.addsToCart);
    expect(metric(parsed.rows, "checkouts_initiated")).toBe(ACCOUNT_TRUTH.checkouts);
    expect(metric(parsed.rows, "purchases")).toBe(ACCOUNT_TRUTH.purchases);
    expect(Math.round(metric(parsed.rows, "website_purchases_conversion_value") * 100)).toBe(ACCOUNT_TRUTH.purchaseValueCents);
    // Meta's totals row agrees with the rows, so the parser's own cross-check is silent.
    expect(parsed.warnings.some((w) => /totals row/i.test(w))).toBe(false);
  });

  it("reads the currency from the spend header", () => {
    expect(parsed.currency).toBe("CAD");
  });
});

describe("partial demographic export (Day × Ad ID × Age × Gender × Text)", () => {
  const parsed = parseIapCsv(buildDemographicCsv({ grain: "partial" }), "demographic");

  it("has 5,997 rows over 34 Ad IDs", () => {
    expect(parsed.rows).toHaveLength(PARTIAL_OBSERVED.rows);
    expect(new Set(parsed.rows.map((r) => r.breakdowns["Ad ID"])).size).toBe(PARTIAL_OBSERVED.ads);
  });

  it("observes 2,645.74 against a 4,405.61 totals row, and each metric at its own coverage", () => {
    expect(spendCents(parsed.rows)).toBe(PARTIAL_OBSERVED.spendCents);
    expect(metric(parsed.rows, "impressions")).toBe(PARTIAL_OBSERVED.impressions);
    expect(metric(parsed.rows, "link_clicks")).toBe(PARTIAL_OBSERVED.linkClicks);
    expect(metric(parsed.rows, "purchases")).toBe(PARTIAL_OBSERVED.purchases);
    const pct = (a: number, b: number): number => Math.round((a / b) * 10000) / 100;
    expect(pct(PARTIAL_OBSERVED.spendCents, ACCOUNT_TRUTH.spendCents)).toBe(60.05);
    expect(pct(PARTIAL_OBSERVED.impressions, ACCOUNT_TRUTH.impressions)).toBe(32.36);
    expect(pct(PARTIAL_OBSERVED.linkClicks, ACCOUNT_TRUTH.linkClicks)).toBe(57.11);
    expect(pct(PARTIAL_OBSERVED.purchases, ACCOUNT_TRUTH.purchases)).toBe(77.78);
    // The parser's totals cross-check fires, in the file's own currency.
    const spendWarning = parsed.warnings.find((w) => /totals row/i.test(w) && /amount spent/i.test(w));
    expect(spendWarning).toContain("Amount spent (CAD) = 4,405.61");
    expect(spendWarning).toContain("2,645.74");
  });

  it("carries the Text breakdown as a delivered asset column on every row", () => {
    expect(parsed.rows.every((r) => r.assetBreakdowns?.["Text"])).toBe(true);
  });
});

describe("companion exports", () => {
  it("ad summary with Ad ID: 44 rows summing to truth; without: 19 name rows", () => {
    const withId = parseIapCsv(buildAdSummaryCsv({ withAdId: true }), "ad_summary");
    expect(withId.rows).toHaveLength(44);
    expect(spendCents(withId.rows)).toBe(ACCOUNT_TRUTH.spendCents);
    expect(withId.rows[0]!.creativeMetadata?.["Ad creative body text"]).toBeTruthy();
    const noId = parseIapCsv(buildAdSummaryCsv({ withAdId: false }), "ad_summary");
    expect(noId.rows).toHaveLength(19);
    expect(spendCents(noId.rows)).toBe(ACCOUNT_TRUTH.spendCents);
    expect(noId.rows.every((r) => !r.breakdowns["Ad ID"])).toBe(true);
  });

  it("placement export sums to truth across days and combos", () => {
    const parsed = parseIapCsv(buildPlacementCsv({ days: 3 }), "device_placement");
    expect(parsed.rows).toHaveLength(44 * 3 * 6);
    expect(spendCents(parsed.rows)).toBe(ACCOUNT_TRUTH.spendCents);
    expect(metric(parsed.rows, "purchases")).toBe(ACCOUNT_TRUTH.purchases);
  });

  it("asset export (Ad ID × Text) sums to truth and reuses texts across ads", () => {
    const parsed = parseIapCsv(buildAssetCsv(), "asset");
    expect(parsed.rows).toHaveLength(88);
    expect(spendCents(parsed.rows)).toBe(ACCOUNT_TRUTH.spendCents);
    const texts = new Set(parsed.rows.map((r) => r.assetBreakdowns?.["Text"]));
    expect(texts.size).toBe(5);
  });
});
