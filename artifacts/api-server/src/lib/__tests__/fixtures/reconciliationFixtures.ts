// Synthetic Meta export fixtures reproducing the VALIDATED structures and
// totals from the 2026-09-02 tester run (docs/specs/iap-multi-report-
// reconciliation.md §1 and §17). No client CSV is committed: every file here
// is generated deterministically from a seed, with integer-cent allocation so
// the sums are exact, not approximately equal.
//
// The account: 44 Ad IDs under 19 ad names (names are reused, as observed),
// CAD, window 2026-08-01 → 2026-08-30.
//
//   reconciled demographic  Ad ID × Age × Gender × period   643 rows, 44 ads,
//                           4,405.61 — 100% of every additive metric
//   partial demographic     Day × Ad ID × Age × Gender × Text  5,997 rows,
//                           34 ads, 2,645.74 (60.05%), 10 ads absent (483.14),
//                           1,276.73 under-reported within present ads;
//                           impressions 32.36%, link clicks 57.11%,
//                           purchases 77.78%
//   ad summary              per Ad ID (or per name when `withAdId: false`)
//   placement               Day × Ad ID × Platform × Placement × Device
//
// Per-ad truth is one object (`fixtureTruth`) and every file derives from it,
// so the files reconcile with each other by construction — which is what
// makes a 100% assertion meaningful and a 60.05% assertion exact.

export const FIXTURE_CURRENCY = "CAD";
export const FIXTURE_ACCOUNT_ID = "1234567890123";
export const FIXTURE_WINDOW = { start: "2026-08-01", end: "2026-08-30" } as const;

export const AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export const GENDERS = ["female", "male", "unknown"] as const;

/** Five primary texts shared across ads — content identity must recognise reuse. */
export const TEXT_POOL = [
  "Stop guessing what your dog needs. Vet-formulated, delivered monthly.",
  "Real meat first. No fillers. Your pup will notice the difference.",
  "Try the first box for 50% off — cancel anytime.",
  "Rated 4.9 by 12,000 pet parents. See why.",
  "Picky eater? Our recipes are made to be finished.",
] as const;

export const HEADLINE_POOL = ["50% off your first box", "Vet-formulated fresh food", "Free shipping this week"] as const;

export interface FixtureAd {
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  adSetId: string;
  adSetName: string;
  /** The ten ads the partial (Text-broken-down) export omitted entirely. */
  omittedFromPartial: boolean;
  primaryText: string;
  headline: string;
  imageName: string | null;
  videoName: string | null;
}

export interface AdTruth {
  spendCents: number;
  impressions: number;
  reach: number;
  clicksAll: number;
  linkClicks: number;
  landingPageViews: number;
  addsToCart: number;
  checkouts: number;
  purchases: number;
  purchaseValueCents: number;
}

/** Account-level truth — Meta's own totals row on the validated exports. */
export const ACCOUNT_TRUTH = {
  spendCents: 440_561,
  impressions: 320_430,
  reach: 175_302,
  clicksAll: 2_071,
  linkClicks: 1_350,
  landingPageViews: 700,
  addsToCart: 60,
  checkouts: 30,
  purchases: 18,
  purchaseValueCents: 123_456,
} as const;

/** What the partial export observed, per metric — the validated coverage figures. */
export const PARTIAL_OBSERVED = {
  spendCents: 264_574, // 60.05%
  impressions: 103_687, // 32.36%
  reach: 86_221, // summed rows; not additive, never reconciled
  clicksAll: 1_238,
  linkClicks: 771, // 57.11%
  landingPageViews: 400,
  addsToCart: 40,
  checkouts: 20,
  purchases: 14, // 77.78%
  purchaseValueCents: 96_000,
  rows: 5_997,
  ads: 34,
  omittedAdsSpendCents: 48_314, // 483.14 across the 10 absent ads
  underReportedWithinPresentCents: 127_673, // 1,276.73
} as const;

// ─── Deterministic helpers ─────────────────────────────────────────────────

/** Park–Miller LCG; the same seed always yields the same sequence. */
export function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * Splits an integer total across weights by largest remainder, so the parts
 * always sum exactly to the total. Zero weights get zero.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i]! += 1;
    remainder -= 1;
  }
  return floors;
}

const cents = (c: number): string => (c / 100).toFixed(2);

const q = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
export const csvLine = (cells: readonly string[]): string => cells.map(q).join(",");

function dayOf(offset: number): string {
  const d = new Date(Date.UTC(2026, 7, 1 + offset));
  return d.toISOString().slice(0, 10);
}

// ─── The account ───────────────────────────────────────────────────────────

const AD_NAMES = [
  "C1A_HK_Question_FW_PAS_TN_Warm",
  "C1B_HK_Stat_FW_PAS_TN_Warm",
  "C2A_HK_Question_FW_AIDA_TN_Direct",
  "C2B_HK_Story_FW_AIDA_TN_Direct",
  "C3A_HK_Offer_FW_BAB_TN_Playful",
  "C3B_HK_Offer_FW_BAB_TN_Warm",
  "C4A_HK_Proof_FW_PAS_TN_Direct",
  "C4B_HK_Proof_FW_AIDA_TN_Warm",
  "C5A_HK_Question_FW_BAB_TN_Playful",
  "C5B_HK_Stat_FW_BAB_TN_Direct",
  "C6A_HK_Story_FW_PAS_TN_Playful",
  "C6B_HK_Story_FW_BAB_TN_Warm",
  "C7A_HK_Offer_FW_AIDA_TN_Playful",
  "C7B_HK_Proof_FW_BAB_TN_Direct",
  "C8A_HK_Question_FW_AIDA_TN_Warm",
  "C8B_HK_Stat_FW_PAS_TN_Playful",
  "C9A_HK_Story_FW_AIDA_TN_Direct",
  "C9B_HK_Offer_FW_PAS_TN_Direct",
  "C10A_HK_Proof_FW_AIDA_TN_Playful",
] as const;

/** 44 ads under 19 names: names 0–6 carry three instances, the rest two. */
export function fixtureAds(): FixtureAd[] {
  const ads: FixtureAd[] = [];
  for (let i = 0; i < 44; i++) {
    const nameIdx = i % 19;
    const campaign = i % 3;
    const adSet = i % 5;
    ads.push({
      adId: `12034${String(i).padStart(2, "0")}000${nameIdx}`,
      adName: AD_NAMES[nameIdx]!,
      campaignId: `6000${campaign}`,
      campaignName: ["Prospecting - Broad", "Retargeting - 30d", "Prospecting - LAL"][campaign]!,
      adSetId: `7000${adSet}`,
      adSetName: `AS${adSet + 1}`,
      omittedFromPartial: i >= 34,
      primaryText: TEXT_POOL[i % TEXT_POOL.length]!,
      headline: HEADLINE_POOL[i % HEADLINE_POOL.length]!,
      imageName: i % 2 === 0 ? `${AD_NAMES[nameIdx]}_image.png` : null,
      videoName: i % 2 === 1 ? `${AD_NAMES[nameIdx]}_video.mp4` : null,
    });
  }
  return ads;
}

/** Per-ad truth, summing exactly to ACCOUNT_TRUTH. Ads 34–43 sum to 483.14. */
export function fixtureTruth(): Map<string, AdTruth> {
  const ads = fixtureAds();
  const rnd = seededRandom(20260902);
  const weights = ads.map(() => 50 + Math.floor(rnd() * 100));
  const present = ads.map((a, i) => (a.omittedFromPartial ? 0 : weights[i]!));
  const omitted = ads.map((a, i) => (a.omittedFromPartial ? weights[i]! : 0));
  const spendPresent = allocate(ACCOUNT_TRUTH.spendCents - PARTIAL_OBSERVED.omittedAdsSpendCents, present);
  const spendOmitted = allocate(PARTIAL_OBSERVED.omittedAdsSpendCents, omitted);
  const impressions = allocate(ACCOUNT_TRUTH.impressions, weights);
  const clicksAll = allocate(ACCOUNT_TRUTH.clicksAll, weights);
  const linkClicks = allocate(ACCOUNT_TRUTH.linkClicks, weights);
  const lpv = allocate(ACCOUNT_TRUTH.landingPageViews, weights);
  const atc = allocate(ACCOUNT_TRUTH.addsToCart, weights);
  const checkouts = allocate(ACCOUNT_TRUTH.checkouts, weights);
  const purchases = allocate(ACCOUNT_TRUTH.purchases, weights);
  const purchaseValue = allocate(ACCOUNT_TRUTH.purchaseValueCents, purchases);
  const truth = new Map<string, AdTruth>();
  ads.forEach((ad, i) => {
    truth.set(ad.adId, {
      spendCents: spendPresent[i]! + spendOmitted[i]!,
      impressions: impressions[i]!,
      reach: Math.round(impressions[i]! * 0.55),
      clicksAll: clicksAll[i]!,
      linkClicks: linkClicks[i]!,
      landingPageViews: lpv[i]!,
      addsToCart: atc[i]!,
      checkouts: checkouts[i]!,
      purchases: purchases[i]!,
      purchaseValueCents: purchaseValue[i]!,
    });
  });
  return truth;
}

// ─── Column layouts ────────────────────────────────────────────────────────

export const METRIC_HEADERS = [
  `Amount spent (${FIXTURE_CURRENCY})`,
  "Reach",
  "Impressions",
  "Result type",
  "Result value type",
  "Results",
  "Clicks (all)",
  "Link clicks",
  "Landing page views",
  "Adds to cart",
  "Checkouts initiated",
  "Purchases",
  "Website purchases conversion value",
] as const;

interface MetricCells {
  spendCents: number;
  reach: number | null;
  impressions: number;
  resultType: string;
  results: number;
  clicksAll: number;
  linkClicks: number;
  landingPageViews: number;
  addsToCart: number;
  checkouts: number;
  purchases: number;
  purchaseValueCents: number;
}

function metricCells(m: MetricCells): string[] {
  return [
    cents(m.spendCents),
    m.reach === null ? "" : String(m.reach),
    String(m.impressions),
    m.resultType,
    "",
    String(m.results),
    String(m.clicksAll),
    String(m.linkClicks),
    String(m.landingPageViews),
    String(m.addsToCart),
    String(m.checkouts),
    String(m.purchases),
    cents(m.purchaseValueCents),
  ];
}

export type DuplicateHeaderMode = "none" | "identical" | "conflicting";

export interface DemographicFixtureOptions {
  /** `reconciled` = Ad ID × Age × Gender × period; `partial` = Day × Ad ID × Age × Gender × Text. */
  grain: "reconciled" | "partial";
  duplicateHeaders?: DuplicateHeaderMode;
  currency?: string;
  accountId?: string;
  /** Drop the Ad ID column entirely (name-keyed export). */
  withAdId?: boolean;
  /** Give half the ads a "Link clicks" result type with results = link clicks. */
  mixedResultTypes?: boolean;
  /** Restrict to a subset of ads (overlap / batch tests). */
  adFilter?: (ad: FixtureAd, index: number) => boolean;
  /** Append Meta's grand-totals row (Day blank). Default true. */
  totalsRow?: boolean;
}

const resultTypeFor = (i: number, mixed: boolean | undefined): "Purchases" | "Link clicks" =>
  mixed && i % 2 === 1 ? "Link clicks" : "Purchases";

/** Distributes one ad's truth across `n` rows by seeded weights; every metric sums exactly. */
function splitTruth(truth: AdTruth, n: number, rnd: () => number, scale = 1): MetricCells[] {
  const w = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 20));
  const scaled = (v: number): number => Math.round(v * scale);
  const spend = allocate(scaled(truth.spendCents), w);
  const impressions = allocate(scaled(truth.impressions), w);
  const clicksAll = allocate(scaled(truth.clicksAll), w);
  const linkClicks = allocate(scaled(truth.linkClicks), w);
  const lpv = allocate(scaled(truth.landingPageViews), w);
  const atc = allocate(scaled(truth.addsToCart), w);
  const checkouts = allocate(scaled(truth.checkouts), w);
  const purchases = allocate(scaled(truth.purchases), w);
  const purchaseValue = allocate(scaled(truth.purchaseValueCents), purchases.map((p) => p || 0));
  return w.map((_, r) => ({
    spendCents: spend[r]!,
    reach: Math.round(impressions[r]! * 0.8),
    impressions: impressions[r]!,
    resultType: "Purchases",
    results: purchases[r]!,
    clicksAll: clicksAll[r]!,
    linkClicks: linkClicks[r]!,
    landingPageViews: lpv[r]!,
    addsToCart: atc[r]!,
    checkouts: checkouts[r]!,
    purchases: purchases[r]!,
    purchaseValueCents: purchaseValue[r]!,
  }));
}

/** The 18 age × gender combos, rotated per ad so ads differ in which cells they carry. */
function segmentCombos(adIndex: number, count: number): { age: string; gender: string }[] {
  const all: { age: string; gender: string }[] = [];
  for (const age of AGE_BANDS) for (const gender of GENDERS) all.push({ age, gender });
  const rotated = [...all.slice(adIndex % all.length), ...all.slice(0, adIndex % all.length)];
  return rotated.slice(0, count);
}

function applyResultType(cells: MetricCells, type: "Purchases" | "Link clicks"): MetricCells {
  return type === "Purchases" ? cells : { ...cells, resultType: "Link clicks", results: cells.linkClicks };
}

/**
 * Builds the demographic export text. Reconciled: 643 rows (27 ads × 15
 * combos + 17 ads × 14), whole-period via "Reporting starts"/"Reporting
 * ends", totals row equal to ACCOUNT_TRUTH. Partial: 5,997 rows (13 ads ×
 * 177 + 21 ads × 176), Day × Text, present-ad metrics scaled to the validated
 * observed totals, totals row still ACCOUNT_TRUTH.
 */
export function buildDemographicCsv(opts: DemographicFixtureOptions): string {
  const ads = fixtureAds();
  const truth = fixtureTruth();
  const currency = opts.currency ?? FIXTURE_CURRENCY;
  const withAdId = opts.withAdId ?? true;
  const dupMode = opts.duplicateHeaders ?? "none";
  const rnd = seededRandom(opts.grain === "partial" ? 8_121 : 6_433);

  const breakdownHeader =
    opts.grain === "reconciled"
      ? ["Reporting starts", "Reporting ends", "Account ID", "Campaign ID", "Campaign name", "Ad set ID", "Ad set name", ...(withAdId ? ["Ad ID"] : []), "Ad name", "Gender", "Age"]
      : ["Day", "Account ID", "Campaign ID", "Campaign name", "Ad set ID", "Ad set name", ...(withAdId ? ["Ad ID"] : []), "Ad name", "Gender", "Age", "Text"];
  const metricHeader = METRIC_HEADERS.map((h) => h.replace(FIXTURE_CURRENCY, currency));
  const dupHeader = dupMode === "none" ? [] : ["Result value type", ...(withAdId ? ["Ad ID"] : []), "Ad name"];
  const header = [...breakdownHeader, ...metricHeader, ...dupHeader];

  const lines: string[] = [csvLine(header)];
  const accountId = opts.accountId ?? FIXTURE_ACCOUNT_ID;

  const pushRow = (ad: FixtureAd, dims: string[], cells: MetricCells, rowIndex: number): void => {
    const dupCells =
      dupMode === "none"
        ? []
        : dupMode === "identical"
        ? ["", ...(withAdId ? [ad.adId] : []), ad.adName]
        : ["", ...(withAdId ? [rowIndex % 7 === 3 ? `${ad.adId}9` : ad.adId] : []), rowIndex % 11 === 5 ? `${ad.adName}_dup` : ad.adName];
    lines.push(csvLine([...dims, ...metricCells(cells), ...dupCells]));
  };

  let rowIndex = 0;
  ads.forEach((ad, i) => {
    if (opts.adFilter && !opts.adFilter(ad, i)) return;
    const adTruth = truth.get(ad.adId)!;
    const type = resultTypeFor(i, opts.mixedResultTypes);
    if (opts.grain === "reconciled") {
      const combos = segmentCombos(i, i < 27 ? 15 : 14);
      const cells = splitTruth(adTruth, combos.length, rnd);
      combos.forEach((seg, r) => {
        const dims = [FIXTURE_WINDOW.start, FIXTURE_WINDOW.end, accountId, ad.campaignId, ad.campaignName, ad.adSetId, ad.adSetName, ...(withAdId ? [ad.adId] : []), ad.adName, seg.gender, seg.age];
        pushRow(ad, dims, applyResultType(cells[r]!, type), rowIndex++);
      });
      return;
    }
    if (ad.omittedFromPartial) return;
    const n = i < 13 ? 177 : 176;
    const combos = segmentCombos(i, 12);
    const texts = [TEXT_POOL[i % TEXT_POOL.length]!, TEXT_POOL[(i + 2) % TEXT_POOL.length]!];
    // Present-ad metrics at the validated observed share of truth, allocated
    // per metric so each coverage figure is its own number (spec §1).
    const partial = partialTruthFor(ad.adId);
    const cells = splitTruth(partial, n, rnd).map((c) => ({ ...c, reach: Math.round(c.impressions * 0.83) }));
    let r = 0;
    outer: for (const seg of combos) {
      for (const text of texts) {
        for (let day = 0; day < 30; day++) {
          if (r >= n) break outer;
          const dims = [dayOf(day), accountId, ad.campaignId, ad.campaignName, ad.adSetId, ad.adSetName, ...(withAdId ? [ad.adId] : []), ad.adName, seg.gender, seg.age, text];
          pushRow(ad, dims, applyResultType(cells[r]!, type), rowIndex++);
          r += 1;
        }
      }
    }
  });

  if (opts.totalsRow ?? true) {
    const blanks = breakdownHeader.map(() => "");
    const totals = metricCells({
      spendCents: ACCOUNT_TRUTH.spendCents,
      reach: ACCOUNT_TRUTH.reach,
      impressions: ACCOUNT_TRUTH.impressions,
      resultType: "",
      results: ACCOUNT_TRUTH.purchases,
      clicksAll: ACCOUNT_TRUTH.clicksAll,
      linkClicks: ACCOUNT_TRUTH.linkClicks,
      landingPageViews: ACCOUNT_TRUTH.landingPageViews,
      addsToCart: ACCOUNT_TRUTH.addsToCart,
      checkouts: ACCOUNT_TRUTH.checkouts,
      purchases: ACCOUNT_TRUTH.purchases,
      purchaseValueCents: ACCOUNT_TRUTH.purchaseValueCents,
    });
    lines.push(csvLine([...blanks, ...totals, ...dupHeader.map(() => "")]));
  }
  return lines.join("\n") + "\n";
}

/**
 * The partial export's per-ad observed metrics: each account-level observed
 * total allocated across the 34 present ads in proportion to their truth, so
 * every present ad stays at or below its truth and the sums hit the
 * validated figures exactly.
 */
export function partialTruth(): Map<string, AdTruth> {
  const ads = fixtureAds().filter((a) => !a.omittedFromPartial);
  const truth = fixtureTruth();
  const by = (pick: (t: AdTruth) => number, total: number): number[] =>
    allocate(total, ads.map((a) => pick(truth.get(a.adId)!)));
  const spend = by((t) => t.spendCents, PARTIAL_OBSERVED.spendCents);
  const impressions = by((t) => t.impressions, PARTIAL_OBSERVED.impressions);
  const clicksAll = by((t) => t.clicksAll, PARTIAL_OBSERVED.clicksAll);
  const linkClicks = by((t) => t.linkClicks, PARTIAL_OBSERVED.linkClicks);
  const lpv = by((t) => t.landingPageViews, PARTIAL_OBSERVED.landingPageViews);
  const atc = by((t) => t.addsToCart, PARTIAL_OBSERVED.addsToCart);
  const checkouts = by((t) => t.checkouts, PARTIAL_OBSERVED.checkouts);
  const purchases = by((t) => t.purchases, PARTIAL_OBSERVED.purchases);
  const purchaseValue = allocate(PARTIAL_OBSERVED.purchaseValueCents, purchases);
  const out = new Map<string, AdTruth>();
  ads.forEach((ad, i) => {
    out.set(ad.adId, {
      spendCents: spend[i]!,
      impressions: impressions[i]!,
      reach: 0,
      clicksAll: clicksAll[i]!,
      linkClicks: linkClicks[i]!,
      landingPageViews: lpv[i]!,
      addsToCart: atc[i]!,
      checkouts: checkouts[i]!,
      purchases: purchases[i]!,
      purchaseValueCents: purchaseValue[i]!,
    });
  });
  return out;
}

const partialTruthCache = new Map<string, AdTruth>();
function partialTruthFor(adId: string): AdTruth {
  if (partialTruthCache.size === 0) for (const [k, v] of partialTruth()) partialTruthCache.set(k, v);
  return partialTruthCache.get(adId)!;
}

// ─── Ad Summary ────────────────────────────────────────────────────────────

export interface AdSummaryFixtureOptions {
  withAdId?: boolean;
  /** Daily rows (time_series) instead of one whole-period row per ad. */
  daily?: boolean;
  currency?: string;
  accountId?: string;
  withCreativeColumns?: boolean;
  mixedResultTypes?: boolean;
}

/**
 * The Ad Summary ledger: one row per Ad ID over the period (or per day when
 * `daily`), carrying the configured creative columns Meta's Ads Manager
 * export emits. `withAdId: false` reproduces the tester's export — name-keyed,
 * which under 19 reused names cannot be per-ad truth.
 */
export function buildAdSummaryCsv(opts: AdSummaryFixtureOptions = {}): string {
  const ads = fixtureAds();
  const truth = fixtureTruth();
  const withAdId = opts.withAdId ?? true;
  const currency = opts.currency ?? FIXTURE_CURRENCY;
  const accountId = opts.accountId ?? FIXTURE_ACCOUNT_ID;
  const creative = opts.withCreativeColumns ?? true;
  const rnd = seededRandom(9_901);
  const header = [
    "Reporting starts",
    "Reporting ends",
    "Account ID",
    ...(withAdId ? ["Ad ID"] : []),
    "Ad name",
    "Ad set name",
    ...METRIC_HEADERS.map((h) => h.replace(FIXTURE_CURRENCY, currency)),
    ...(creative
      ? ["Ad creative body text", "Ad creative headline", "Ad creative call to action type", "Ad creative link destination", "Image name", "Video name"]
      : []),
  ];
  const lines = [csvLine(header)];
  const creativeCells = (ad: FixtureAd): string[] =>
    creative ? [ad.primaryText, ad.headline, "SHOP_NOW", "https://example.test/shop", ad.imageName ?? "", ad.videoName ?? ""] : [];

  if (withAdId) {
    ads.forEach((ad, i) => {
      const t = truth.get(ad.adId)!;
      const type = resultTypeFor(i, opts.mixedResultTypes);
      if (opts.daily) {
        const perDay = splitTruth(t, 30, rnd);
        perDay.forEach((cells, d) => {
          lines.push(csvLine([dayOf(d), dayOf(d), accountId, ad.adId, ad.adName, ad.adSetName, ...metricCells(applyResultType({ ...cells, reach: null }, type)), ...creativeCells(ad)]));
        });
      } else {
        const cells: MetricCells = { ...t, reach: t.reach, resultType: "Purchases", results: t.purchases };
        lines.push(csvLine([FIXTURE_WINDOW.start, FIXTURE_WINDOW.end, accountId, ad.adId, ad.adName, ad.adSetName, ...metricCells(applyResultType(cells, type)), ...creativeCells(ad)]));
      }
    });
  } else {
    // Name-keyed: Ads Manager sums the instances that share a name.
    const byName = new Map<string, { ad: FixtureAd; t: AdTruth }>();
    ads.forEach((ad) => {
      const t = truth.get(ad.adId)!;
      const cur = byName.get(ad.adName);
      if (!cur) byName.set(ad.adName, { ad, t: { ...t } });
      else {
        cur.t.spendCents += t.spendCents;
        cur.t.impressions += t.impressions;
        cur.t.reach += t.reach;
        cur.t.clicksAll += t.clicksAll;
        cur.t.linkClicks += t.linkClicks;
        cur.t.landingPageViews += t.landingPageViews;
        cur.t.addsToCart += t.addsToCart;
        cur.t.checkouts += t.checkouts;
        cur.t.purchases += t.purchases;
        cur.t.purchaseValueCents += t.purchaseValueCents;
      }
    });
    for (const { ad, t } of byName.values()) {
      const cells: MetricCells = { ...t, reach: t.reach, resultType: "Purchases", results: t.purchases };
      lines.push(csvLine([FIXTURE_WINDOW.start, FIXTURE_WINDOW.end, accountId, ad.adName, ad.adSetName, ...metricCells(cells), ...creativeCells(ad)]));
    }
  }
  return lines.join("\n") + "\n";
}

// ─── Placement ─────────────────────────────────────────────────────────────

export const PLACEMENT_COMBOS = [
  { platform: "facebook", placement: "feed", device: "iphone" },
  { platform: "facebook", placement: "feed", device: "android_smartphone" },
  { platform: "instagram", placement: "instagram_stories", device: "iphone" },
  { platform: "instagram", placement: "instagram_reels", device: "android_smartphone" },
  { platform: "instagram", placement: "feed", device: "desktop" },
  { platform: "audience_network", placement: "rewarded_video", device: "android_smartphone" },
] as const;

export interface PlacementFixtureOptions {
  days?: number;
  currency?: string;
  accountId?: string;
  withAdId?: boolean;
  duplicateHeaders?: DuplicateHeaderMode;
  adFilter?: (ad: FixtureAd, index: number) => boolean;
}

/** Day × Ad ID × Platform × Placement × Device, per-ad truth split across `days` × 6 combos. */
export function buildPlacementCsv(opts: PlacementFixtureOptions = {}): string {
  const ads = fixtureAds();
  const truth = fixtureTruth();
  const days = opts.days ?? 5;
  const withAdId = opts.withAdId ?? true;
  const currency = opts.currency ?? FIXTURE_CURRENCY;
  const accountId = opts.accountId ?? FIXTURE_ACCOUNT_ID;
  const dupMode = opts.duplicateHeaders ?? "none";
  const rnd = seededRandom(4_242);
  const dupHeader = dupMode === "none" ? [] : ["Result value type", ...(withAdId ? ["Ad ID"] : []), "Ad name"];
  const header = [
    "Day",
    "Account ID",
    "Campaign ID",
    "Campaign name",
    "Ad set ID",
    "Ad set name",
    ...(withAdId ? ["Ad ID"] : []),
    "Ad name",
    "Impression device",
    "Platform",
    "Placement",
    ...METRIC_HEADERS.map((h) => h.replace(FIXTURE_CURRENCY, currency)),
    ...dupHeader,
  ];
  const lines = [csvLine(header)];
  ads.forEach((ad, i) => {
    if (opts.adFilter && !opts.adFilter(ad, i)) return;
    const cells = splitTruth(truth.get(ad.adId)!, days * PLACEMENT_COMBOS.length, rnd);
    let r = 0;
    for (let d = 0; d < days; d++) {
      for (const combo of PLACEMENT_COMBOS) {
        const dup = dupMode === "none" ? [] : ["", ...(withAdId ? [ad.adId] : []), ad.adName];
        lines.push(
          csvLine([
            dayOf(d),
            accountId,
            ad.campaignId,
            ad.campaignName,
            ad.adSetId,
            ad.adSetName,
            ...(withAdId ? [ad.adId] : []),
            ad.adName,
            combo.device,
            combo.platform,
            combo.placement,
            ...metricCells({ ...cells[r]!, reach: null }),
            ...dup,
          ]),
        );
        r += 1;
      }
    }
  });
  return lines.join("\n") + "\n";
}

// ─── Asset-only (Ad ID × Text) ─────────────────────────────────────────────

/**
 * A "by asset" pivot without demographic dimensions: Ad ID × Text over the
 * period. Two texts per ad, the second shared with another ad (content
 * identity). Sums to truth for the ads it covers.
 */
export function buildAssetCsv(opts: { adFilter?: (ad: FixtureAd, index: number) => boolean; currency?: string } = {}): string {
  const ads = fixtureAds();
  const truth = fixtureTruth();
  const currency = opts.currency ?? FIXTURE_CURRENCY;
  const rnd = seededRandom(7_777);
  const header = ["Reporting starts", "Reporting ends", "Account ID", "Campaign name", "Ad ID", "Ad name", "Text", ...METRIC_HEADERS.map((h) => h.replace(FIXTURE_CURRENCY, currency))];
  const lines = [csvLine(header)];
  ads.forEach((ad, i) => {
    if (opts.adFilter && !opts.adFilter(ad, i)) return;
    const texts = [TEXT_POOL[i % TEXT_POOL.length]!, TEXT_POOL[(i + 2) % TEXT_POOL.length]!];
    const cells = splitTruth(truth.get(ad.adId)!, texts.length, rnd);
    texts.forEach((text, r) => {
      lines.push(csvLine([FIXTURE_WINDOW.start, FIXTURE_WINDOW.end, FIXTURE_ACCOUNT_ID, ad.campaignName, ad.adId, ad.adName, text, ...metricCells({ ...cells[r]!, reach: null })]));
    });
  });
  return lines.join("\n") + "\n";
}

// ─── The $100 copy scenario (spec §10a, §17a) ──────────────────────────
//
// Ad 001: authoritative spend $100. A pivot broken down by Text reports
// Text A $40 and Text B $50 — $90 covered, $10 unattributed to copy. The
// same file carries Headline and Description columns whose values never
// change within the ad: creative metadata beside the real breakdown, not a
// breakdown of their own.

export const COPY_AD = { adId: "9001", adName: "C1A_HK_Question_FW_PAS_TN_Warm", campaign: "Prospecting - Broad", adSet: "AS1" } as const;
export const COPY_TEXT_A = "Text A — stop guessing what your dog needs.";
export const COPY_TEXT_B = "Text B — real meat first, no fillers.";
export const COPY_HEADLINE_X = "Headline X";
export const COPY_DESCRIPTION_P = "Description P";

const copyMetricHeader = (currency = FIXTURE_CURRENCY): string[] => [`Amount spent (${currency})`, "Impressions", "Result type", "Results", "Clicks (all)", "Link clicks", "Purchases"];

/** Ad Summary: one row, $100, 10,000 impressions, 500 clicks, 20 purchases. */
export function buildCopyAdSummaryCsv(opts: { currency?: string; attribution?: string; resultType?: string; adId?: string } = {}): string {
  const currency = opts.currency ?? FIXTURE_CURRENCY;
  const header = ["Reporting starts", "Reporting ends", "Account ID", "Attribution setting", "Ad ID", "Ad name", "Ad set name", ...copyMetricHeader(currency), "Ad creative body text", "Ad creative headline", "Ad creative description", "Ad creative call to action type"];
  const row = [FIXTURE_WINDOW.start, FIXTURE_WINDOW.end, FIXTURE_ACCOUNT_ID, opts.attribution ?? "7-day click, 1-day view", opts.adId ?? COPY_AD.adId, COPY_AD.adName, COPY_AD.adSet, "100.00", "10000", opts.resultType ?? "Purchases", "20", "500", "480", "20", COPY_TEXT_A, COPY_HEADLINE_X, COPY_DESCRIPTION_P, "SHOP_NOW"];
  return [csvLine(header), csvLine(row)].join("\n") + "\n";
}

export interface CopyPivotOptions {
  /** Headline / Description vary WITH the text (a delivered combination) instead of staying constant. */
  headlineVaries?: boolean;
  /** Add Age × Gender to every row (a demographic × copy joint report). */
  withDemographics?: boolean;
  currency?: string;
  attribution?: string;
  resultType?: string;
  /** Scale every metric so the rows exceed the truth (an overlapping export). */
  scale?: number;
}

/**
 * Text pivot: Text A $40 / 8,000 impressions / 250 clicks / 8 purchases,
 * Text B $50 / 0 impressions? — no: B carries 0 impressions would be odd;
 * B: 0 → keep the validated shape: impressions 8,000 total (80%), clicks 480
 * total (96%), purchases 12 total (60%) across A and B.
 */
export function buildCopyPivotCsv(opts: CopyPivotOptions = {}): string {
  const currency = opts.currency ?? FIXTURE_CURRENCY;
  const k = opts.scale ?? 1;
  const header = [
    "Day",
    "Account ID",
    "Attribution setting",
    "Campaign name",
    "Ad ID",
    "Ad name",
    ...(opts.withDemographics ? ["Gender", "Age"] : []),
    "Text",
    "Headline",
    "Description",
    ...copyMetricHeader(currency),
  ];
  const cells = (text: string, headline: string, description: string, spendCents: number, impressions: number, clicksAll: number, linkClicks: number, purchases: number, demo: string[] = []) => [
    FIXTURE_WINDOW.start,
    FIXTURE_ACCOUNT_ID,
    opts.attribution ?? "7-day click, 1-day view",
    COPY_AD.campaign,
    COPY_AD.adId,
    COPY_AD.adName,
    ...demo,
    text,
    headline,
    description,
    (Math.round(spendCents * k) / 100).toFixed(2),
    String(Math.round(impressions * k)),
    opts.resultType ?? "Purchases",
    String(Math.round(purchases * k)),
    String(Math.round(clicksAll * k)),
    String(Math.round(linkClicks * k)),
    String(Math.round(purchases * k)),
  ];
  const hA = COPY_HEADLINE_X;
  const hB = opts.headlineVaries ? "Headline Y" : COPY_HEADLINE_X;
  const dA = COPY_DESCRIPTION_P;
  const dB = opts.headlineVaries ? "Description Q" : COPY_DESCRIPTION_P;
  const rows = opts.withDemographics
    ? [
        cells(COPY_TEXT_A, hA, dA, 2500, 5000, 150, 140, 5, ["female", "25-34"]),
        cells(COPY_TEXT_A, hA, dA, 1500, 1500, 100, 100, 3, ["male", "25-34"]),
        cells(COPY_TEXT_B, hB, dB, 3000, 1000, 150, 150, 3, ["female", "25-34"]),
        cells(COPY_TEXT_B, hB, dB, 2000, 500, 80, 90, 1, ["male", "35-44"]),
      ]
    : [cells(COPY_TEXT_A, hA, dA, 4000, 6500, 250, 240, 8), cells(COPY_TEXT_B, hB, dB, 5000, 1500, 230, 240, 4)];
  return [csvLine(header), ...rows.map(csvLine)].join("\n") + "\n";
}

/** Demographic pivot for the copy ad: the same $90 split by Age × Gender (no Text column). */
export function buildCopyDemographicCsv(): string {
  const header = ["Day", "Account ID", "Campaign name", "Ad ID", "Ad name", "Gender", "Age", ...copyMetricHeader()];
  const rows = [
    [FIXTURE_WINDOW.start, FIXTURE_ACCOUNT_ID, COPY_AD.campaign, COPY_AD.adId, COPY_AD.adName, "female", "25-34", "55.00", "6000", "Purchases", "8", "300", "290", "8"],
    [FIXTURE_WINDOW.start, FIXTURE_ACCOUNT_ID, COPY_AD.campaign, COPY_AD.adId, COPY_AD.adName, "male", "25-34", "15.00", "1500", "Purchases", "3", "100", "100", "3"],
    [FIXTURE_WINDOW.start, FIXTURE_ACCOUNT_ID, COPY_AD.campaign, COPY_AD.adId, COPY_AD.adName, "male", "35-44", "20.00", "500", "Purchases", "1", "80", "90", "1"],
  ];
  return [csvLine(header), ...rows.map(csvLine)].join("\n") + "\n";
}

/** A daily Ad Summary where the headline changes on day 15 under the same Ad ID. */
export function buildCopyVersionedSummaryCsv(): string {
  const header = ["Day", "Account ID", "Ad ID", "Ad name", "Ad set name", ...copyMetricHeader(), "Ad creative body text", "Ad creative headline"];
  const lines = [csvLine(header)];
  for (let d = 0; d < 30; d++) {
    const day = new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10);
    const headline = d < 15 ? COPY_HEADLINE_X : "Headline Y";
    lines.push(csvLine([day, FIXTURE_ACCOUNT_ID, COPY_AD.adId, COPY_AD.adName, COPY_AD.adSet, "3.00", "300", "Purchases", "1", "15", "14", "1", COPY_TEXT_A, headline]));
  }
  return lines.join("\n") + "\n";
}

