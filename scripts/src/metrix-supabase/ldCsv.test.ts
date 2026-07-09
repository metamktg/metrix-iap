// Unit tests for the LittleData CSV parsing + reconciliation layer
// (ldCsv.ts) — pure functions, no Supabase connection needed. These are
// the checks that stand between a malformed/drifted Meta CSV export and
// wrong spend/purchase numbers landing in the app.

import { describe, expect, it } from "vitest";

import {
  parseCsv,
  parseLdDemoCsv,
  parseLdDeviceCsv,
  summarizeLdDemoAds,
  summarizeLdDeviceCsv,
  verifyLdDemoReconciliation,
  verifyLdDeviceReconciliation,
  type LdDemoTotals,
} from "./ldCsv";

// ═══ parseCsv — low-level CSV grammar ═══════════════════════════════════

describe("parseCsv", () => {
  it("splits simple rows and fields", () => {
    expect(parseCsv("a,b,c\nd,e,f")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,"Hello, world",x')).toEqual([["name", "Hello, world", "x"]]);
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    expect(parseCsv('"She said ""hi""",2')).toEqual([['She said "hi"', "2"]]);
  });

  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('"line1\nline2",x')).toEqual([["line1\nline2", "x"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips fully empty rows", () => {
    expect(parseCsv("a,b\n\n,,\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a final row without a trailing newline", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

// ═══ Demo CSV fixture ═══════════════════════════════════════════════════

const DEMO_HEADER =
  "Campaign name,Ad set name,Ad name,Ad ID,Day,Gender,Age,Impressions,Results," +
  "Amount spent (USD),Link clicks,Clicks (all),Adds to cart,Checkouts initiated," +
  "Purchases,Purchases conversion value,Attribution setting";

interface DemoRow {
  campaign?: string;
  adSet?: string;
  adName: string;
  adId?: string;
  day?: string;
  gender?: string;
  age?: string;
  impressions?: number;
  results?: number;
  spend?: number;
  linkClicks?: number;
  clicksAll?: number;
  atc?: number;
  checkouts?: number;
  purchases?: number;
  purchaseValue?: number;
  attribution?: string;
}

const demoRow = (r: DemoRow): string =>
  [
    r.campaign ?? "Camp A", r.adSet ?? "Set A", r.adName, r.adId ?? "111",
    r.day ?? "2026-07-01", r.gender ?? "female", r.age ?? "25-34",
    r.impressions ?? 0, r.results ?? 0, r.spend ?? 0, r.linkClicks ?? 0,
    r.clicksAll ?? 0, r.atc ?? 0, r.checkouts ?? 0, r.purchases ?? 0,
    r.purchaseValue ?? 0, r.attribution ?? "7-day click or 1-day view",
  ].join(",");

const demoCsv = (rows: DemoRow[]): string => [DEMO_HEADER, ...rows.map(demoRow)].join("\n");

describe("parseLdDemoCsv", () => {
  it("aggregates per ad across days and segments", () => {
    const csv = parseLdDemoCsv(demoCsv([
      { adName: "Ad One", day: "2026-07-01", gender: "female", age: "25-34", spend: 10.5, impressions: 1000, results: 2, purchases: 2, linkClicks: 30, clicksAll: 40, atc: 8, checkouts: 4, purchaseValue: 80.25 },
      { adName: "Ad One", day: "2026-07-02", gender: "male", age: "35-44", spend: 4.5, impressions: 500, results: 1, purchases: 1, linkClicks: 10, clicksAll: 12, atc: 2, checkouts: 1, purchaseValue: 19.75 },
      { adName: "Ad Two", day: "2026-06-30", gender: "female", age: "25-34", spend: 5, impressions: 200, results: 0, purchases: 0, linkClicks: 5, clicksAll: 6, atc: 1, checkouts: 0, purchaseValue: 0 },
    ]));
    expect(csv.rowCount).toBe(3);
    expect(csv.ads.size).toBe(2);
    const adOne = csv.ads.get("Ad One")!;
    expect(adOne.spend).toBeCloseTo(15, 10);
    expect(adOne.impressions).toBe(1500);
    expect(adOne.results).toBe(3);
    expect(adOne.purchases).toBe(3);
    expect(adOne.linkClicks).toBe(40);
    expect(adOne.clicksAll).toBe(52);
    expect(adOne.addsToCart).toBe(10);
    expect(adOne.checkoutsInitiated).toBe(5);
    expect(adOne.purchaseValue).toBeCloseTo(100, 10);
    expect(csv.dayRange).toEqual({ first: "2026-06-30", last: "2026-07-02" });
  });

  it("parses quoted ad and campaign names containing commas", () => {
    const raw = [
      DEMO_HEADER,
      '"Camp, with comma","Set ""quoted""","Ad, One",111,2026-07-01,female,25-34,100,1,2.5,3,4,1,1,1,10,"7-day click"',
    ].join("\n");
    const csv = parseLdDemoCsv(raw);
    expect(csv.ads.has("Ad, One")).toBe(true);
    const ad = csv.ads.get("Ad, One")!;
    expect([...ad.campaigns]).toEqual(["Camp, with comma"]);
    expect([...ad.adSets]).toEqual(['Set "quoted"']);
    expect(ad.spend).toBe(2.5);
  });

  it("strips a UTF-8 BOM before the header", () => {
    const csv = parseLdDemoCsv("\uFEFF" + demoCsv([{ adName: "Ad One", spend: 1 }]));
    expect(csv.ads.has("Ad One")).toBe(true);
  });

  it("builds per-segment aggregates at ad and account level", () => {
    const csv = parseLdDemoCsv(demoCsv([
      { adName: "Ad One", gender: "female", age: "25-34", spend: 10, purchases: 1, results: 1 },
      { adName: "Ad Two", gender: "female", age: "25-34", spend: 6, purchases: 2, results: 2 },
      { adName: "Ad Two", gender: "male", age: "45-54", spend: 4, purchases: 0, results: 0 },
    ]));
    expect(csv.accountSegments.size).toBe(2);
    const acctSeg = csv.accountSegments.get("female|25-34")!;
    expect(acctSeg.spend).toBe(16);
    expect(acctSeg.purchases).toBe(3);
    const adTwoSeg = csv.ads.get("Ad Two")!.segments.get("female|25-34")!;
    expect(adTwoSeg.spend).toBe(6);
    expect(adTwoSeg.purchases).toBe(2);
  });

  it("collects ad ids, campaigns, ad sets and the attribution spend split", () => {
    const csv = parseLdDemoCsv(demoCsv([
      { adName: "Reused", adId: "111", campaign: "Camp A", adSet: "Set A", spend: 3, attribution: "7-day click" },
      { adName: "Reused", adId: "222", campaign: "Camp B", adSet: "Set B", spend: 7, attribution: "1-day view" },
    ]));
    const ad = csv.ads.get("Reused")!;
    expect([...ad.adIds].sort()).toEqual(["111", "222"]);
    expect([...ad.campaigns].sort()).toEqual(["Camp A", "Camp B"]);
    expect([...ad.adSets].sort()).toEqual(["Set A", "Set B"]);
    expect(csv.spendByAttribution.get("7-day click")).toBe(3);
    expect(csv.spendByAttribution.get("1-day view")).toBe(7);
  });

  it("skips rows without an ad name and defaults blank gender/age", () => {
    const raw = [
      DEMO_HEADER,
      demoRow({ adName: "Ad One", gender: "", age: "", spend: 5 }).replace(",female,", ",,"),
      // totals-style row with no ad name — must be ignored
      "Camp A,Set A,,,2026-07-01,female,25-34,999999,999,99999,0,0,0,0,999,0,7-day click",
    ].join("\n");
    const csv = parseLdDemoCsv(raw);
    expect(csv.rowCount).toBe(1);
    expect(csv.ads.size).toBe(1);
    expect(csv.accountSegments.has("unknown|Unknown")).toBe(true);
  });

  it("fails loudly when an expected column is missing (old-format export)", () => {
    const oldHeader = DEMO_HEADER.replace(",Link clicks", "");
    expect(() => parseLdDemoCsv([oldHeader].join("\n"))).toThrow(/missing expected column "Link clicks"/);
  });
});

// ═══ summarize + demo reconciliation ════════════════════════════════════

const matchedTotalsFixture = () => {
  const csv = parseLdDemoCsv(demoCsv([
    { adName: "Ad One", spend: 10.005, impressions: 1000, results: 2, purchases: 2, linkClicks: 30, clicksAll: 40, atc: 8, checkouts: 4, purchaseValue: 80.201 },
    { adName: "Ad Two", spend: 5.004, impressions: 500, results: 1, purchases: 1, linkClicks: 10, clicksAll: 12, atc: 2, checkouts: 1, purchaseValue: 19.802 },
  ]));
  const csvTotals = summarizeLdDemoAds(csv.ads.values());
  const accountTotals = {
    spend: 15.01, impressions: 1500, purchases: 3,
    link_clicks: 40, add_to_cart: 10, initiate_checkout: 5, revenue: 100.0,
  };
  return { csv, csvTotals, accountTotals };
};

describe("summarizeLdDemoAds", () => {
  it("sums exactly across ads and rounds money once at the total", () => {
    const { csvTotals } = matchedTotalsFixture();
    expect(csvTotals).toEqual({
      spend: 15.01, impressions: 1500, results: 3, linkClicks: 40, clicksAll: 52,
      addsToCart: 10, checkoutsInitiated: 5, purchases: 3, purchaseValue: 100.0,
    });
  });
});

describe("verifyLdDemoReconciliation", () => {
  it("passes when CSV sums match the account totals", () => {
    const { csvTotals, accountTotals } = matchedTotalsFixture();
    expect(() => verifyLdDemoReconciliation(csvTotals, accountTotals)).not.toThrow();
  });

  it("tolerates sub-cent float noise on spend/revenue", () => {
    const { csvTotals, accountTotals } = matchedTotalsFixture();
    accountTotals.spend = 15.005;
    accountTotals.revenue = 100.005;
    expect(() => verifyLdDemoReconciliation(csvTotals, accountTotals)).not.toThrow();
  });

  it("throws on spend drift beyond a cent", () => {
    const { csvTotals, accountTotals } = matchedTotalsFixture();
    accountTotals.spend = 15.5;
    expect(() => verifyLdDemoReconciliation(csvTotals, accountTotals)).toThrow(/does not reconcile with account_totals/);
  });

  it("throws on impressions drift", () => {
    const { csvTotals, accountTotals } = matchedTotalsFixture();
    accountTotals.impressions = 1501;
    expect(() => verifyLdDemoReconciliation(csvTotals, accountTotals)).toThrow(/does not reconcile with account_totals/);
  });

  it("throws on purchases drift", () => {
    const { csvTotals, accountTotals } = matchedTotalsFixture();
    accountTotals.purchases = 4;
    expect(() => verifyLdDemoReconciliation(csvTotals, accountTotals)).toThrow(/does not reconcile with account_totals/);
  });

  it("throws when funnel columns drift (link clicks / ATC / IC / revenue)", () => {
    for (const patch of [
      { link_clicks: 41 },
      { add_to_cart: 11 },
      { initiate_checkout: 6 },
      { revenue: 101.0 },
    ]) {
      const { csvTotals, accountTotals } = matchedTotalsFixture();
      Object.assign(accountTotals, patch);
      expect(() => verifyLdDemoReconciliation(csvTotals, accountTotals)).toThrow(/funnel columns do not reconcile/);
    }
  });

  it("throws when Results and Purchases columns disagree internally", () => {
    const csv = parseLdDemoCsv(demoCsv([
      // Results says 3 purchases, Purchases column says 2 — internal drift.
      { adName: "Ad One", spend: 10, impressions: 100, results: 3, purchases: 2, linkClicks: 1, atc: 1, checkouts: 1, purchaseValue: 50 },
    ]));
    const csvTotals = summarizeLdDemoAds(csv.ads.values());
    const accountTotals = {
      spend: 10, impressions: 100, purchases: 3,
      link_clicks: 1, add_to_cart: 1, initiate_checkout: 1, revenue: 50,
    };
    expect(() => verifyLdDemoReconciliation(csvTotals, accountTotals)).toThrow(/Results sum 3 vs Purchases column sum 2/);
  });

  it("throws when account totals are absent entirely (never import unverified)", () => {
    const { csvTotals } = matchedTotalsFixture();
    expect(() => verifyLdDemoReconciliation(csvTotals, undefined)).toThrow(/does not reconcile with account_totals/);
  });
});

// ═══ Device CSV fixture ═════════════════════════════════════════════════

const DEVICE_HEADER =
  "Platform,Placement,Conversion device,Link clicks,Adds to cart,Checkouts initiated," +
  "Purchases,Purchases conversion value,Amount spent (USD),Impressions,Reporting starts,Reporting ends";

interface DeviceRow {
  platform: string;
  placement?: string;
  device?: string;
  linkClicks?: number;
  atc?: number;
  checkouts?: number;
  purchases?: number;
  purchaseValue?: number;
  spend?: string | number;
  impressions?: string | number;
  start?: string;
  end?: string;
}

const deviceRow = (r: DeviceRow): string =>
  [
    r.platform, r.placement ?? "Feed", r.device ?? "iPhone", r.linkClicks ?? 0,
    r.atc ?? 0, r.checkouts ?? 0, r.purchases ?? 0, r.purchaseValue ?? 0,
    r.spend ?? "", r.impressions ?? "", r.start ?? "2026-01-01", r.end ?? "2026-07-09",
  ].join(",");

const deviceCsvRaw = (rows: DeviceRow[]): string => [DEVICE_HEADER, ...rows.map(deviceRow)].join("\n");

describe("parseLdDeviceCsv", () => {
  it("aggregates funnel actions by conversion device, platform, and placement", () => {
    const parsed = parseLdDeviceCsv(deviceCsvRaw([
      { platform: "Instagram", placement: "Feed", device: "iPhone", purchases: 2, checkouts: 3, linkClicks: 10, atc: 4, purchaseValue: 40 },
      { platform: "Instagram", placement: "Stories", device: "iPhone", purchases: 1, checkouts: 1, linkClicks: 5, atc: 1, purchaseValue: 20 },
      { platform: "Facebook", placement: "Feed", device: "Desktop", purchases: 1, checkouts: 2, linkClicks: 8, atc: 2, purchaseValue: 30 },
    ]));
    expect(parsed.rowCount).toBe(3);
    expect(parsed.devices.get("iPhone")!.purchases).toBe(3);
    expect(parsed.devices.get("Desktop")!.purchases).toBe(1);
    expect(parsed.platforms.get("Instagram")!.linkClicks).toBe(15);
    expect(parsed.placements.get("Feed")!.checkoutsInitiated).toBe(5);
    expect(parsed.placements.get("Feed")!.purchaseValue).toBe(70);
  });

  it("normalizes Meta's '0' conversion device to 'unknown'", () => {
    const parsed = parseLdDeviceCsv(deviceCsvRaw([
      { platform: "Instagram", device: "0", purchases: 1 },
      { platform: "Instagram", device: "", purchases: 1 },
    ]));
    expect(parsed.devices.size).toBe(1);
    expect(parsed.devices.get("unknown")!.purchases).toBe(2);
  });

  it("computes the min/max reporting window and skips platform-less rows", () => {
    const parsed = parseLdDeviceCsv(deviceCsvRaw([
      { platform: "Instagram", start: "2026-02-01", end: "2026-06-01" },
      { platform: "Facebook", start: "2026-01-15", end: "2026-07-01" },
      { platform: "", purchases: 99 },
    ]));
    expect(parsed.rowCount).toBe(2);
    expect(parsed.window).toEqual({ start: "2026-01-15", end: "2026-07-01" });
  });

  it("throws when delivery metrics appear (export semantics changed)", () => {
    expect(() => parseLdDeviceCsv(deviceCsvRaw([
      { platform: "Instagram", spend: 12.34, impressions: 100, purchases: 1 },
    ]))).toThrow(/carries delivery metrics/);
  });

  it("fails loudly when an expected column is missing", () => {
    const badHeader = DEVICE_HEADER.replace("Conversion device", "Impression device");
    expect(() => parseLdDeviceCsv(badHeader)).toThrow(/missing expected column "Conversion device"/);
  });
});

// ═══ Device reconciliation ══════════════════════════════════════════════

const demoTotals = (purchases: number, checkouts: number): LdDemoTotals => ({
  spend: 0, impressions: 0, results: purchases, linkClicks: 0, clicksAll: 0,
  addsToCart: 0, checkoutsInitiated: checkouts, purchases, purchaseValue: 0,
});

describe("verifyLdDeviceReconciliation", () => {
  it("passes when device purchases + checkouts match the demographic export", () => {
    const parsed = parseLdDeviceCsv(deviceCsvRaw([
      { platform: "Instagram", device: "iPhone", purchases: 2, checkouts: 3, linkClicks: 100 },
      { platform: "Facebook", device: "Desktop", purchases: 1, checkouts: 2, linkClicks: 200 },
    ]));
    const totals = summarizeLdDeviceCsv(parsed);
    expect(totals).toEqual({ purchases: 3, checkoutsInitiated: 5, linkClicks: 300 });
    expect(() => verifyLdDeviceReconciliation(totals, demoTotals(3, 5))).not.toThrow();
  });

  it("throws on purchase drift between device and demographic exports", () => {
    const totals = { purchases: 4, checkoutsInitiated: 5, linkClicks: 0 };
    expect(() => verifyLdDeviceReconciliation(totals, demoTotals(3, 5))).toThrow(/does not reconcile with the demographic export/);
  });

  it("throws on checkout drift between device and demographic exports", () => {
    const totals = { purchases: 3, checkoutsInitiated: 6, linkClicks: 0 };
    expect(() => verifyLdDeviceReconciliation(totals, demoTotals(3, 5))).toThrow(/does not reconcile with the demographic export/);
  });

  it("does NOT assert link clicks (wider device reporting window is expected)", () => {
    const totals = { purchases: 3, checkoutsInitiated: 5, linkClicks: 9999 };
    expect(() => verifyLdDeviceReconciliation(totals, demoTotals(3, 5))).not.toThrow();
  });
});
