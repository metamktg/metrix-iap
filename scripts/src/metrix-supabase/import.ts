// ═══════════════════════════════════════════════════════════════════════
// Metrix IAP — Supabase importer
// Idempotent loader for the Bookster IAP loop package + app-level seed
// documents. Runs DDL (schema.sql) then replaces all imported rows per
// account inside a single transaction.
//
// Sources (scripts/data/metrix/):
//   normalized_data_bundle.json   — Bundle Prep output (BOOK0 + BOOK2)
//   campaign_intelligence.json    — Analysis Core output
//   strategic_map.json            — Strategy Map output
//   creative_briefs.json          — Brief Builder output
//   bookster_book2_iap_...json    — augmented Book2 local client library
//   Bookster_IAP_..._COPY_LIBRARY.csv — copy bank
//   metrix_seed_bundle.json       — app-level documents (defaults, cards,
//                                   MST matrix, report config, skov state)
//
// Second account (scripts/data/metrix/littledata/): LittleData / City Street
// Print Brand. Claude analysis package (normalized_data_bundle.json +
// campaign_intelligence.json + local_client_library.json) plus a manual
// data upload (IAP-DEMO CSV, full ad×gender×age×day export that sums
// exactly to the account totals) and the strategy_map / brief_builder
// stage outputs (strategic_map.json, creative_briefs.json,
// mst_foundation.json). bundle_prep, analysis_core, strategy_map and
// brief_builder are complete; creative_scan + optimization_loop stay
// honestly pending (the initial MST test grid is defined in brief LD-B001
// but no creative has been produced or scanned yet).
//
// Usage: SUPABASE_DB_URL=postgres://... pnpm --filter @workspace/scripts run import:metrix
// ═══════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data/metrix");

const ACCOUNT_ID = "bookster";
const WINDOW_START = "2026-05-02";
const WINDOW_END = "2026-07-07";

const LD_ACCOUNT_ID = "littledata";
const LD_DIR = join(DATA_DIR, "littledata");

function readJson(file: string): any {
  // normalized_data_bundle.json contains bare NaN tokens (source-run artifact);
  // NaN carries no value — treat as null rather than fabricating a number.
  const raw = readFileSync(join(DATA_DIR, file), "utf8");
  return JSON.parse(raw.replace(/\bNaN\b/g, "null"));
}

function parseCsv(raw: string): string[][] {
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

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" || Number.isNaN(v as number) ? null : Number(v);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ── Optional raw Meta export (ad-id / creative-asset backfill) ─────────
// When Meta exports with real ad ids arrive, drop a meta_ads_export.json
// shaped like:
//   {
//     "meta_ad_account_id": "1234567890",          // numeric, "act_" prefix ok
//     "ads": [
//       { "ad_name": "<exact ad_name from the package>",
//         "meta_ad_id": "23851234567890123",
//         "creative_asset_url": "https://..." }    // optional per ad
//     ]
//   }
// Location is per-account: scripts/data/metrix/meta_ads_export.json for
// Bookster, scripts/data/metrix/littledata/meta_ads_export.json for
// LittleData. The importer backfills ads.meta_ad_id /
// ads.creative_asset_url (and ad_accounts.meta_ad_account_id) from it.
// Absent file → columns stay NULL.
const META_EXPORT_FILE = "meta_ads_export.json";

interface MetaAdBackfill {
  metaAdId: string | null;
  creativeAssetUrl: string | null;
}

interface MetaAdsExport {
  metaAdAccountId: string | null;
  byAdName: Map<string, MetaAdBackfill>;
}

function loadMetaAdsExport(dir: string, label: string): MetaAdsExport {
  const byAdName = new Map<string, MetaAdBackfill>();
  const path = join(dir, META_EXPORT_FILE);
  if (!existsSync(path)) {
    console.log(`No ${META_EXPORT_FILE} for ${label} — meta_ad_id / creative_asset_url stay NULL where no other source exists (expected until raw Meta exports arrive).`);
    return { metaAdAccountId: null, byAdName };
  }
  const doc = JSON.parse(readFileSync(path, "utf8").replace(/\bNaN\b/g, "null"));
  const metaAdAccountId = str(doc.meta_ad_account_id)?.replace(/^act_/, "") ?? null;
  for (const a of doc.ads ?? []) {
    const adName = str(a.ad_name);
    if (!adName) continue;
    const metaAdId = str(a.meta_ad_id);
    const creativeAssetUrl = str(a.creative_asset_url);
    if (!metaAdId && !creativeAssetUrl) continue;
    byAdName.set(adName, { metaAdId, creativeAssetUrl });
  }
  console.log(`Loaded ${META_EXPORT_FILE} (${label}): ${byAdName.size} ads with meta_ad_id/creative_asset_url` +
    (metaAdAccountId ? `, ad account ${metaAdAccountId}` : ", no meta_ad_account_id (deep links stay pending)"));
  return { metaAdAccountId, byAdName };
}

// ═══ LittleData (City Street Print Brand) — second configured account ═══
// Claude analysis package + manual CSV uploads + strategy/brief stage
// outputs. The account has no BOOK/campaign/cell taxonomy (each ad is its
// own cell, book NULL). Ad-level rows come from the IAP-DEMO CSV (all 54
// ads, sums exactly to account totals — the importer asserts this and
// fails loudly on drift). The 2026-07-09 re-export added funnel columns
// (Link clicks, Clicks (all), Adds to cart, Checkouts initiated,
// Purchases, Purchases conversion value) — click-depth metrics are now
// real values. The IAP-DEVICE re-export switched from impression-based
// delivery breakdown to CONVERSION-BASED tracking: rows are placement ×
// platform × conversion device carrying funnel actions only; spend and
// impressions are not device-attributable and stay NULL
// (tracking_basis='conversion' on those rows). Reach is a unique-people
// metric and is NOT summable across segment rows — it stays NULL, never
// a fabricated sum. library_cell_performance stays limited to the ads
// the analysis package actually mapped (concept evidence exists only
// there). Deliberately NOT written: signal_cards, report_builder.
type Q = (text: string, values?: unknown[]) => Promise<pg.QueryResult>;

const ldConceptCode = (v: unknown): string | null => {
  const m = /^LD-CN-[A-Z0-9-]+/.exec(String(v ?? ""));
  return m ? m[0] : null;
};

const LD_DEMO_CSV = "IAP-DEMO-1202182091204847.csv";
const LD_DEVICE_CSV = "IAP-DEVICE-1202182091204847.csv";

interface LdSegmentAgg {
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

interface LdCsvAdAgg {
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

// Parse the manually uploaded IAP-DEMO CSV (ad × day × gender × age ×
// primary-text rows; the 2026-07-09 re-export added funnel columns) into
// per-ad and per-segment aggregates. Returns exact sums — the caller
// asserts them against the package's authoritative account totals.
function parseLdDemoCsv(raw: string): {
  ads: Map<string, LdCsvAdAgg>;
  accountSegments: Map<string, LdSegmentAgg>;
  rowCount: number;
  dayRange: { first: string; last: string };
  spendByAttribution: Map<string, number>;
} {
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

interface LdConversionAgg {
  key: string;
  linkClicks: number;
  addsToCart: number;
  checkoutsInitiated: number;
  purchases: number;
  purchaseValue: number;
}

// Parse the IAP-DEVICE re-export (placement × platform × CONVERSION
// device rows). Conversion-based tracking: rows carry funnel actions
// attributed to the converting device — spend/impressions are empty by
// design (delivery metrics are not device-attributable). The parser
// asserts that emptiness: if delivery metrics show up, Meta changed the
// export semantics again and the mapping must be re-reviewed.
function parseLdDeviceCsv(raw: string): {
  devices: Map<string, LdConversionAgg>;
  platforms: Map<string, LdConversionAgg>;
  placements: Map<string, LdConversionAgg>;
  rowCount: number;
  window: { start: string; end: string };
} {
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
    // to 'unknown' (documented in the manual_uploads column mapping).
    const device = (row[cDevice]?.trim() || "unknown") === "0" ? "unknown" : row[cDevice]!.trim();
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

const round2 = (v: number): number => Math.round(v * 100) / 100;

async function importLittleData(q: Q): Promise<number> {
  const required = [
    "normalized_data_bundle.json", "campaign_intelligence.json", "local_client_library.json",
    "strategic_map.json", "creative_briefs.json", "mst_foundation.json",
    LD_DEMO_CSV, LD_DEVICE_CSV,
  ];
  const missing = required.filter((f) => !existsSync(join(LD_DIR, f)));
  if (missing.length > 0) {
    throw new Error(`LittleData package incomplete — missing ${missing.join(", ")} in ${LD_DIR}`);
  }
  const readLd = (file: string): any =>
    JSON.parse(readFileSync(join(LD_DIR, file), "utf8").replace(/\bNaN\b/g, "null"));
  const bundle = readLd("normalized_data_bundle.json");
  const intelligence = readLd("campaign_intelligence.json");
  const library = readLd("local_client_library.json");
  const ldStrategy = readLd("strategic_map.json");
  const ldBriefs = readLd("creative_briefs.json");
  const ldMst = readLd("mst_foundation.json");

  const windowStart: string = bundle.bundle_metadata.date_range.start;
  const windowEnd: string = bundle.bundle_metadata.date_range.end;
  const resultType: string = str(bundle.bundle_metadata.objective) ?? "Website purchases";
  const metaAdAccountId = str(bundle.bundle_metadata.account_id)?.replace(/^act_/, "") ?? null;

  // ── Optional per-account Meta ads export (creative assets / ad ids) ──
  // scripts/data/metrix/littledata/meta_ads_export.json, same shape as the
  // Bookster file. The bundle metadata already carries the authoritative
  // Meta account id — if the export names a different account, that's
  // drift: abort rather than deep-link into the wrong Ads Manager account.
  const ldMetaExport = loadMetaAdsExport(LD_DIR, LD_ACCOUNT_ID);
  if (ldMetaExport.metaAdAccountId && metaAdAccountId &&
      ldMetaExport.metaAdAccountId !== metaAdAccountId) {
    throw new Error(
      `LittleData ${META_EXPORT_FILE} names Meta ad account ${ldMetaExport.metaAdAccountId} but the ` +
      `analysis package is for account ${metaAdAccountId}. Refusing to import mismatched export.`,
    );
  }

  // ── Manual upload: parse + verify the IAP-DEMO CSV ──────────────────
  const csv = parseLdDemoCsv(readFileSync(join(LD_DIR, LD_DEMO_CSV), "utf8"));
  const csvAds = [...csv.ads.values()].sort((a, b) => b.spend - a.spend);
  const csvSpend = round2(csvAds.reduce((s, a) => s + a.spend, 0));
  const csvImpressions = csvAds.reduce((s, a) => s + a.impressions, 0);
  const csvResults = csvAds.reduce((s, a) => s + a.results, 0);
  const csvLinkClicks = csvAds.reduce((s, a) => s + a.linkClicks, 0);
  const csvClicksAll = csvAds.reduce((s, a) => s + a.clicksAll, 0);
  const csvAtc = csvAds.reduce((s, a) => s + a.addsToCart, 0);
  const csvCheckouts = csvAds.reduce((s, a) => s + a.checkoutsInitiated, 0);
  const csvPurchases = csvAds.reduce((s, a) => s + a.purchases, 0);
  const csvPurchaseValue = round2(csvAds.reduce((s, a) => s + a.purchaseValue, 0));
  const totals = bundle.account_totals ?? {};
  if (Math.abs(csvSpend - Number(totals.spend)) > 0.01 ||
      csvImpressions !== Number(totals.impressions) ||
      csvResults !== Number(totals.purchases)) {
    throw new Error(
      `LittleData demo CSV does not reconcile with account_totals — CSV $${csvSpend} / ${csvImpressions} imp / ${csvResults} purchases ` +
      `vs package $${totals.spend} / ${totals.impressions} imp / ${totals.purchases} purchases. Refusing to import unverified data.`,
    );
  }
  // Funnel columns (2026-07-09 re-export) must reconcile too — the
  // bundle's account_totals are the authoritative record of the export.
  if (csvLinkClicks !== Number(totals.link_clicks) ||
      csvAtc !== Number(totals.add_to_cart) ||
      csvCheckouts !== Number(totals.initiate_checkout) ||
      Math.abs(csvPurchaseValue - Number(totals.revenue)) > 0.01) {
    throw new Error(
      `LittleData demo CSV funnel columns do not reconcile with account_totals — CSV ${csvLinkClicks} lc / ${csvAtc} ATC / ` +
      `${csvCheckouts} IC / $${csvPurchaseValue} revenue vs package ${totals.link_clicks} / ${totals.add_to_cart} / ` +
      `${totals.initiate_checkout} / $${totals.revenue}. Refusing to import unverified data.`,
    );
  }
  // The export carries purchases twice (Results under result type
  // "Website purchases", and the Purchases column) — they must agree.
  if (csvPurchases !== csvResults) {
    throw new Error(
      `LittleData demo CSV internal mismatch — Results sum ${csvResults} vs Purchases column sum ${csvPurchases}.`,
    );
  }
  const bundleAdNames = (bundle.ad_level_performance ?? []).map((r: any) => String(r.ad_name));
  const missingFromCsv = bundleAdNames.filter((name: string) => !csv.ads.has(name));
  if (missingFromCsv.length > 0) {
    throw new Error(`LittleData demo CSV is missing package ads: ${missingFromCsv.join(", ")}`);
  }
  console.log(
    `LittleData manual upload verified: ${csv.rowCount} CSV rows, ${csvAds.length} ads, ` +
    `$${csvSpend} / ${csvImpressions} imp / ${csvLinkClicks} link clicks / ${csvAtc} ATC / ${csvResults} purchases ` +
    `($${csvPurchaseValue}) — matches account totals exactly.`,
  );

  // ── Manual upload: parse + verify the IAP-DEVICE CSV (conversion) ───
  const deviceCsv = parseLdDeviceCsv(readFileSync(join(LD_DIR, LD_DEVICE_CSV), "utf8"));
  const devPurchases = [...deviceCsv.devices.values()].reduce((s, d) => s + d.purchases, 0);
  const devCheckouts = [...deviceCsv.devices.values()].reduce((s, d) => s + d.checkoutsInitiated, 0);
  const devLinkClicks = [...deviceCsv.devices.values()].reduce((s, d) => s + d.linkClicks, 0);
  // Purchases/checkouts must agree with the demographic export. Link
  // clicks intentionally NOT asserted: the device export covers a wider
  // reporting window (2026-01-01 → 2026-07-09 vs the demo's day range),
  // so cross-export click comparisons are directional only.
  if (devPurchases !== csvPurchases || devCheckouts !== csvCheckouts) {
    throw new Error(
      `LittleData device CSV does not reconcile with the demographic export — device ${devPurchases} purchases / ` +
      `${devCheckouts} checkouts vs demo ${csvPurchases} / ${csvCheckouts}. Refusing to import unverified data.`,
    );
  }
  console.log(
    `LittleData device upload verified: ${deviceCsv.rowCount} rows (conversion-based tracking, window ` +
    `${deviceCsv.window.start} → ${deviceCsv.window.end}), ${devLinkClicks} link clicks across ` +
    `${deviceCsv.devices.size} conversion devices / ${deviceCsv.platforms.size} platforms / ${deviceCsv.placements.size} placements; ` +
    `${devPurchases} purchases + ${devCheckouts} checkouts match the demographic export.`,
  );

  const cpaOf = (spend: number | null, purchases: number | null): number | null =>
    spend !== null && purchases !== null && purchases > 0
      ? Math.round((spend / purchases) * 100) / 100
      : null;
  // Percent/rate helpers — null (never 0) when the denominator is absent.
  const pctOf = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.round((numerator / denominator) * 100 * 10000) / 10000 : null;
  const cpmOf = (spend: number, impressions: number): number | null =>
    impressions > 0 ? round2((spend / impressions) * 1000) : null;

  // ── Ad account ──────────────────────────────────────────────────────
  await q(
    `insert into ad_accounts (id, name, status, platform, source_status, facebook_page_dp_url, overview_state, meta_ad_account_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (id) do update set name=excluded.name, status=excluded.status, platform=excluded.platform,
       source_status=excluded.source_status, facebook_page_dp_url=excluded.facebook_page_dp_url,
       overview_state=excluded.overview_state, meta_ad_account_id=excluded.meta_ad_account_id`,
    [LD_ACCOUNT_ID, "City Street Print Brand", "configured", "Meta Ads",
      "imported_from_claude_analysis_package", null, null, metaAdAccountId],
  );

  const conceptsByCode = new Map<string, any>();
  for (const c of library.local_concepts ?? []) conceptsByCode.set(c.code, c);
  const creativeByAd = new Map<string, any>();
  for (const c of library.creative_id_map ?? []) creativeByAd.set(c.ad_name, c);
  const bundleByAd = new Map<string, any>();
  for (const r of bundle.ad_level_performance ?? []) bundleByAd.set(String(r.ad_name), r);

  // ── Manual upload: ad_performance + ads for ALL CSV ads ─────────────
  // The CSV is the ad-level source of truth (sums exactly to account
  // totals, verified above). Package rows enrich with analysis confidence;
  // the library maps concepts where the analysis actually mapped them.
  let adPerfCount = 0;
  let ldBackfilledIds = 0;
  let ldBackfilledAssets = 0;
  for (const a of csvAds) {
    const map = creativeByAd.get(a.adName) ?? null;
    const stack = map?.variable_stack ?? {};
    const conceptCode = ldConceptCode(stack.CN);
    const bundleRow = bundleByAd.get(a.adName) ?? null;
    const spend = round2(a.spend);
    const purchases = a.results;
    // Analysis-core confidence where the package scored the ad; otherwise
    // the analysis threshold: sub-$50 creatives are "insufficient".
    const confidence = str(bundleRow?.confidence) ?? (spend < 50 ? "insufficient" : "validation_required");
    const campaignName = a.campaigns.size > 0 ? [...a.campaigns].sort().join(" + ") : null;
    const adSetName = a.adSets.size > 0 ? [...a.adSets].sort().join(" + ") : null;
    // Meta ad id: the per-account export can pin the id (and disambiguate
    // names reused across campaigns), but only if it matches an Ad ID the
    // CSV actually observed for that name — otherwise it's drift and we
    // fall back to the CSV rule (unique id only, else NULL; 23 of 54
    // names are reused across campaigns).
    const backfill = ldMetaExport.byAdName.get(a.adName) ?? null;
    let metaAdId = a.adIds.size === 1 ? [...a.adIds][0] : null;
    if (backfill?.metaAdId) {
      if (a.adIds.has(backfill.metaAdId)) {
        metaAdId = backfill.metaAdId;
        ldBackfilledIds++;
      } else {
        console.warn(
          `LittleData ${META_EXPORT_FILE}: meta_ad_id ${backfill.metaAdId} for "${a.adName}" is not among the ` +
          `CSV-observed Ad IDs (${[...a.adIds].join(", ")}) — ignoring the export id for this ad.`,
        );
      }
    }
    const creativeAssetUrl = backfill?.creativeAssetUrl ?? null;
    if (creativeAssetUrl) ldBackfilledAssets++;
    // Funnel columns are real since the 2026-07-09 re-export. Reach stays
    // NULL — it is a unique-people metric and summing segment rows would
    // fabricate a number.
    await q(
      `insert into ad_performance (account_id, book, campaign_name, ad_set_name, ad_name, cell, concept,
         variation, test_id, result_type, date_start, date_end, spend, impressions, reach, clicks_all,
         link_clicks, results, cpa, ctr_link_pct, cvr_link_pct, cpm, confidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [LD_ACCOUNT_ID, null, campaignName, adSetName, a.adName, a.adName, conceptCode, null, null, resultType,
        windowStart, windowEnd, spend, a.impressions, null, a.clicksAll, a.linkClicks, purchases,
        cpaOf(spend, purchases), pctOf(a.linkClicks, a.impressions), pctOf(purchases, a.linkClicks),
        cpmOf(spend, a.impressions), confidence],
    );
    adPerfCount++;

    await q(
      `insert into ads (account_id, ad_name, book, cell, concept, variation, test_id,
         meta_ad_id, creative_asset_url, asset_filename, asset_path, asset_servable)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [LD_ACCOUNT_ID, a.adName, null, a.adName, conceptCode, null, null,
        metaAdId, creativeAssetUrl, map ? str(map.asset) : null, null, Boolean(creativeAssetUrl)],
    );
  }
  if (ldMetaExport.byAdName.size > 0) {
    const unmatched = [...ldMetaExport.byAdName.keys()].filter((n) => !csv.ads.has(n));
    console.log(`LittleData meta export backfill: ${ldBackfilledIds} ads got meta_ad_id from the export, ${ldBackfilledAssets} got creative_asset_url.`);
    if (unmatched.length > 0) {
      console.warn(`LittleData ${META_EXPORT_FILE} contains ${unmatched.length} ad_name(s) not present in the CSV (ignored): ${unmatched.slice(0, 10).join(", ")}${unmatched.length > 10 ? ", …" : ""}`);
    }
  }

  // ── Per-ad library cells — only ads the analysis package mapped ─────
  for (const r of bundle.ad_level_performance ?? []) {
    const map = creativeByAd.get(r.ad_name) ?? null;
    const stack = map?.variable_stack ?? {};
    const conceptCode = ldConceptCode(stack.CN);
    const concept = conceptCode ? conceptsByCode.get(conceptCode) : null;
    const spend = num(r.spend);
    const purchases = num(r.purchases);

    const iapRead = [
      `Confidence: ${r.confidence}. Pre-signal window — ${bundle.account_totals.purchases} account purchases on $${bundle.account_totals.spend} total spend; no winner/loser calls yet.`,
      concept?.evidence ? `Concept evidence: ${concept.evidence}.` : null,
    ].filter(Boolean).join(" ");
    // Click-depth values come from the manual CSV (authoritative, funnel
    // columns present since the 2026-07-09 re-export). Every package ad
    // is asserted present in the CSV above.
    const csvAd = csv.ads.get(String(r.ad_name))!;
    const cellPayload: Record<string, unknown> = {
      cell_id: r.ad_name,
      "Result type": resultType,
      "Amount spent (USD)": spend,
      Reach: null,
      Impressions: num(r.impressions),
      Results: purchases,
      "Clicks (all)": csvAd.clicksAll,
      "Link clicks": csvAd.linkClicks,
      CPA_result: cpaOf(spend, purchases),
      CTR_link_pct: pctOf(csvAd.linkClicks, csvAd.impressions),
      Result_per_link_click_pct: pctOf(csvAd.results, csvAd.linkClicks),
      book2_concept_name: concept?.name ?? r.ad_name,
      iap_read: iapRead,
    };
    if (stack.HK) cellPayload["hook_variable"] = str(stack.HK);
    if (stack.TN) cellPayload["tone_variable"] = str(stack.TN);
    if (stack.FW) cellPayload["framework_variable"] = str(stack.FW);
    if (conceptCode) cellPayload["concept_variable"] = conceptCode;
    if (stack.HP) cellPayload["pain_proof_variable"] = str(stack.HP);
    if (stack.PR) cellPayload["proof_variable"] = str(stack.PR);
    if (stack.CTA) cellPayload["cta_variable"] = str(stack.CTA);
    await q(
      `insert into library_cell_performance (account_id, cell_id, result_type, date_start, date_end, payload)
       values ($1,$2,$3,$4,$5,$6)`,
      [LD_ACCOUNT_ID, r.ad_name, resultType, windowStart, windowEnd, JSON.stringify(cellPayload)],
    );
  }

  // ── Demographics — full gender × age aggregates from the manual CSV ─
  // (replaces the package's coarse top-segment table; sums verified above)
  const accountSegments = [...csv.accountSegments.values()].sort((a, b) => b.spend - a.spend);
  let dIdx = 0;
  const demoSignalRow = (cellId: string, adName: string, seg: LdSegmentAgg) => ({
    cell_id: cellId,
    "Ad name": adName,
    Age: seg.age,
    Gender: seg.gender,
    "Result type": resultType,
    "Amount spent (USD)": round2(seg.spend),
    Reach: null,
    Impressions: seg.impressions,
    Results: seg.results,
    "Clicks (all)": seg.clicksAll,
    "Link clicks": seg.linkClicks,
    CPA_result: cpaOf(round2(seg.spend), seg.results),
    CTR_link_pct: pctOf(seg.linkClicks, seg.impressions),
    Result_per_link_click_pct: pctOf(seg.results, seg.linkClicks),
  });
  for (const seg of accountSegments) {
    const spend = round2(seg.spend);
    await q(
      `insert into demographic_performance (account_id, gender, age, date_start, date_end, spend,
         link_clicks, results, cpa, cvr_link_pct, confidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [LD_ACCOUNT_ID, seg.gender, seg.age, windowStart, windowEnd, spend, seg.linkClicks, seg.results,
        cpaOf(spend, seg.results), pctOf(seg.results, seg.linkClicks), "validation_required"],
    );
    await q(
      `insert into demographic_signal (account_id, cell_id, ad_name, age, gender, date_start, date_end, row_index, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [LD_ACCOUNT_ID, "ACCOUNT", "All ads (manual demographic upload)", seg.age, seg.gender,
        windowStart, windowEnd, dIdx++,
        JSON.stringify(demoSignalRow("ACCOUNT", "All ads (manual demographic upload)", seg))],
    );
  }
  // Per-ad demographic signal for the ads with a readable sample: top-10
  // by spend plus every ad with a purchase (both purchase ads are top-10
  // in this window, asserted nowhere — the union keeps it honest).
  const signalAds = new Set<string>([
    ...csvAds.slice(0, 10).map((a) => a.adName),
    ...csvAds.filter((a) => a.results > 0).map((a) => a.adName),
  ]);
  for (const a of csvAds) {
    if (!signalAds.has(a.adName)) continue;
    const segs = [...a.segments.values()].sort((x, y) => y.spend - x.spend);
    for (const seg of segs) {
      await q(
        `insert into demographic_signal (account_id, cell_id, ad_name, age, gender, date_start, date_end, row_index, payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [LD_ACCOUNT_ID, a.adName, a.adName, seg.age, seg.gender,
          windowStart, windowEnd, dIdx++, JSON.stringify(demoSignalRow(a.adName, a.adName, seg))],
      );
    }
  }

  // ── Device / platform / placement — conversion-based tracking ───────
  // The IAP-DEVICE re-export attributes funnel actions to the CONVERTING
  // device/platform/placement; spend and impressions are not
  // device-attributable and stay NULL (never 0). results mirrors the
  // purchases count (result type "Website purchases"); cpa is NULL by
  // construction (no attributable spend). Window comes from the device
  // export itself (wider than the demographic day range — recorded in
  // manual_uploads provenance).
  const convRows = (bucket: Map<string, LdConversionAgg>) =>
    [...bucket.values()].sort((a, b) => b.linkClicks - a.linkClicks);
  for (const d of convRows(deviceCsv.devices)) {
    await q(
      `insert into device_performance (account_id, device, date_start, date_end, spend, impressions,
         results, cpa, confidence, link_clicks, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [LD_ACCOUNT_ID, d.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        d.purchases, null, "validation_required", d.linkClicks, d.addsToCart, d.checkoutsInitiated,
        d.purchases, "conversion"],
    );
  }
  for (const p of convRows(deviceCsv.platforms)) {
    await q(
      `insert into platform_performance (account_id, platform, date_start, date_end, spend, impressions,
         link_clicks, results, cpa, confidence, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [LD_ACCOUNT_ID, p.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        p.linkClicks, p.purchases, null, "validation_required", p.addsToCart, p.checkoutsInitiated,
        p.purchases, "conversion"],
    );
  }
  for (const p of convRows(deviceCsv.placements)) {
    await q(
      `insert into placement_performance (account_id, placement, date_start, date_end, spend, impressions,
         link_clicks, results, cpa, cvr_link_pct, confidence, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [LD_ACCOUNT_ID, p.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        p.linkClicks, p.purchases, null, pctOf(p.purchases, p.linkClicks), "validation_required",
        p.addsToCart, p.checkoutsInitiated, p.purchases, "conversion"],
    );
  }
  console.log(
    `LittleData conversion-tracking rows written: ${deviceCsv.devices.size} devices, ` +
    `${deviceCsv.platforms.size} platforms, ${deviceCsv.placements.size} placements (tracking_basis='conversion').`,
  );

  // ── Concepts (book NULL — this account has no book taxonomy) ────────
  for (const c of library.local_concepts ?? []) {
    let spend = 0;
    let purchases = 0;
    let mappedAds = 0;
    for (const ad of library.creative_id_map ?? []) {
      if (ldConceptCode(ad.variable_stack?.CN) === c.code) {
        spend += Number(ad.spend ?? 0);
        purchases += Number(ad.purchases ?? 0);
        mappedAds++;
      }
    }
    spend = Math.round(spend * 100) / 100;
    const confidence = /insufficient/i.test(String(c.evidence ?? "")) ? "insufficient" : "validation_required";
    await q(
      `insert into concept_performance (account_id, book, concept, date_start, date_end, spend,
         link_clicks, results, cpa, cvr_link_pct, confidence, mapped_in_library)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [LD_ACCOUNT_ID, null, c.code, windowStart, windowEnd, mappedAds > 0 ? spend : null, null,
        mappedAds > 0 ? purchases : null, cpaOf(spend, purchases), null, confidence, true],
    );
    await q(
      `insert into concept_intelligence (account_id, book, concept_code, mapped_in_library, spend,
         link_clicks, results, cpa, buying_intent_score, performance_lift_vs_baseline, performance_tier,
         confidence_level, what, why, so_what, now_what)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [LD_ACCOUNT_ID, null, c.code, true, mappedAds > 0 ? spend : null, null,
        mappedAds > 0 ? purchases : null, cpaOf(spend, purchases), null, null, null, confidence,
        str(c.definition), str(c.evidence), null, null],
    );
  }

  // ── Data-quality gap surface ─────────────────────────────────────────
  for (const f of bundle.quality_flags ?? []) {
    await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'quality_flag',$2)`,
      [LD_ACCOUNT_ID, JSON.stringify({ note: `${f.flag} (${f.severity}): ${f.detail}`, ...f })]);
  }
  const attribution = bundle.bundle_metadata.attribution_windows ?? {};
  await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'attribution_window',$2)`,
    [LD_ACCOUNT_ID, JSON.stringify({
      note: `Mixed attribution — standard: ${attribution.standard}; incremental: ${attribution.incremental}`,
      ...attribution,
    })]);

  // ── Analysis Core: failure patterns (from library.failed_patterns) ──
  for (const p of library.failed_patterns ?? []) {
    await q(
      `insert into failure_patterns (account_id, segment_type, campaign, spend, engagement_present, diagnosis, wasted_spend, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [LD_ACCOUNT_ID, "creative_pattern", null, null, null, str(p.pattern), null, JSON.stringify(p)],
    );
  }

  // ── Strategy Map stage output (littledata/strategic_map.json) ───────
  for (const p of ldStrategy.icp_profiles ?? []) {
    await q(
      `insert into icp_profiles (account_id, profile_id, profile_name, confidence_level, payload)
       values ($1,$2,$3,$4,$5)`,
      [LD_ACCOUNT_ID, p.profile_id, str(p.profile_name), str(p.confidence_level), JSON.stringify(p)],
    );
  }
  for (const p of ldStrategy.message_pillars ?? []) {
    await q(
      `insert into message_pillars (account_id, pillar_id, pillar_name, payload) values ($1,$2,$3,$4)`,
      [LD_ACCOUNT_ID, p.pillar_id, str(p.pillar_name), JSON.stringify(p)],
    );
  }
  for (const v of ldStrategy.variable_combinations ?? []) {
    await q(
      `insert into variable_combinations (account_id, combination, context, cpa, cvr_pct, confidence, recommendation)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (account_id, combination) do nothing`,
      [LD_ACCOUNT_ID, v.combination, str(v.context), num(v.cpa), num(v.cvr_pct), str(v.confidence), str(v.recommendation)],
    );
  }
  for (const h of ldStrategy.testing_hypotheses ?? []) {
    await q(
      `insert into testing_hypotheses (account_id, hypothesis_id, statement, control_ref, test_variant,
         isolated_variable, sample_requirement, duration, success_criteria, risk, expected_impact, failure_plan, priority)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [LD_ACCOUNT_ID, h.hypothesis_id, str(h.statement), str(h.control), str(h.test_variant),
        str(h.isolated_variable), str(h.sample_requirement), str(h.duration), str(h.success_criteria),
        str(h.risk), str(h.expected_impact), str(h.failure_plan), str(h.priority)],
    );
  }

  // ── Brief Builder stage output (littledata/creative_briefs.json) ────
  // book stays NULL — this account has no BOOK taxonomy.
  for (const b of ldBriefs.briefs ?? []) {
    const meta = b.brief_metadata ?? {};
    await q(
      `insert into imported_creative_briefs (account_id, brief_id, mode, book, asset_type, priority, confidence, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [LD_ACCOUNT_ID, meta.brief_id, str(meta.mode), null,
        str(meta.asset_type), str(meta.priority), str(meta.confidence), JSON.stringify(b)],
    );
  }

  // ── Local library cells (retro-mapped historical ads) ───────────────
  let ldCellIdx = 0;
  for (const cell of ldMst.local_library_cells ?? []) {
    await q(
      `insert into library_cells (account_id, cell_id, concept_id, asset_filename, asset_path,
         qa_mapping_status, mapping_confidence, row_index, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [LD_ACCOUNT_ID, cell.cell_id, str(cell.concept_id), str(cell.asset_filename), str(cell.asset_path),
        str(cell.qa_mapping_status), str(cell.mapping_confidence), ldCellIdx++, JSON.stringify(cell)],
    );
  }

  // ── Document modules ─────────────────────────────────────────────────
  const ldModules: Array<[string, unknown]> = [
    ["iap_metadata", {
      client_id: library.client_id,
      client_name: library.client_name,
      library_version: library.library_version,
      source_files: library.source_files,
      global_variables_used: library.global_variables_used,
      product_context: library.product_context,
      bundle_metadata: bundle.bundle_metadata,
      // Authoritative account-level totals from the bundle-prep export.
      // Since the manual CSV upload, the ad-level table covers 100% of
      // this spend (asserted at import) — seed assembly's coverage caveat
      // resolves itself because the sums now match. The 2026-07-09
      // re-export added funnel totals (link_clicks / add_to_cart /
      // initiate_checkout / revenue) — also asserted against the CSV.
      account_totals: { ...bundle.account_totals, result_type: resultType },
      loop_run: intelligence.report_metadata,
      source_package: `LittleData Claude analysis package (City Street Print Brand, ${windowStart} → ${windowEnd})`,
      manual_uploads: [
        {
          file: LD_DEMO_CSV,
          original_export: "IAP-DEMOGRAPHIC-MAIN-1202182091204847.csv",
          kind: "meta_export_demographic_breakdown",
          uploaded: "2026-07-09",
          replaces: "The initial May-window export without funnel columns — the re-export requested by analysis_core, delivered 2026-07-09.",
          grain: "ad × day × gender × age × primary text",
          rows_parsed: csv.rowCount,
          ads: csvAds.length,
          day_range: csv.dayRange,
          new_columns: [
            "Link clicks", "Clicks (all)", "Adds to cart", "Checkouts initiated",
            "Purchases", "Purchases conversion value", "Attribution setting", "Text",
          ],
          column_mapping: {
            "Link clicks": "ad_performance.link_clicks + demographic_performance.link_clicks + library cell payloads (summed per ad / per gender×age segment)",
            "Clicks (all)": "ad_performance.clicks_all + signal payloads",
            "Purchases": "cross-checked against Results (asserted equal at import); stored as ad_performance.results",
            "Adds to cart / Checkouts initiated / Purchases conversion value": "account-level totals (account_totals.add_to_cart / initiate_checkout / revenue) — no per-ad funnel table below link clicks",
            "Reach": "NOT summable across segment rows (unique-people metric) — left NULL, never summed",
            "Text": "primary-text dimension acknowledged; per-variant copy reads not stored (COPY_FRAGMENTATION: spend per variant too thin)",
            "Attribution setting": "spend split recorded below for the mixed-attribution caveat",
          },
          attribution_spend_split: [...csv.spendByAttribution.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([setting, spend]) => ({
              setting,
              spend: round2(spend),
              share_pct: round2((spend / csvSpend) * 100),
            })),
          verification: `Sums to $${csvSpend} / ${csvImpressions} impressions / ${csvLinkClicks} link clicks / ${csvClicksAll} clicks (all) / ${csvAtc} ATC / ${csvCheckouts} checkouts / ${csvResults} purchases ($${csvPurchaseValue}) — matches the package account totals exactly (asserted at import).`,
        },
        {
          file: LD_DEVICE_CSV,
          original_export: "IAP-DEVICE-MAIN-1202182091204847.csv",
          kind: "meta_export_conversion_device_breakdown",
          uploaded: "2026-07-09",
          replaces: "The delivery-based device/placement export whose metric columns were all empty (no rows were ever written from it).",
          grain: "platform × placement × conversion device",
          rows_parsed: deviceCsv.rowCount,
          window: deviceCsv.window,
          tracking_change: "Impression-based delivery breakdown → conversion-based tracking: funnel actions (link clicks, ATC, checkouts, purchases) are attributed to the CONVERTING device; spend/impressions are not device-attributable and stay NULL in device/platform/placement_performance (tracking_basis='conversion').",
          column_mapping: {
            "Conversion device": "device_performance.device — Meta reports '0' when the converting device is unknown; normalized to 'unknown'",
            "Link clicks / Adds to cart / Checkouts initiated / Purchases": "device/platform/placement_performance funnel columns (link_clicks, adds_to_cart, checkouts_initiated, purchases), tracking_basis='conversion'",
          },
          caveats: [
            `Reporting window ${deviceCsv.window.start} → ${deviceCsv.window.end} is wider than the demographic export's day range (${csv.dayRange.first} → ${csv.dayRange.last}) — cross-export click comparisons are directional only (${devLinkClicks} vs ${csvLinkClicks} link clicks).`,
            "Every purchase, ATC and checkout reports under conversion device 'unknown' — device-level purchase attribution is unavailable in this account; only link clicks split by device.",
          ],
          verification: `${devPurchases} purchases and ${devCheckouts} checkouts match the demographic export (asserted at import); delivery metrics asserted empty (conversion-based export).`,
        },
      ],
    }],
    ["core_reanalysis_read", {
      primary_control: "No control established — pre-signal account",
      primary_control_read: str(intelligence.executive_summary?.verdict) ??
        "Pre-signal account; no decision-grade creative reads yet.",
      registration_control: null,
      registration_control_read: null,
      data_caveat: "61% of spend reports under Incremental attribution (systematically undercounts platform-attributable purchases). The 2026-07-09 re-export added funnel columns — link clicks, clicks, ATC, checkouts and revenue are now real values. Device tracking is conversion-based: spend/impressions are not device-attributable, and every recorded purchase reports an unknown conversion device.",
    }],
    ["analysis_core_summary", {
      report_metadata: intelligence.report_metadata,
      executive_summary: intelligence.executive_summary,
      performance_tables: intelligence.performance_tables,
      winning_creative_formula: intelligence.winning_creative_formula,
      messaging_theme_categorization: intelligence.messaging_theme_categorization,
      optimization_priorities: intelligence.optimization_priorities,
      actionable_recommendations: intelligence.actionable_recommendations,
      creative_development_roadmap: intelligence.creative_development_roadmap,
      budget_allocation_guidance: intelligence.budget_allocation_guidance,
      insight_confidence: intelligence.insight_confidence,
      purchase_events: bundle.purchase_events,
      winning_patterns: library.winning_patterns,
      failed_patterns: library.failed_patterns,
      active_hypotheses: library.active_hypotheses,
      evidence_notes: library.evidence_notes,
    }],
    ["scaling_playbook", ldStrategy.scaling_playbook ?? null],
    ["mst", {
      status: str(ldMst.status) ?? "active",
      render_policy: str(ldMst.render_policy),
      historical_matrix_4x4: ldMst.historical_matrix_4x4 ?? null,
      source_artifacts: ldMst.source_artifacts ?? [],
    }],
  ];
  for (const [module, payload] of ldModules) {
    await q(
      `insert into account_modules (account_id, module, payload) values ($1,$2,$3)
       on conflict (account_id, module) do update set payload = excluded.payload`,
      [LD_ACCOUNT_ID, module, JSON.stringify(payload)],
    );
  }

  // ── Loop stage bookkeeping — 4 of 6 stages ran ───────────────────────
  const ldRuns: Array<[string, string, string | null, string | null]> = [
    ["bundle_prep", "complete", "littledata/normalized_data_bundle.json",
      "Includes the 2026-07-09 manual re-uploads: IAP-DEMO CSV with funnel columns (all 54 ads; reconciles exactly with account totals) and the conversion-device IAP-DEVICE CSV (placement × platform × conversion device)."],
    ["analysis_core", "complete", "littledata/campaign_intelligence.json",
      "The 2026-07-09 re-export delivered the funnel columns this stage requested — click-depth metrics (CTR/CVR, ATC, checkouts, revenue) are now computed from real data; device tracking is conversion-based."],
    ["strategy_map", "complete", "littledata/strategic_map.json",
      "Built from the manual-upload window — 3 ICPs, 5 message pillars, 3 testing hypotheses, retro-mapped 3×3 MST foundation. All reads validation_required (pre-signal account)."],
    ["brief_builder", "complete", "littledata/creative_briefs.json",
      "Initial MST brief LD-B001 (gift-moment 3×3 hook × staging grid). Awaiting creative production."],
    ["creative_scan", "pending", null,
      "Not yet run — the initial MST test grid is defined in brief LD-B001, but no creative has been produced or scanned yet."],
    ["optimization_loop", "pending", null,
      "Not yet run — golden-formula output requires the LD-B001 test cycle to produce scanned creative and reads first."],
  ];
  for (const [stage, status, source, note] of ldRuns) {
    await q(
      `insert into iap_runs (account_id, stage, status, window_start, window_end, generated_at, source_file, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [LD_ACCOUNT_ID, stage, status, windowStart, windowEnd,
        status === "complete" ? (str(intelligence.report_metadata?.generated) ?? null) : null,
        source, note],
    );
  }

  return adPerfCount;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("SUPABASE_DB_URL is not set. Provide the Supabase Postgres connection string.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to Supabase Postgres.");

  const bundle = readJson("normalized_data_bundle.json");
  const intelligence = readJson("campaign_intelligence.json");
  const strategy = readJson("strategic_map.json");
  const briefs = readJson("creative_briefs.json");
  const library = readJson("bookster_book2_iap_local_client_library_augmented.json");
  const seed = readJson("metrix_seed_bundle.json");
  const copyCsv = parseCsv(
    readFileSync(join(DATA_DIR, "Bookster_IAP_Local_Client_Library_v1_2_-_COPY_LIBRARY.csv"), "utf8"),
  );
  const metaExport = loadMetaAdsExport(DATA_DIR, ACCOUNT_ID);

  const q = (text: string, values?: unknown[]) => client.query(text, values);

  try {
    // ── DDL ────────────────────────────────────────────────────────────
    const schemaSql = readFileSync(join(__dirname, "schema.sql"), "utf8");
    await q(schemaSql);
    console.log("Schema applied.");

    await q("begin");

    // ── Wipe previously imported rows (idempotent re-run) ─────────────
    const dataTables = [
      "ad_performance", "demographic_performance", "placement_performance",
      "platform_performance", "device_performance", "concept_performance",
      "campaign_windows", "data_quality_flags", "concept_intelligence",
      "ad_traffic_quality", "failure_patterns", "icp_profiles", "message_pillars",
      "variable_combinations", "testing_hypotheses", "imported_creative_briefs",
      "library_cells", "library_cell_performance", "variable_performance",
      "demographic_signal", "placement_signal", "copy_library", "signal_cards",
      "account_modules", "iap_runs", "ads",
    ];
    for (const t of dataTables) {
      await q(`delete from ${t} where account_id = any($1)`, [[ACCOUNT_ID, LD_ACCOUNT_ID]]);
    }
    await q(`delete from signal_cards`); // manager cards have no bookster-only account scoping guarantee
    await q(`delete from account_modules where account_id = 'skov_pet'`);
    await q(`delete from variable_registry`);
    await q(`delete from app_config`);

    // ── Ad accounts ────────────────────────────────────────────────────
    const skov = seed.ad_accounts.find((a: any) => a.id === "skov_pet");
    await q(
      `insert into ad_accounts (id, name, status, platform, source_status, facebook_page_dp_url, overview_state, meta_ad_account_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set name=excluded.name, status=excluded.status, platform=excluded.platform,
         source_status=excluded.source_status, facebook_page_dp_url=excluded.facebook_page_dp_url,
         overview_state=excluded.overview_state, meta_ad_account_id=excluded.meta_ad_account_id`,
      [ACCOUNT_ID, "Bookster", "configured", "Meta Ads", "imported_from_iap_loop_package", null, null,
        metaExport.metaAdAccountId],
    );
    await q(
      `insert into ad_accounts (id, name, status, platform, source_status, facebook_page_dp_url, overview_state)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set name=excluded.name, status=excluded.status, platform=excluded.platform,
         source_status=excluded.source_status, overview_state=excluded.overview_state`,
      ["skov_pet", skov?.name ?? "SKOV Pet", "unconfigured", "Meta Ads", null, null,
        JSON.stringify(skov?.overview_state ?? null)],
    );

    // ── Bundle Prep: ad_performance + ads ──────────────────────────────
    let adPerfCount = 0;
    for (const r of bundle.copy_performance) {
      await q(
        `insert into ad_performance (account_id, book, campaign_name, ad_set_name, ad_name, cell, concept,
           variation, test_id, result_type, date_start, date_end, spend, impressions, reach, clicks_all,
           link_clicks, results, cpa, ctr_link_pct, cvr_link_pct, cpm, confidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [ACCOUNT_ID, r.book, r.campaign_name, r.ad_set_name, r.ad_name, r.cell, r.concept, str(r.variation),
          str(r.test_id), r.result_type, r.date_start, r.date_end, num(r.spend), num(r.impressions),
          num(r.reach), num(r.clicks_all), num(r.link_clicks), num(r.results), num(r.cpa),
          num(r.ctr_link_pct), num(r.cvr_link_pct), num(r.cpm), str(r.confidence)],
      );
      adPerfCount++;
    }

    // Ads registry: union of performance ad_names and library-mapped ad names.
    // meta_ad_id / creative_asset_url are NULL unless meta_ads_export.json
    // supplies them (they are absent from all IAP loop package files).
    // asset_path is a non-servable local path.
    const adRows = new Map<string, any>();
    for (const r of bundle.copy_performance) {
      if (!adRows.has(r.ad_name)) {
        adRows.set(r.ad_name, {
          book: r.book, cell: r.cell, concept: r.concept,
          variation: str(r.variation), test_id: str(r.test_id),
          asset_filename: null, asset_path: null,
        });
      }
    }
    for (const cell of library.updated_creative_local_library) {
      for (const adName of cell.mapped_ad_names ?? []) {
        const existing = adRows.get(adName) ?? {
          book: "BOOK2", cell: cell.cell_id, concept: cell.concept_id,
          variation: null, test_id: cell.detected_variant ?? null,
        };
        existing.asset_filename = cell.asset_filename ?? existing.asset_filename ?? null;
        existing.asset_path = cell.asset_path ?? existing.asset_path ?? null;
        adRows.set(adName, existing);
      }
    }
    let backfilledIds = 0;
    let backfilledAssets = 0;
    for (const [adName, a] of adRows) {
      const backfill = metaExport.byAdName.get(adName) ?? null;
      if (backfill?.metaAdId) backfilledIds++;
      if (backfill?.creativeAssetUrl) backfilledAssets++;
      await q(
        `insert into ads (account_id, ad_name, book, cell, concept, variation, test_id,
           meta_ad_id, creative_asset_url, asset_filename, asset_path, asset_servable)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [ACCOUNT_ID, adName, a.book, a.cell, a.concept, a.variation, a.test_id,
          backfill?.metaAdId ?? null, backfill?.creativeAssetUrl ?? null,
          a.asset_filename, a.asset_path, Boolean(backfill?.creativeAssetUrl)],
      );
    }
    if (metaExport.byAdName.size > 0) {
      const unmatched = [...metaExport.byAdName.keys()].filter((n) => !adRows.has(n));
      console.log(`Meta export backfill: ${backfilledIds} ads got meta_ad_id, ${backfilledAssets} got creative_asset_url.`);
      if (unmatched.length > 0) {
        console.warn(`Meta export contains ${unmatched.length} ad_name(s) not present in the package (ignored): ${unmatched.slice(0, 10).join(", ")}${unmatched.length > 10 ? ", …" : ""}`);
      }
    }

    // ── Bundle Prep: aggregate breakdowns (stamped with the bundle window;
    //     these source rows carry no per-row dates) ──────────────────────
    for (const r of bundle.demographic_performance) {
      await q(
        `insert into demographic_performance (account_id, gender, age, date_start, date_end, spend,
           link_clicks, results, cpa, cvr_link_pct, confidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [ACCOUNT_ID, r.gender, r.age, WINDOW_START, WINDOW_END, num(r.spend), num(r.link_clicks),
          num(r.results), num(r.cpa), num(r.cvr_link_pct), str(r.confidence)],
      );
    }
    for (const r of bundle.placement_performance) {
      await q(
        `insert into placement_performance (account_id, placement, date_start, date_end, spend,
           impressions, link_clicks, results, cpa, cvr_link_pct, confidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [ACCOUNT_ID, r.placement, WINDOW_START, WINDOW_END, num(r.spend), num(r.impressions),
          num(r.link_clicks), num(r.results), num(r.cpa), num(r.cvr_link_pct), str(r.confidence)],
      );
    }
    for (const r of bundle.platform_performance) {
      await q(
        `insert into platform_performance (account_id, platform, date_start, date_end, spend,
           impressions, link_clicks, results, cpa, confidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ACCOUNT_ID, r.platform, WINDOW_START, WINDOW_END, num(r.spend), num(r.impressions),
          num(r.link_clicks), num(r.results), num(r.cpa), str(r.confidence)],
      );
    }
    for (const r of bundle.device_performance) {
      await q(
        `insert into device_performance (account_id, device, date_start, date_end, spend,
           impressions, results, cpa, confidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ACCOUNT_ID, r.device, WINDOW_START, WINDOW_END, num(r.spend), num(r.impressions),
          num(r.results), num(r.cpa), str(r.confidence)],
      );
    }
    for (const r of bundle.concept_rollup) {
      await q(
        `insert into concept_performance (account_id, book, concept, date_start, date_end, spend,
           link_clicks, results, cpa, cvr_link_pct, confidence, mapped_in_library)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [ACCOUNT_ID, r.book, r.concept, r.date_start, r.date_end, num(r.spend), num(r.link_clicks),
          num(r.results), num(r.cpa), num(r.cvr_link_pct), str(r.confidence), r.mapped === true],
      );
    }
    for (const r of bundle.metadata.campaign_date_windows) {
      await q(
        `insert into campaign_windows (account_id, campaign_name, book, os, date_start, date_end, result_type, spend)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ACCOUNT_ID, r.campaign_name, r.book, str(r.os), r.date_start, r.date_end, r.result_type, num(r.spend)],
      );
    }

    // Data-quality gap surface
    for (const a of bundle.metadata.anomalies_detected ?? []) {
      await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'anomaly',$2)`,
        [ACCOUNT_ID, JSON.stringify(a)]);
    }
    for (const f of bundle.quality_flags ?? []) {
      await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'quality_flag',$2)`,
        [ACCOUNT_ID, JSON.stringify({ note: f })]);
    }
    await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'attribution_window',$2)`,
      [ACCOUNT_ID, JSON.stringify({ note: bundle.metadata.attribution_window })]);
    await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'data_quality_score',$2)`,
      [ACCOUNT_ID, JSON.stringify({ note: bundle.metadata.data_quality_score })]);

    // ── Analysis Core ──────────────────────────────────────────────────
    // creative_dna_signals and performance_tiers are the same 9 concept rows
    // in the source file; on-conflict-do-nothing dedupes them.
    for (const r of [...(intelligence.performance_tiers ?? []), ...(intelligence.creative_dna_signals ?? [])]) {
      await q(
        `insert into concept_intelligence (account_id, book, concept_code, mapped_in_library, spend,
           link_clicks, results, cpa, buying_intent_score, performance_lift_vs_baseline, performance_tier,
           confidence_level, what, why, so_what, now_what)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (account_id, book, concept_code) do nothing`,
        [ACCOUNT_ID, r.book, r.concept_code, r.mapped_in_library === true, num(r.spend), num(r.link_clicks),
          num(r.results), num(r.cpa), num(r.buying_intent_score), str(r.performance_lift_vs_baseline),
          str(r.performance_tier), str(r.confidence_level), str(r.what), str(r.why), str(r.so_what), str(r.now_what)],
      );
    }
    for (const r of intelligence.traffic_quality_correlation ?? []) {
      await q(
        `insert into ad_traffic_quality (account_id, book, ad_name, ctr_link_pct, cvr_link_pct, classification, confidence)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [ACCOUNT_ID, r.book, r.ad_name, num(r.ctr_link_pct), num(r.cvr_link_pct), str(r.classification), str(r.confidence)],
      );
    }
    for (const r of intelligence.failure_patterns ?? []) {
      await q(
        `insert into failure_patterns (account_id, segment_type, campaign, spend, engagement_present, diagnosis, wasted_spend, payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ACCOUNT_ID, str(r.segment_type), str(r.campaign), num(r.spend),
          typeof r.engagement_present === "boolean" ? r.engagement_present : null,
          str(r.diagnosis), num(r.wasted_spend), JSON.stringify(r)],
      );
    }
    await q(
      `insert into account_modules (account_id, module, payload) values ($1,'analysis_core_summary',$2)`,
      [ACCOUNT_ID, JSON.stringify({
        report_metadata: intelligence.report_metadata,
        executive_summary: intelligence.executive_summary,
        buyer_intent_funnel: intelligence.buyer_intent_funnel,
        winning_variable_stack: intelligence.winning_variable_stack,
        insight_confidence: intelligence.insight_confidence,
      })],
    );

    // ── Strategy Map ───────────────────────────────────────────────────
    for (const p of strategy.icp_profiles ?? []) {
      await q(
        `insert into icp_profiles (account_id, profile_id, profile_name, confidence_level, payload)
         values ($1,$2,$3,$4,$5)`,
        [ACCOUNT_ID, p.profile_id, str(p.profile_name), str(p.confidence_level), JSON.stringify(p)],
      );
    }
    for (const p of strategy.message_pillars ?? []) {
      await q(
        `insert into message_pillars (account_id, pillar_id, pillar_name, payload) values ($1,$2,$3,$4)`,
        [ACCOUNT_ID, p.pillar_id, str(p.pillar_name), JSON.stringify(p)],
      );
    }
    for (const v of strategy.variable_combinations ?? []) {
      await q(
        `insert into variable_combinations (account_id, combination, context, cpa, cvr_pct, confidence, recommendation)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (account_id, combination) do nothing`,
        [ACCOUNT_ID, v.combination, str(v.context), num(v.cpa), num(v.cvr_pct), str(v.confidence), str(v.recommendation)],
      );
    }
    for (const h of strategy.testing_hypotheses ?? []) {
      await q(
        `insert into testing_hypotheses (account_id, hypothesis_id, statement, control_ref, test_variant,
           isolated_variable, sample_requirement, duration, success_criteria, risk, expected_impact, failure_plan, priority)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [ACCOUNT_ID, h.hypothesis_id, str(h.statement), str(h.control), str(h.test_variant),
          str(h.isolated_variable), str(h.sample_requirement), str(h.duration), str(h.success_criteria),
          str(h.risk), str(h.expected_impact), str(h.failure_plan), str(h.priority)],
      );
    }
    await q(`insert into account_modules (account_id, module, payload) values ($1,'scaling_playbook',$2)`,
      [ACCOUNT_ID, JSON.stringify(strategy.scaling_playbook ?? null)]);

    // ── Brief Builder ──────────────────────────────────────────────────
    for (const b of briefs.briefs ?? []) {
      const meta = b.brief_metadata ?? {};
      await q(
        `insert into imported_creative_briefs (account_id, brief_id, mode, book, asset_type, priority, confidence, payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ACCOUNT_ID, meta.brief_id, str(meta.mode), String(meta.brief_id ?? "").startsWith("BOOK2") ? "BOOK2" : "BOOK0",
          str(meta.asset_type), str(meta.priority), str(meta.confidence), JSON.stringify(b)],
      );
    }

    // ── Local client library (Book2 augmented — best-effort provenance
    //     documented in iap_metadata below) ──────────────────────────────
    let idx = 0;
    for (const cell of library.updated_creative_local_library) {
      await q(
        `insert into library_cells (account_id, cell_id, concept_id, asset_filename, asset_path,
           qa_mapping_status, mapping_confidence, row_index, payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ACCOUNT_ID, cell.cell_id, str(cell.concept_id), str(cell.asset_filename), str(cell.asset_path),
          str(cell.qa_mapping_status), str(cell.mapping_confidence), idx++, JSON.stringify(cell)],
      );
    }
    for (const r of library.performance_by_cell) {
      await q(
        `insert into library_cell_performance (account_id, cell_id, result_type, date_start, date_end, payload)
         values ($1,$2,$3,$4,$5,$6)`,
        [ACCOUNT_ID, r.cell_id, r["Result type"], WINDOW_START, WINDOW_END, JSON.stringify(r)],
      );
    }
    for (const r of library.v3_variable_performance) {
      await q(
        `insert into variable_performance (account_id, variable_family, variable_id, result_type, date_start, date_end, payload)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [ACCOUNT_ID, r.variable_family, r.variable_id, r["Result type"], WINDOW_START, WINDOW_END, JSON.stringify(r)],
      );
    }
    idx = 0;
    for (const r of library.demographic_registration_signal) {
      await q(
        `insert into demographic_signal (account_id, cell_id, ad_name, age, gender, date_start, date_end, row_index, payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ACCOUNT_ID, str(r.cell_id), str(r["Ad name"]), str(r.Age), str(r.Gender), WINDOW_START, WINDOW_END, idx++, JSON.stringify(r)],
      );
    }
    idx = 0;
    for (const r of library.v3_placement_signal) {
      await q(
        `insert into placement_signal (account_id, signal_scope, placement, platform, date_start, date_end, row_index, payload)
         values ($1,'v3',$2,$3,$4,$5,$6,$7)`,
        [ACCOUNT_ID, str(r.Placement), str(r.Platform), WINDOW_START, WINDOW_END, idx++, JSON.stringify(r)],
      );
    }
    idx = 0;
    for (const r of library.c4e_placement_signal) {
      await q(
        `insert into placement_signal (account_id, signal_scope, placement, platform, date_start, date_end, row_index, payload)
         values ($1,'c4e',$2,$3,$4,$5,$6,$7)`,
        [ACCOUNT_ID, str(r.Placement), str(r.Platform), WINDOW_START, WINDOW_END, idx++, JSON.stringify(r)],
      );
    }

    // ── Copy library CSV ───────────────────────────────────────────────
    const [header, ...copyRows] = copyCsv;
    const col = (row: string[], name: string) => {
      const i = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
      return i >= 0 ? row[i] ?? null : null;
    };
    for (const row of copyRows) {
      const code = col(row, "Code");
      if (!code) continue;
      await q(
        `insert into copy_library (account_id, code, scope, copy_type, copy, char_count, usage, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ACCOUNT_ID, code, col(row, "Scope"), col(row, "Type"), col(row, "Copy"),
          num(col(row, "Char Count")), col(row, "Usage"), col(row, "Notes")],
      );
    }

    // ── Variable registry — explicit registry-missing families ─────────
    const registryRows: Array<[string, string, string, string]> = [
      ["HK", "Hook", "active", "Defined in local client library variable stacks."],
      ["TN", "Tone", "active", "Defined in local client library variable stacks."],
      ["FW", "Framework", "active", "Defined in local client library variable stacks."],
      ["CN", "Concept", "active", "Defined in local client library variable stacks."],
      ["PR", "Proof type", "active", "Defined in local client library variable stacks."],
      ["HP", "Pain proof", "active", "Defined in local client library variable stacks."],
      ["ST", "Structure", "registry_missing", "Confirmed known gap: no ST_ registry definition exists in the client library and no ST_ performance rows appear in any source export."],
      ["AW", "Awareness level", "registry_missing", "Confirmed known gap: no AW_ registry definition exists in the client library and no AW_ performance rows appear in any source export."],
      ["CTA", "Call to action", "registry_missing", "Confirmed known gap: CTA_ codes appear in creative stacks but no CTA_ registry definition is backed by the client library registry tabs."],
    ];
    for (const [prefix, family, status, note] of registryRows) {
      await q(`insert into variable_registry (prefix, family, status, note) values ($1,$2,$3,$4)`,
        [prefix, family, status, note]);
    }

    // ── Cards (listen + manager) ───────────────────────────────────────
    const bookster = seed.ad_accounts.find((a: any) => a.id === ACCOUNT_ID);
    for (const c of bookster?.listen?.signal_cards ?? []) {
      await q(
        `insert into signal_cards (card_id, account_id, surface, scope, title, rationale, impact, confidence,
           source_path, recommended_action, manager_card_descriptor)
         values ($1,$2,'listen',$3,$4,$5,$6,$7,$8,$9,null)`,
        [c.id, ACCOUNT_ID, c.scope, c.title, c.rationale, c.impact, c.confidence,
          str(c.source_path), c.recommended_action],
      );
    }
    for (const c of seed.manager_account?.recommendation_cards ?? []) {
      await q(
        `insert into signal_cards (card_id, account_id, surface, scope, title, rationale, impact, confidence,
           source_path, recommended_action, manager_card_descriptor)
         values ($1,$2,'manager_overview',$3,$4,$5,$6,$7,$8,$9,$10)`,
        [c.id, c.account_id === "skov_pet" ? "skov_pet" : ACCOUNT_ID, c.scope, c.title, c.rationale,
          c.impact, c.confidence, str(c.source_path), c.recommended_action, str(c.manager_card_descriptor)],
      );
    }

    // ── Document modules ───────────────────────────────────────────────
    const modules: Array<[string, string, unknown]> = [
      [ACCOUNT_ID, "iap_metadata", {
        ...library.metadata,
        loop_run: intelligence.report_metadata,
        source_package: "METRIX_IAP_REPLIT_PACKAGE (Bookster BOOK0 + BOOK2, 2026-05-02 → 2026-07-07)",
        book2_provenance_note: "Book2 creative cells are a documented best-effort reconstruction mapped from filenames/ad names and visual deconstruction — the base Local Client Library is Book0/current-state based and contains no BOOK2 references.",
      }],
      [ACCOUNT_ID, "core_reanalysis_read", library.core_reanalysis_read],
      [ACCOUNT_ID, "report_builder", bookster?.iap?.report_builder ?? null],
      [ACCOUNT_ID, "mst", {
        status: bookster?.mst?.status ?? "active",
        render_policy: bookster?.mst?.render_policy ?? null,
        historical_matrix_4x4: bookster?.mst?.historical_matrix_4x4 ?? null,
        source_artifacts: bookster?.mst?.source_artifacts ?? [],
      }],
      ["skov_pet", "mst", skov?.mst ?? { status: "not_available" }],
    ];
    for (const [account, module, payload] of modules) {
      await q(
        `insert into account_modules (account_id, module, payload) values ($1,$2,$3)
         on conflict (account_id, module) do update set payload = excluded.payload`,
        [account, module, JSON.stringify(payload)],
      );
    }

    // ── App config ─────────────────────────────────────────────────────
    await q(`insert into app_config (key, value) values ('app_defaults',$1)`,
      [JSON.stringify(seed.app_defaults)]);
    await q(`insert into app_config (key, value) values ('manager_account_meta',$1)`,
      [JSON.stringify({
        id: seed.manager_account.id,
        name: seed.manager_account.name,
        type: seed.manager_account.type,
        overview_mode: seed.manager_account.overview_mode,
      })]);
    await q(`insert into app_config (key, value) values ('generated_at',$1)`,
      [JSON.stringify(new Date().toISOString().slice(0, 10))]);
    await q(`insert into app_config (key, value) values ('integrity_note',$1)`,
      [JSON.stringify("Assembled from Supabase tables imported from the real Bookster IAP loop package (BOOK0 + BOOK2, 2026-05-02 → 2026-07-07). Do not fabricate missing values; unavailable fields render as unconfigured or pending.")]);

    // ── IAP loop stage bookkeeping — honest pending states ─────────────
    const runs: Array<[string, string, string | null]> = [
      ["bundle_prep", "complete", "normalized_data_bundle.json"],
      ["analysis_core", "complete", "campaign_intelligence.json"],
      ["strategy_map", "complete", "strategic_map.json"],
      ["brief_builder", "complete", "creative_briefs.json"],
      ["creative_scan", "pending", null],
      ["optimization_loop", "pending", null],
    ];
    const pendingNotes: Record<string, string> = {
      creative_scan: "Not yet run — requires raw Meta exports with real ad_id (copy/demographic/placement breakdowns) covering the same window.",
      optimization_loop: "Not yet run — golden-formula output requires the Creative Scan / Test Engine stage plus raw Meta exports with real ad_id.",
    };
    for (const [stage, status, source] of runs) {
      await q(
        `insert into iap_runs (account_id, stage, status, window_start, window_end, generated_at, source_file, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ACCOUNT_ID, stage, status, WINDOW_START, WINDOW_END,
          status === "complete" ? (intelligence.report_metadata?.date_range?.end ?? WINDOW_END) : null,
          source, pendingNotes[stage] ?? null],
      );
    }

    // ── LittleData second account (same transaction) ──────────────────
    const ldAdPerfCount = await importLittleData(q);
    console.log(`LittleData: imported ${ldAdPerfCount} ad_performance rows for account '${LD_ACCOUNT_ID}'.`);

    await q("commit");

    // ── Report ─────────────────────────────────────────────────────────
    const counts = await client.query(`
      select 'ad_performance' t, count(*) n from ad_performance where account_id='bookster'
      union all select 'ads', count(*) from ads where account_id='bookster'
      union all select 'ad_performance (littledata)', count(*) from ad_performance where account_id='littledata'
      union all select 'ads (littledata)', count(*) from ads where account_id='littledata'
      union all select 'library_cell_performance (littledata)', count(*) from library_cell_performance where account_id='littledata'
      union all select 'concept_performance (littledata)', count(*) from concept_performance where account_id='littledata'
      union all select 'iap_runs (littledata)', count(*) from iap_runs where account_id='littledata'
      union all select 'demographic_performance', count(*) from demographic_performance
      union all select 'placement_performance', count(*) from placement_performance
      union all select 'platform_performance', count(*) from platform_performance
      union all select 'device_performance', count(*) from device_performance
      union all select 'concept_performance', count(*) from concept_performance
      union all select 'concept_intelligence', count(*) from concept_intelligence
      union all select 'ad_traffic_quality', count(*) from ad_traffic_quality
      union all select 'failure_patterns', count(*) from failure_patterns
      union all select 'icp_profiles', count(*) from icp_profiles
      union all select 'message_pillars', count(*) from message_pillars
      union all select 'testing_hypotheses', count(*) from testing_hypotheses
      union all select 'imported_creative_briefs', count(*) from imported_creative_briefs
      union all select 'library_cells', count(*) from library_cells
      union all select 'library_cell_performance', count(*) from library_cell_performance
      union all select 'variable_performance', count(*) from variable_performance
      union all select 'demographic_signal', count(*) from demographic_signal
      union all select 'placement_signal', count(*) from placement_signal
      union all select 'copy_library', count(*) from copy_library
      union all select 'signal_cards', count(*) from signal_cards
      union all select 'variable_registry', count(*) from variable_registry
      union all select 'iap_runs', count(*) from iap_runs
      order by 1`);
    console.log(`Imported ${adPerfCount} ad_performance rows. Table counts:`);
    for (const row of counts.rows) console.log(`  ${row.t}: ${row.n}`);
    console.log("Import complete.");
  } catch (err) {
    await q("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
