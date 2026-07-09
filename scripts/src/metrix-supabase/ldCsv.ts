// ── LittleData manual-upload CSV parsing + reconciliation ──────────────
// Pure parsing/aggregation of the IAP-DEMO and IAP-DEVICE CSV exports and
// the reconciliation checks the importer runs before writing anything:
//   • demo CSV sums must match the package's authoritative account_totals
//     (spend / impressions / purchases AND the funnel columns)
//   • the Results column (result type "Website purchases") must agree with
//     the Purchases column internally
//   • the device CSV's purchases/checkouts must match the demographic
//     export, and it must carry NO delivery metrics (conversion tracking)
// All rules live here so they can be unit tested without a live Supabase
// connection (see ldCsv.test.ts); import.ts only wires file IO + logging.

export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;

export interface LdSegmentAgg {
  gender: string;
  age: string;
  spend: number;
  impressions: number;
  results: number;
  linkClicks: number;
  clicksAll: number;
  addsToCart: number;
  checkoutsInitiated: number;
  purchases: number;
  purchaseValue: number;
}

export interface LdCsvAdAgg {
  adName: string;
  spend: number;
  impressions: number;
  results: number;
  linkClicks: number;
  clicksAll: number;
  addsToCart: number;
  checkoutsInitiated: number;
  purchases: number;
  purchaseValue: number;
  adIds: Set<string>;
  campaigns: Set<string>;
  adSets: Set<string>;
  segments: Map<string, LdSegmentAgg>;
}

export interface LdDemoCsv {
  ads: Map<string, LdCsvAdAgg>;
  accountSegments: Map<string, LdSegmentAgg>;
  rowCount: number;
  dayRange: { first: string; last: string };
  spendByAttribution: Map<string, number>;
}

// Parse the manually uploaded IAP-DEMO CSV (ad × day × gender × age ×
// primary-text rows; the 2026-07-09 re-export added funnel columns) into
// per-ad and per-segment aggregates. Returns exact sums — the caller
// asserts them against the package's authoritative account totals.
export function parseLdDemoCsv(raw: string): LdDemoCsv {
  const table = parseCsv(raw.replace(/^\uFEFF/, ""));
  const header = table[0];
  const col = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`LittleData demo CSV missing expected column "${name}"`);
    return idx;
  };
  const cCampaign = col("Campaign name");
  const cAdSet = col("Ad set name");
  const cAdName = col("Ad name");
  const cAdId = col("Ad ID");
  const cDay = col("Day");
  const cGender = col("Gender");
  const cAge = col("Age");
  const cImpressions = col("Impressions");
  const cResults = col("Results");
  const cSpend = col("Amount spent (USD)");
  // Funnel columns (present since the 2026-07-09 re-export — their
  // absence means an old-format file landed: fail loudly via col()).
  const cLinkClicks = col("Link clicks");
  const cClicksAll = col("Clicks (all)");
  const cAtc = col("Adds to cart");
  const cCheckouts = col("Checkouts initiated");
  const cPurchases = col("Purchases");
  const cPurchValue = col("Purchases conversion value");
  const cAttribution = col("Attribution setting");

  const ads = new Map<string, LdCsvAdAgg>();
  const accountSegments = new Map<string, LdSegmentAgg>();
  const spendByAttribution = new Map<string, number>();
  let rowCount = 0;
  let first = "";
  let last = "";
  for (const row of table.slice(1)) {
    const adName = row[cAdName]?.trim();
    if (!adName) continue;
    rowCount++;
    const day = row[cDay] ?? "";
    if (!first || day < first) first = day;
    if (!last || day > last) last = day;
    const gender = row[cGender] || "unknown";
    const age = row[cAge] || "Unknown";
    const spend = Number(row[cSpend] || 0);
    const impressions = Number(row[cImpressions] || 0);
    const results = Number(row[cResults] || 0);
    const linkClicks = Number(row[cLinkClicks] || 0);
    const clicksAll = Number(row[cClicksAll] || 0);
    const addsToCart = Number(row[cAtc] || 0);
    const checkoutsInitiated = Number(row[cCheckouts] || 0);
    const purchases = Number(row[cPurchases] || 0);
    const purchaseValue = Number(row[cPurchValue] || 0);
    const attribution = row[cAttribution]?.trim() || "unknown";
    spendByAttribution.set(attribution, (spendByAttribution.get(attribution) ?? 0) + spend);

    let ad = ads.get(adName);
    if (!ad) {
      ad = {
        adName, spend: 0, impressions: 0, results: 0,
        linkClicks: 0, clicksAll: 0, addsToCart: 0, checkoutsInitiated: 0, purchases: 0, purchaseValue: 0,
        adIds: new Set(), campaigns: new Set(), adSets: new Set(), segments: new Map(),
      };
      ads.set(adName, ad);
    }
    ad.spend += spend;
    ad.impressions += impressions;
    ad.results += results;
    ad.linkClicks += linkClicks;
    ad.clicksAll += clicksAll;
    ad.addsToCart += addsToCart;
    ad.checkoutsInitiated += checkoutsInitiated;
    ad.purchases += purchases;
    ad.purchaseValue += purchaseValue;
    if (row[cAdId]) ad.adIds.add(row[cAdId]);
    if (row[cCampaign]) ad.campaigns.add(row[cCampaign]);
    if (row[cAdSet]) ad.adSets.add(row[cAdSet]);

    const segKey = `${gender}|${age}`;
    for (const bucket of [ad.segments, accountSegments]) {
      let seg = bucket.get(segKey);
      if (!seg) {
        seg = {
          gender, age, spend: 0, impressions: 0, results: 0,
          linkClicks: 0, clicksAll: 0, addsToCart: 0, checkoutsInitiated: 0, purchases: 0, purchaseValue: 0,
        };
        bucket.set(segKey, seg);
      }
      seg.spend += spend;
      seg.impressions += impressions;
      seg.results += results;
      seg.linkClicks += linkClicks;
      seg.clicksAll += clicksAll;
      seg.addsToCart += addsToCart;
      seg.checkoutsInitiated += checkoutsInitiated;
      seg.purchases += purchases;
      seg.purchaseValue += purchaseValue;
    }
  }
  return { ads, accountSegments, rowCount, dayRange: { first, last }, spendByAttribution };
}

export interface LdConversionAgg {
  key: string;
  linkClicks: number;
  addsToCart: number;
  checkoutsInitiated: number;
  purchases: number;
  purchaseValue: number;
}

export interface LdDeviceCsv {
  devices: Map<string, LdConversionAgg>;
  platforms: Map<string, LdConversionAgg>;
  placements: Map<string, LdConversionAgg>;
  rowCount: number;
  window: { start: string; end: string };
}

// Parse the IAP-DEVICE re-export (placement × platform × CONVERSION
// device rows). Conversion-based tracking: rows carry funnel actions
// attributed to the converting device — spend/impressions are empty by
// design (delivery metrics are not device-attributable). The parser
// asserts that emptiness: if delivery metrics show up, Meta changed the
// export semantics again and the mapping must be re-reviewed.
export function parseLdDeviceCsv(raw: string): LdDeviceCsv {
  const table = parseCsv(raw.replace(/^\uFEFF/, ""));
  const header = table[0];
  const col = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`LittleData device CSV missing expected column "${name}"`);
    return idx;
  };
  const cPlatform = col("Platform");
  const cPlacement = col("Placement");
  const cDevice = col("Conversion device");
  const cLinkClicks = col("Link clicks");
  const cAtc = col("Adds to cart");
  const cCheckouts = col("Checkouts initiated");
  const cPurchases = col("Purchases");
  const cPurchValue = col("Purchases conversion value");
  const cSpend = col("Amount spent (USD)");
  const cImpressions = col("Impressions");
  const cStart = col("Reporting starts");
  const cEnd = col("Reporting ends");

  const devices = new Map<string, LdConversionAgg>();
  const platforms = new Map<string, LdConversionAgg>();
  const placements = new Map<string, LdConversionAgg>();
  let rowCount = 0;
  let start = "";
  let end = "";
  let deliverySpend = 0;
  let deliveryImpressions = 0;
  const bump = (bucket: Map<string, LdConversionAgg>, key: string, row: string[]) => {
    let agg = bucket.get(key);
    if (!agg) {
      agg = { key, linkClicks: 0, addsToCart: 0, checkoutsInitiated: 0, purchases: 0, purchaseValue: 0 };
      bucket.set(key, agg);
    }
    agg.linkClicks += Number(row[cLinkClicks] || 0);
    agg.addsToCart += Number(row[cAtc] || 0);
    agg.checkoutsInitiated += Number(row[cCheckouts] || 0);
    agg.purchases += Number(row[cPurchases] || 0);
    agg.purchaseValue += Number(row[cPurchValue] || 0);
  };
  for (const row of table.slice(1)) {
    const platform = row[cPlatform]?.trim();
    if (!platform) continue;
    rowCount++;
    // Meta reports '0' when the converting device is unknown — normalize
    // '0' and empty to 'unknown' (documented in the manual_uploads column
    // mapping).
    const rawDevice = row[cDevice]?.trim() || "unknown";
    const device = rawDevice === "0" ? "unknown" : rawDevice;
    const placement = row[cPlacement]?.trim() || "unknown";
    deliverySpend += Number(row[cSpend] || 0);
    deliveryImpressions += Number(row[cImpressions] || 0);
    const s = row[cStart] ?? "";
    const e = row[cEnd] ?? "";
    if (s && (!start || s < start)) start = s;
    if (e && (!end || e > end)) end = e;
    bump(devices, device, row);
    bump(platforms, platform, row);
    bump(placements, placement, row);
  }
  if (deliverySpend > 0 || deliveryImpressions > 0) {
    throw new Error(
      `LittleData device CSV carries delivery metrics ($${deliverySpend} / ${deliveryImpressions} imp) — ` +
      `expected conversion-based tracking (funnel actions only). Export semantics changed; re-review the column mapping before importing.`,
    );
  }
  return { devices, platforms, placements, rowCount, window: { start, end } };
}

export interface LdDemoTotals {
  spend: number;
  impressions: number;
  results: number;
  linkClicks: number;
  clicksAll: number;
  addsToCart: number;
  checkoutsInitiated: number;
  purchases: number;
  purchaseValue: number;
}

// Exact CSV-wide sums over the per-ad aggregates (spend/revenue rounded
// to cents once, at the total — matching the per-row cent precision of
// the source export).
export function summarizeLdDemoAds(ads: Iterable<LdCsvAdAgg>): LdDemoTotals {
  const list = [...ads];
  return {
    spend: round2(list.reduce((s, a) => s + a.spend, 0)),
    impressions: list.reduce((s, a) => s + a.impressions, 0),
    results: list.reduce((s, a) => s + a.results, 0),
    linkClicks: list.reduce((s, a) => s + a.linkClicks, 0),
    clicksAll: list.reduce((s, a) => s + a.clicksAll, 0),
    addsToCart: list.reduce((s, a) => s + a.addsToCart, 0),
    checkoutsInitiated: list.reduce((s, a) => s + a.checkoutsInitiated, 0),
    purchases: list.reduce((s, a) => s + a.purchases, 0),
    purchaseValue: round2(list.reduce((s, a) => s + a.purchaseValue, 0)),
  };
}

// The demo CSV must reconcile with the package's authoritative
// account_totals — core delivery metrics, the funnel columns, and the
// internal Results-vs-Purchases agreement. Throws on any drift; the
// importer refuses to write unverified data.
export function verifyLdDemoReconciliation(csvTotals: LdDemoTotals, accountTotals: any): void {
  const totals = accountTotals ?? {};
  if (Math.abs(csvTotals.spend - Number(totals.spend)) > 0.01 ||
      csvTotals.impressions !== Number(totals.impressions) ||
      csvTotals.results !== Number(totals.purchases)) {
    throw new Error(
      `LittleData demo CSV does not reconcile with account_totals — CSV $${csvTotals.spend} / ${csvTotals.impressions} imp / ${csvTotals.results} purchases ` +
      `vs package $${totals.spend} / ${totals.impressions} imp / ${totals.purchases} purchases. Refusing to import unverified data.`,
    );
  }
  // Funnel columns (2026-07-09 re-export) must reconcile too — the
  // bundle's account_totals are the authoritative record of the export.
  if (csvTotals.linkClicks !== Number(totals.link_clicks) ||
      csvTotals.addsToCart !== Number(totals.add_to_cart) ||
      csvTotals.checkoutsInitiated !== Number(totals.initiate_checkout) ||
      Math.abs(csvTotals.purchaseValue - Number(totals.revenue)) > 0.01) {
    throw new Error(
      `LittleData demo CSV funnel columns do not reconcile with account_totals — CSV ${csvTotals.linkClicks} lc / ${csvTotals.addsToCart} ATC / ` +
      `${csvTotals.checkoutsInitiated} IC / $${csvTotals.purchaseValue} revenue vs package ${totals.link_clicks} / ${totals.add_to_cart} / ` +
      `${totals.initiate_checkout} / $${totals.revenue}. Refusing to import unverified data.`,
    );
  }
  // The export carries purchases twice (Results under result type
  // "Website purchases", and the Purchases column) — they must agree.
  if (csvTotals.purchases !== csvTotals.results) {
    throw new Error(
      `LittleData demo CSV internal mismatch — Results sum ${csvTotals.results} vs Purchases column sum ${csvTotals.purchases}.`,
    );
  }
}

export interface LdDeviceTotals {
  purchases: number;
  checkoutsInitiated: number;
  linkClicks: number;
}

export function summarizeLdDeviceCsv(deviceCsv: Pick<LdDeviceCsv, "devices">): LdDeviceTotals {
  const list = [...deviceCsv.devices.values()];
  return {
    purchases: list.reduce((s, d) => s + d.purchases, 0),
    checkoutsInitiated: list.reduce((s, d) => s + d.checkoutsInitiated, 0),
    linkClicks: list.reduce((s, d) => s + d.linkClicks, 0),
  };
}

// Purchases/checkouts must agree with the demographic export. Link
// clicks intentionally NOT asserted: the device export covers a wider
// reporting window (2026-01-01 → 2026-07-09 vs the demo's day range),
// so cross-export click comparisons are directional only.
export function verifyLdDeviceReconciliation(deviceTotals: LdDeviceTotals, csvTotals: LdDemoTotals): void {
  if (deviceTotals.purchases !== csvTotals.purchases ||
      deviceTotals.checkoutsInitiated !== csvTotals.checkoutsInitiated) {
    throw new Error(
      `LittleData device CSV does not reconcile with the demographic export — device ${deviceTotals.purchases} purchases / ` +
      `${deviceTotals.checkoutsInitiated} checkouts vs demo ${csvTotals.purchases} / ${csvTotals.checkoutsInitiated}. Refusing to import unverified data.`,
    );
  }
}
