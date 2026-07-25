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
// Second account (scripts/data/metrix/ecas/): East Coast Art Studio.
// MST Sprint 1 analysis package (normalized_data_bundle.json +
// campaign_intelligence.json + local_client_library.json) plus manual
// CSV uploads (IAP-DEMO / IAP-DEVICE, Meta ad account 1202182091204847)
// and strategy/brief stage outputs. bundle_prep, analysis_core,
// strategy_map and brief_builder are complete; creative_scan +
// optimization_loop stay honestly pending.
//
// Usage: SUPABASE_DB_URL=postgres://... pnpm --filter @workspace/scripts run import:metrix
// ═══════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  META_EXPORT_FILE,
  exportAccountMismatchError,
  loadMetaAdsExport,
  resolveLdMetaAdId,
  unmatchedExportAdNames,
} from "./metaAdsExport";
import {
  type LdConversionAgg,
  type LdSegmentAgg,
  parseCsv,
  parseLdDemoCsv,
  parseLdDeviceCsv,
  round2,
  summarizeLdDemoAds,
  summarizeLdDeviceCsv,
  verifyLdDemoReconciliation,
  verifyLdDeviceReconciliation,
} from "./ldCsv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data/metrix");

const ACCOUNT_ID = "bookster";
const WINDOW_START = "2026-05-02";
const WINDOW_END = "2026-07-07";

const ECAS_ACCOUNT_ID = "ecas";
const ECAS_DIR = join(DATA_DIR, "ecas");
const ECAS_DEMO_CSV = "IAP-DEMO-1202182091204847.csv";
const ECAS_DEVICE_CSV = "IAP-DEVICE-1202182091204847.csv";

// Historical ECAS data (May–Jun 2026) — originally imported under the provisional
// account name "City Street Print Brand" / account id "littledata". Re-imported
// under the canonical ecas account so both analysis periods live in one place.
const LD_DIR = join(DATA_DIR, "littledata");
const LD_DEMO_CSV = "IAP-DEMO-1202182091204847.csv";
const LD_DEVICE_CSV = "IAP-DEVICE-1202182091204847.csv";

function readJson(file: string): any {
  // normalized_data_bundle.json contains bare NaN tokens (source-run artifact);
  // NaN carries no value — treat as null rather than fabricating a number.
  const raw = readFileSync(join(DATA_DIR, file), "utf8");
  return JSON.parse(raw.replace(/\bNaN\b/g, "null"));
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" || Number.isNaN(v as number) ? null : Number(v);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ── Optional raw Meta export (ad-id / creative-asset backfill) ─────────
// Parsing + validation rules live in metaAdsExport.ts (pure, unit-tested
// without a live Supabase connection).

type Q = (text: string, values?: unknown[]) => Promise<pg.QueryResult>;

// Extracts a LD-CN-* concept code from a variable stack CN field.
const ldConceptCode = (v: unknown): string | null => {
  const m = /^LD-CN-[A-Z0-9-]+/.exec(String(v ?? ""));
  return m ? m[0] : null;
};

// ── Historical ECAS data (May–Jun 2026) ──────────────────────────────────────
// Originally analysed under the provisional account name "City Street Print
// Brand". Re-imported under the canonical ecas account id so both analysis
// periods — the initial May–Jun API test and the Jul MSTm Sprint 1 — live
// together in one account. The ad_accounts row is shared (upserted by
// importEcas, which runs after this function).
async function importLittleData(q: Q): Promise<number> {
  const required = [
    "normalized_data_bundle.json", "campaign_intelligence.json", "local_client_library.json",
    "strategic_map.json", "creative_briefs.json", "mst_foundation.json",
    LD_DEMO_CSV, LD_DEVICE_CSV,
  ];
  const missing = required.filter((f) => !existsSync(join(LD_DIR, f)));
  if (missing.length > 0) {
    throw new Error(`ECAS historical (littledata) package incomplete — missing ${missing.join(", ")} in ${LD_DIR}`);
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
  const ldMetaExport = loadMetaAdsExport(LD_DIR, ECAS_ACCOUNT_ID);
  const mismatch = exportAccountMismatchError(ldMetaExport.metaAdAccountId, metaAdAccountId, "ECAS historical");
  if (mismatch) throw new Error(mismatch);

  // ── Manual upload: parse + verify the IAP-DEMO CSV ──────────────────
  const csv = parseLdDemoCsv(readFileSync(join(LD_DIR, LD_DEMO_CSV), "utf8"));
  const csvAds = [...csv.ads.values()].sort((a, b) => b.spend - a.spend);
  const csvTotals = summarizeLdDemoAds(csvAds);
  const { spend: csvSpend, impressions: csvImpressions, results: csvResults,
    linkClicks: csvLinkClicks, clicksAll: csvClicksAll, addsToCart: csvAtc,
    checkoutsInitiated: csvCheckouts, purchases: csvPurchases, purchaseValue: csvPurchaseValue } = csvTotals;
  verifyLdDemoReconciliation(csvTotals, bundle.account_totals);
  const bundleAdNames = (bundle.ad_level_performance ?? []).map((r: any) => String(r.ad_name));
  const missingFromCsv = bundleAdNames.filter((name: string) => !csv.ads.has(name));
  if (missingFromCsv.length > 0) {
    throw new Error(`ECAS historical demo CSV is missing package ads: ${missingFromCsv.join(", ")}`);
  }
  console.log(
    `ECAS historical manual upload verified: ${csv.rowCount} CSV rows, ${csvAds.length} ads, ` +
    `$${csvSpend} / ${csvImpressions} imp / ${csvLinkClicks} link clicks / ${csvAtc} ATC / ${csvResults} purchases ` +
    `($${csvPurchaseValue}) — matches account totals exactly.`,
  );

  // ── Manual upload: parse + verify the IAP-DEVICE CSV (conversion) ───
  const deviceCsv = parseLdDeviceCsv(readFileSync(join(LD_DIR, LD_DEVICE_CSV), "utf8"));
  const deviceTotals = summarizeLdDeviceCsv(deviceCsv);
  const { purchases: devPurchases, checkoutsInitiated: devCheckouts, linkClicks: devLinkClicks } = deviceTotals;
  verifyLdDeviceReconciliation(deviceTotals, csvTotals);
  console.log(
    `ECAS historical device upload verified: ${deviceCsv.rowCount} rows (conversion-based tracking, window ` +
    `${deviceCsv.window.start} → ${deviceCsv.window.end}), ${devLinkClicks} link clicks across ` +
    `${deviceCsv.devices.size} conversion devices / ${deviceCsv.platforms.size} platforms / ${deviceCsv.placements.size} placements; ` +
    `${devPurchases} purchases + ${devCheckouts} checkouts match the demographic export.`,
  );

  const cpaOf = (spend: number | null, purchases: number | null): number | null =>
    spend !== null && purchases !== null && purchases > 0
      ? Math.round((spend / purchases) * 100) / 100
      : null;
  const pctOf = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.round((numerator / denominator) * 100 * 10000) / 10000 : null;
  const cpmOf = (spend: number, impressions: number): number | null =>
    impressions > 0 ? round2((spend / impressions) * 1000) : null;

  const conceptsByCode = new Map<string, any>();
  for (const c of library.local_concepts ?? []) conceptsByCode.set(c.code, c);
  const creativeByAd = new Map<string, any>();
  for (const c of library.creative_id_map ?? []) creativeByAd.set(c.ad_name, c);
  const bundleByAd = new Map<string, any>();
  for (const r of bundle.ad_level_performance ?? []) bundleByAd.set(String(r.ad_name), r);

  // ── ad_performance + ads for ALL CSV ads ────────────────────────────
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
    const confidence = str(bundleRow?.confidence) ?? (spend < 50 ? "insufficient" : "validation_required");
    const campaignName = a.campaigns.size > 0 ? [...a.campaigns].sort().join(" + ") : null;
    const adSetName = a.adSets.size > 0 ? [...a.adSets].sort().join(" + ") : null;
    const backfill = ldMetaExport.byAdName.get(a.adName) ?? null;
    const resolved = resolveLdMetaAdId(a.adIds, backfill?.metaAdId);
    const metaAdId = resolved.metaAdId;
    if (resolved.source === "export") ldBackfilledIds++;
    if (resolved.ignoredExportId) {
      console.warn(
        `ECAS historical ${META_EXPORT_FILE}: meta_ad_id ${resolved.ignoredExportId} for "${a.adName}" is not among the ` +
        `CSV-observed Ad IDs (${[...a.adIds].join(", ")}) — ignoring the export id for this ad.`,
      );
    }
    const creativeAssetUrl = backfill?.creativeAssetUrl ?? null;
    if (creativeAssetUrl) ldBackfilledAssets++;
    await q(
      `insert into ad_performance (account_id, book, campaign_name, ad_set_name, ad_name, cell, concept,
         variation, test_id, result_type, date_start, date_end, spend, impressions, reach, clicks_all,
         link_clicks, results, cpa, ctr_link_pct, cvr_link_pct, cpm, confidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [ECAS_ACCOUNT_ID, null, campaignName, adSetName, a.adName, a.adName, conceptCode, null, null, resultType,
        windowStart, windowEnd, spend, a.impressions, null, a.clicksAll, a.linkClicks, purchases,
        cpaOf(spend, purchases), pctOf(a.linkClicks, a.impressions), pctOf(purchases, a.linkClicks),
        cpmOf(spend, a.impressions), confidence],
    );
    adPerfCount++;

    await q(
      `insert into ads (account_id, ad_name, book, cell, concept, variation, test_id,
         meta_ad_id, creative_asset_url, asset_filename, asset_path, asset_servable)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [ECAS_ACCOUNT_ID, a.adName, null, a.adName, conceptCode, null, null,
        metaAdId, creativeAssetUrl, map ? str(map.asset) : null, null, Boolean(creativeAssetUrl)],
    );
  }
  if (ldMetaExport.byAdName.size > 0) {
    const unmatched = unmatchedExportAdNames(ldMetaExport.byAdName.keys(), (n) => csv.ads.has(n));
    console.log(`ECAS historical meta export backfill: ${ldBackfilledIds} ads got meta_ad_id, ${ldBackfilledAssets} got creative_asset_url.`);
    if (unmatched.length > 0) {
      console.warn(`ECAS historical ${META_EXPORT_FILE} contains ${unmatched.length} unmatched ad_name(s): ${unmatched.slice(0, 10).join(", ")}${unmatched.length > 10 ? ", …" : ""}`);
    }
  }

  // ── Per-ad library cells ─────────────────────────────────────────────
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
      [ECAS_ACCOUNT_ID, r.ad_name, resultType, windowStart, windowEnd, JSON.stringify(cellPayload)],
    );
  }

  // ── Demographics ─────────────────────────────────────────────────────
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
      [ECAS_ACCOUNT_ID, seg.gender, seg.age, windowStart, windowEnd, spend, seg.linkClicks, seg.results,
        cpaOf(spend, seg.results), pctOf(seg.results, seg.linkClicks), "validation_required"],
    );
    await q(
      `insert into demographic_signal (account_id, cell_id, ad_name, age, gender, date_start, date_end, row_index, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ECAS_ACCOUNT_ID, "ACCOUNT", "All ads (manual demographic upload)", seg.age, seg.gender,
        windowStart, windowEnd, dIdx++,
        JSON.stringify(demoSignalRow("ACCOUNT", "All ads (manual demographic upload)", seg))],
    );
  }
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
        [ECAS_ACCOUNT_ID, a.adName, a.adName, seg.age, seg.gender,
          windowStart, windowEnd, dIdx++, JSON.stringify(demoSignalRow(a.adName, a.adName, seg))],
      );
    }
  }

  // ── Device / platform / placement (conversion-based) ────────────────
  const convRows = (bucket: Map<string, LdConversionAgg>) =>
    [...bucket.values()].sort((a, b) => b.linkClicks - a.linkClicks);
  for (const d of convRows(deviceCsv.devices)) {
    await q(
      `insert into device_performance (account_id, device, date_start, date_end, spend, impressions,
         results, cpa, confidence, link_clicks, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ECAS_ACCOUNT_ID, d.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        d.purchases, null, "validation_required", d.linkClicks, d.addsToCart, d.checkoutsInitiated,
        d.purchases, "conversion"],
    );
  }
  for (const p of convRows(deviceCsv.platforms)) {
    await q(
      `insert into platform_performance (account_id, platform, date_start, date_end, spend, impressions,
         results, cpa, confidence, link_clicks, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ECAS_ACCOUNT_ID, p.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        p.purchases, null, "validation_required", p.linkClicks, p.addsToCart, p.checkoutsInitiated,
        p.purchases, "conversion"],
    );
  }
  for (const pl of convRows(deviceCsv.placements)) {
    await q(
      `insert into placement_performance (account_id, placement, date_start, date_end, spend, impressions,
         results, cpa, confidence, link_clicks, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ECAS_ACCOUNT_ID, pl.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        pl.purchases, null, "validation_required", pl.linkClicks, pl.addsToCart, pl.checkoutsInitiated,
        pl.purchases, "conversion"],
    );
  }

  // ── Strategy Map outputs ─────────────────────────────────────────────
  for (const p of ldStrategy.icp_profiles ?? []) {
    await q(
      `insert into icp_profiles (account_id, profile_id, profile_name, confidence_level, payload)
       values ($1,$2,$3,$4,$5)`,
      [ECAS_ACCOUNT_ID, p.profile_id, str(p.profile_name), str(p.confidence_level), JSON.stringify(p)],
    );
  }
  for (const p of ldStrategy.message_pillars ?? []) {
    await q(
      `insert into message_pillars (account_id, pillar_id, pillar_name, payload) values ($1,$2,$3,$4)`,
      [ECAS_ACCOUNT_ID, p.pillar_id, str(p.pillar_name), JSON.stringify(p)],
    );
  }
  for (const v of ldStrategy.variable_combinations ?? []) {
    await q(
      `insert into variable_combinations (account_id, combination, context, cpa, cvr_pct, confidence, recommendation)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (account_id, combination) do nothing`,
      [ECAS_ACCOUNT_ID, v.combination, str(v.context), num(v.cpa), num(v.cvr_pct), str(v.confidence), str(v.recommendation)],
    );
  }
  for (const h of ldStrategy.testing_hypotheses ?? []) {
    await q(
      `insert into testing_hypotheses (account_id, hypothesis_id, statement, control_ref, test_variant,
         isolated_variable, sample_requirement, duration, success_criteria, risk, expected_impact, failure_plan, priority, pillar_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ECAS_ACCOUNT_ID, h.hypothesis_id, str(h.statement), str(h.control), str(h.test_variant),
        str(h.isolated_variable), str(h.sample_requirement), str(h.duration), str(h.success_criteria),
        str(h.risk), str(h.expected_impact), str(h.failure_plan), str(h.priority), h.pillar_id ?? null],
    );
  }

  // ── Brief Builder outputs ────────────────────────────────────────────
  for (const b of ldBriefs.briefs ?? []) {
    const meta = b.brief_metadata ?? {};
    await q(
      `insert into imported_creative_briefs (account_id, brief_id, mode, book, asset_type, priority, confidence, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ECAS_ACCOUNT_ID, meta.brief_id, str(meta.mode), null,
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
      [ECAS_ACCOUNT_ID, cell.cell_id, str(cell.concept_id), str(cell.asset_filename), str(cell.asset_path),
        str(cell.qa_mapping_status), str(cell.mapping_confidence), ldCellIdx++, JSON.stringify(cell)],
    );
  }

  // ── Account modules ──────────────────────────────────────────────────
  // Note: importEcas runs after this and will upsert the same module keys
  // with the current (Jul 2026) analysis data — those overwrites are intentional.
  const ldModules: Array<[string, unknown]> = [
    ["iap_metadata_historical", {
      client_name: library.client_name,
      library_version: library.library_version,
      bundle_metadata: bundle.bundle_metadata,
      account_totals: { ...bundle.account_totals, result_type: resultType },
      loop_run: intelligence.report_metadata,
      source_package: `ECAS historical analysis package (East Coast Art Studio, ${windowStart} → ${windowEnd})`,
      note: "Historical May–Jun 2026 data from initial API test period, prior to formal MSTm onboarding.",
    }],
    ["mst_historical", {
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
      [ECAS_ACCOUNT_ID, module, JSON.stringify(payload)],
    );
  }

  // ── IAP loop stage bookkeeping (historical period) ───────────────────
  const ldRuns: Array<[string, string, string | null, string | null]> = [
    ["bundle_prep", "complete", "littledata/normalized_data_bundle.json",
      "Historical May–Jun 2026 API test data. Re-export 2026-07-09 added funnel columns (link clicks, ATC, checkouts, revenue). All 54 ads reconcile exactly with account totals."],
    ["analysis_core", "complete", "littledata/campaign_intelligence.json",
      "Initial analysis run (2026-07-09). Pre-signal: 2 purchases on $1,400 spend. Click-depth metrics real from re-export; device tracking conversion-based."],
    ["strategy_map", "complete", "littledata/strategic_map.json",
      "3 ICPs, 5 message pillars, 3 hypotheses, retro-mapped 3×3 MST foundation. All reads validation_required."],
    ["brief_builder", "complete", "littledata/creative_briefs.json",
      "Initial MST brief LD-B001. Awaiting creative production."],
    ["creative_scan", "pending", null,
      "Not yet run — superseded by MSTm Sprint 1 (ecas formal analysis package)."],
    ["optimization_loop", "pending", null,
      "Not yet run — superseded by MSTm Sprint 1 (ecas formal analysis package)."],
  ];
  for (const [stage, status, source, note] of ldRuns) {
    await q(
      `insert into iap_runs (account_id, stage, status, window_start, window_end, generated_at, source_file, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (account_id, stage) do update set status=excluded.status, window_start=excluded.window_start,
         window_end=excluded.window_end, generated_at=excluded.generated_at, source_file=excluded.source_file, note=excluded.note`,
      [ECAS_ACCOUNT_ID, stage, status, windowStart, windowEnd,
        status === "complete" ? (str(intelligence.report_metadata?.generated) ?? null) : null,
        source, note],
    );
  }

  return adPerfCount;
}

async function importEcas(q: Q): Promise<number> {
  // Query starting row_index offsets for all tables shared with importLittleData
  // (which writes to the same ecas account_id and runs first).
  const libCellsBase = await q(
    `select coalesce(max(row_index) + 1, 0) as next from library_cells where account_id = $1`,
    [ECAS_ACCOUNT_ID],
  ).then((r) => r.rows[0].next as number);

  const required = [
    "normalized_data_bundle.json", "campaign_intelligence.json", "local_client_library.json",
    "strategic_map.json", "creative_briefs.json", "mst_foundation.json",
    ECAS_DEMO_CSV, ECAS_DEVICE_CSV,
  ];
  const missing = required.filter((f) => !existsSync(join(ECAS_DIR, f)));
  if (missing.length > 0) {
    throw new Error(`ECAS package incomplete — missing ${missing.join(", ")} in ${ECAS_DIR}`);
  }
  const readEcas = (file: string): any =>
    JSON.parse(readFileSync(join(ECAS_DIR, file), "utf8").replace(/\bNaN\b/g, "null"));
  const bundle = readEcas("normalized_data_bundle.json");
  const intelligence = readEcas("campaign_intelligence.json");
  const library = readEcas("local_client_library.json");
  const ecasStrategy = readEcas("strategic_map.json");
  const ecasBriefs = readEcas("creative_briefs.json");
  const ecasMst = readEcas("mst_foundation.json");

  const windowStart: string = bundle.bundle_metadata.date_range.start;
  const windowEnd: string = bundle.bundle_metadata.date_range.end;
  const resultType = "Website purchases";
  const metaAdAccountId = str(bundle.bundle_metadata.account_id)?.replace(/^act_/, "") ?? null;

  // ── Optional Meta ads export ─────────────────────────────────────────
  // ECAS uses { account_id, ads: { "C1A": { metaAdId, creativeAssetUrl } } }
  // (object-keyed by ad_name, not the array format parseMetaAdsExportDoc expects).
  const ecasMetaByAdName = new Map<string, { metaAdId: string | null; creativeAssetUrl: string | null }>();
  let ecasMetaAccountId: string | null = null;
  const ecasMetaPath = join(ECAS_DIR, META_EXPORT_FILE);
  if (existsSync(ecasMetaPath)) {
    const doc = JSON.parse(readFileSync(ecasMetaPath, "utf8"));
    ecasMetaAccountId = str(doc.account_id ?? doc.meta_ad_account_id)?.replace(/^act_/, "") ?? null;
    const mismatch = exportAccountMismatchError(ecasMetaAccountId, metaAdAccountId, "ECAS");
    if (mismatch) throw new Error(mismatch);
    for (const [adName, entry] of Object.entries(doc.ads ?? {})) {
      const e = entry as any;
      const metaAdId = str(e.metaAdId ?? e.meta_ad_id);
      const creativeAssetUrl = str(e.creativeAssetUrl ?? e.creative_asset_url);
      if (metaAdId || creativeAssetUrl) ecasMetaByAdName.set(adName, { metaAdId, creativeAssetUrl });
    }
    console.log(`Loaded ${META_EXPORT_FILE} (ECAS): ${ecasMetaByAdName.size} ads, account ${ecasMetaAccountId}`);
  } else {
    console.log(`No ${META_EXPORT_FILE} for ECAS — meta_ad_id stays NULL.`);
  }

  // ── Parse + verify DEMO CSV ──────────────────────────────────────────
  // ECAS account_totals uses different key names for funnel columns than the
  // verifyLdDemoReconciliation contract (adds_to_cart vs add_to_cart, etc.) —
  // normalise before passing.
  const csv = parseLdDemoCsv(readFileSync(join(ECAS_DIR, ECAS_DEMO_CSV), "utf8"));
  const csvAds = [...csv.ads.values()].sort((a, b) => b.spend - a.spend);
  const csvTotals = summarizeLdDemoAds(csvAds);
  const bundleTotalsNorm = {
    spend: bundle.account_totals.spend,
    impressions: bundle.account_totals.impressions,
    purchases: bundle.account_totals.purchases,
    link_clicks: bundle.account_totals.link_clicks,
    add_to_cart: bundle.account_totals.adds_to_cart ?? bundle.account_totals.add_to_cart ?? 0,
    initiate_checkout: bundle.account_totals.checkouts_initiated ?? bundle.account_totals.initiate_checkout ?? 0,
    revenue: bundle.account_totals.purchases_conversion_value ?? bundle.account_totals.revenue ?? 0,
  };
  verifyLdDemoReconciliation(csvTotals, bundleTotalsNorm);
  const bundleAdNames = (bundle.ad_level_performance ?? []).map((r: any) => String(r.ad_name));
  const missingFromCsv = bundleAdNames.filter((name: string) => !csv.ads.has(name));
  if (missingFromCsv.length > 0) {
    throw new Error(`ECAS demo CSV is missing package ads: ${missingFromCsv.join(", ")}`);
  }
  const { spend: csvSpend, impressions: csvImpressions, results: csvResults,
    linkClicks: csvLinkClicks, clicksAll: csvClicksAll, addsToCart: csvAtc,
    checkoutsInitiated: csvCheckouts, purchases: csvPurchases, purchaseValue: csvPurchaseValue } = csvTotals;
  console.log(
    `ECAS demo CSV verified: ${csv.rowCount} rows, ${csvAds.length} ads, ` +
    `$${csvSpend} / ${csvImpressions} imp / ${csvLinkClicks} link clicks / ${csvAtc} ATC / ` +
    `${csvResults} purchases ($${csvPurchaseValue}) — matches account totals exactly.`,
  );

  // ── Parse + verify DEVICE CSV ────────────────────────────────────────
  const deviceCsv = parseLdDeviceCsv(readFileSync(join(ECAS_DIR, ECAS_DEVICE_CSV), "utf8"));
  const deviceTotals = summarizeLdDeviceCsv(deviceCsv);
  verifyLdDeviceReconciliation(deviceTotals, csvTotals);
  const { purchases: devPurchases, checkoutsInitiated: devCheckouts, linkClicks: devLinkClicks } = deviceTotals;
  console.log(
    `ECAS device CSV verified: ${deviceCsv.rowCount} rows (conversion-based), ` +
    `${devLinkClicks} link clicks / ${devPurchases} purchases / ${devCheckouts} checkouts — reconciles with DEMO.`,
  );

  const cpaOf = (spend: number | null, purchases: number | null): number | null =>
    spend !== null && purchases !== null && purchases > 0
      ? Math.round((spend / purchases) * 100) / 100 : null;
  const pctOf = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.round((numerator / denominator) * 100 * 10000) / 10000 : null;
  const cpmOf = (spend: number, impressions: number): number | null =>
    impressions > 0 ? round2((spend / impressions) * 1000) : null;

  // ── Ad account ───────────────────────────────────────────────────────
  await q(
    `insert into ad_accounts (id, name, status, platform, source_status, facebook_page_dp_url, overview_state, meta_ad_account_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (id) do update set name=excluded.name, status=excluded.status, platform=excluded.platform,
       source_status=excluded.source_status, facebook_page_dp_url=excluded.facebook_page_dp_url,
       overview_state=excluded.overview_state, meta_ad_account_id=excluded.meta_ad_account_id`,
    [ECAS_ACCOUNT_ID, "East Coast Art Studio", "configured", "Meta Ads",
      "imported_from_iap_analysis_package", null, null, metaAdAccountId],
  );

  // ── Lookup maps ───────────────────────────────────────────────────────
  // creative_id_map is an object keyed by cell_id (unlike LittleData's array).
  // Normalise keys to uppercase for consistent lookup against CSV ad names.
  const creativeByCell = new Map<string, any>();
  for (const [cellId, entry] of Object.entries(library.creative_id_map ?? {})) {
    creativeByCell.set(cellId.toUpperCase(), { ...(entry as any), cell_id: cellId });
  }
  const conceptsByCode = new Map<string, any>();
  for (const c of library.local_concepts ?? []) conceptsByCode.set(c.code, c);
  const bundleByAd = new Map<string, any>();
  for (const r of bundle.ad_level_performance ?? []) bundleByAd.set(String(r.ad_name), r);

  // ── Ad performance + ads for all CSV ads ─────────────────────────────
  let adPerfCount = 0;
  let ecasBackfilledIds = 0;
  let ecasBackfilledAssets = 0;
  for (const a of csvAds) {
    const cellNorm = a.adName.toUpperCase();
    const map = creativeByCell.get(cellNorm) ?? null;
    const stack = map?.variable_stack ?? {};
    const conceptCode = map?.concept_id ?? null;
    const bundleRow = bundleByAd.get(a.adName) ?? null;
    const spend = round2(a.spend);
    const purchases = a.results;
    const confidence = str(bundleRow?.confidence) ?? (spend < 50 ? "insufficient" : "validation_required");
    const campaignName = a.campaigns.size > 0 ? [...a.campaigns].sort().join(" + ") : null;
    const adSetName = a.adSets.size > 0 ? [...a.adSets].sort().join(" + ") : null;
    // The export is keyed by canonical cell_id; ad names with casing quirks
    // (e.g. "c4A") also check the normalised key.
    const backfill = ecasMetaByAdName.get(a.adName) ?? ecasMetaByAdName.get(cellNorm) ?? null;
    const resolved = resolveLdMetaAdId(a.adIds, backfill?.metaAdId);
    const metaAdId = resolved.metaAdId;
    if (resolved.source === "export") ecasBackfilledIds++;
    if (resolved.ignoredExportId) {
      console.warn(
        `ECAS ${META_EXPORT_FILE}: meta_ad_id ${resolved.ignoredExportId} for "${a.adName}" not among ` +
        `CSV-observed Ad IDs (${[...a.adIds].join(", ")}) — ignoring.`,
      );
    }
    const creativeAssetUrl = backfill?.creativeAssetUrl ?? null;
    if (creativeAssetUrl) ecasBackfilledAssets++;

    await q(
      `insert into ad_performance (account_id, book, campaign_name, ad_set_name, ad_name, cell, concept,
         variation, test_id, result_type, date_start, date_end, spend, impressions, reach, clicks_all,
         link_clicks, results, cpa, ctr_link_pct, cvr_link_pct, cpm, confidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [ECAS_ACCOUNT_ID, null, campaignName, adSetName, a.adName, cellNorm, conceptCode, null, null,
        resultType, windowStart, windowEnd, spend, a.impressions, null, a.clicksAll, a.linkClicks,
        purchases, cpaOf(spend, purchases), pctOf(a.linkClicks, a.impressions),
        pctOf(purchases, a.linkClicks), cpmOf(spend, a.impressions), confidence],
    );
    adPerfCount++;

    await q(
      `insert into ads (account_id, ad_name, book, cell, concept, variation, test_id,
         meta_ad_id, creative_asset_url, asset_filename, asset_path, asset_servable)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [ECAS_ACCOUNT_ID, a.adName, null, cellNorm, conceptCode, null, null,
        metaAdId, creativeAssetUrl, str(stack.CN) ?? null, null, Boolean(creativeAssetUrl)],
    );
  }
  if (ecasMetaByAdName.size > 0) {
    const unmatched = unmatchedExportAdNames(
      ecasMetaByAdName.keys(),
      (n) => csv.ads.has(n) || csv.ads.has(n.toUpperCase()) || csv.ads.has(n.toLowerCase()),
    );
    console.log(`ECAS meta export: ${ecasBackfilledIds} ads got meta_ad_id, ${ecasBackfilledAssets} got creative_asset_url.`);
    if (unmatched.length > 0) {
      console.warn(`ECAS ${META_EXPORT_FILE}: ${unmatched.length} ad_name(s) not in CSV (ignored): ${unmatched.slice(0, 10).join(", ")}`);
    }
  }

  // ── Library cell performance (only ads in ad_level_performance) ─────
  for (const r of bundle.ad_level_performance ?? []) {
    const cellNorm = String(r.ad_name).toUpperCase();
    const map = creativeByCell.get(cellNorm) ?? null;
    const conceptCode = map?.concept_id ?? null;
    const concept = conceptCode ? conceptsByCode.get(conceptCode) : null;
    const spend = num(r.spend);
    const purchases = num(r.purchases);
    const csvAd = csv.ads.get(String(r.ad_name))!;
    const iapRead = [
      `Confidence: ${r.confidence}. Pre-signal window — zero purchases; no winner/loser calls.`,
      concept?.evidence ? `Concept evidence: ${concept.evidence}.` : null,
    ].filter(Boolean).join(" ");
    const stack = map?.variable_stack ?? {};
    const cellPayload: Record<string, unknown> = {
      cell_id: cellNorm,
      "Result type": resultType,
      "Amount spent (USD)": spend,
      Reach: num(r.reach),
      Impressions: num(r.impressions),
      Results: purchases,
      "Clicks (all)": csvAd.clicksAll,
      "Link clicks": csvAd.linkClicks,
      CPA_result: cpaOf(spend, purchases),
      CTR_link_pct: pctOf(csvAd.linkClicks, csvAd.impressions),
      Result_per_link_click_pct: pctOf(csvAd.results, csvAd.linkClicks),
      book2_concept_name: concept?.definition ?? cellNorm,
      iap_read: iapRead,
    };
    if (stack.HK) cellPayload["hook_variable"] = str(stack.HK);
    if (stack.TN) cellPayload["tone_variable"] = str(stack.TN);
    if (stack.HP) cellPayload["pain_proof_variable"] = str(stack.HP);
    if (stack.PR) cellPayload["proof_variable"] = str(stack.PR);
    if (stack.CTA) cellPayload["cta_variable"] = str(stack.CTA);
    if (conceptCode) cellPayload["concept_variable"] = conceptCode;
    await q(
      `insert into library_cell_performance (account_id, cell_id, result_type, date_start, date_end, payload)
       values ($1,$2,$3,$4,$5,$6)`,
      [ECAS_ACCOUNT_ID, cellNorm, resultType, windowStart, windowEnd, JSON.stringify(cellPayload)],
    );
  }

  // ── Demographics ─────────────────────────────────────────────────────
  // Start row_index after any rows already inserted by importLittleData for
  // this account (both functions write to the same ecas account_id).
  const dIdxBase = (await q(
    `select coalesce(max(row_index) + 1, 0) as next from demographic_signal where account_id = $1`,
    [ECAS_ACCOUNT_ID],
  )).rows[0].next as number;
  const accountSegments = [...csv.accountSegments.values()].sort((a, b) => b.spend - a.spend);
  let dIdx = dIdxBase;
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
      [ECAS_ACCOUNT_ID, seg.gender, seg.age, windowStart, windowEnd, spend, seg.linkClicks,
        seg.results, cpaOf(spend, seg.results), pctOf(seg.results, seg.linkClicks), "insufficient"],
    );
    await q(
      `insert into demographic_signal (account_id, cell_id, ad_name, age, gender, date_start, date_end, row_index, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ECAS_ACCOUNT_ID, "ACCOUNT", "All ads (demographic upload)", seg.age, seg.gender,
        windowStart, windowEnd, dIdx++,
        JSON.stringify(demoSignalRow("ACCOUNT", "All ads (demographic upload)", seg))],
    );
  }
  const signalAds = new Set<string>([
    ...csvAds.slice(0, 10).map((a) => a.adName),
    ...csvAds.filter((a) => a.results > 0).map((a) => a.adName),
  ]);
  for (const a of csvAds) {
    if (!signalAds.has(a.adName)) continue;
    const cellNorm = a.adName.toUpperCase();
    for (const seg of [...a.segments.values()].sort((x, y) => y.spend - x.spend)) {
      await q(
        `insert into demographic_signal (account_id, cell_id, ad_name, age, gender, date_start, date_end, row_index, payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ECAS_ACCOUNT_ID, cellNorm, a.adName, seg.age, seg.gender,
          windowStart, windowEnd, dIdx++, JSON.stringify(demoSignalRow(cellNorm, a.adName, seg))],
      );
    }
  }

  // ── Device / platform / placement (conversion-based) ─────────────────
  const convRows = (bucket: Map<string, LdConversionAgg>) =>
    [...bucket.values()].sort((a, b) => b.linkClicks - a.linkClicks);
  for (const d of convRows(deviceCsv.devices)) {
    await q(
      `insert into device_performance (account_id, device, date_start, date_end, spend, impressions,
         results, cpa, confidence, link_clicks, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ECAS_ACCOUNT_ID, d.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        d.purchases, null, "insufficient", d.linkClicks, d.addsToCart, d.checkoutsInitiated,
        d.purchases, "conversion"],
    );
  }
  for (const p of convRows(deviceCsv.platforms)) {
    await q(
      `insert into platform_performance (account_id, platform, date_start, date_end, spend, impressions,
         link_clicks, results, cpa, confidence, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ECAS_ACCOUNT_ID, p.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        p.linkClicks, p.purchases, null, "insufficient", p.addsToCart, p.checkoutsInitiated,
        p.purchases, "conversion"],
    );
  }
  for (const p of convRows(deviceCsv.placements)) {
    await q(
      `insert into placement_performance (account_id, placement, date_start, date_end, spend, impressions,
         link_clicks, results, cpa, cvr_link_pct, confidence, adds_to_cart, checkouts_initiated, purchases, tracking_basis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [ECAS_ACCOUNT_ID, p.key, deviceCsv.window.start, deviceCsv.window.end, null, null,
        p.linkClicks, p.purchases, null, pctOf(p.purchases, p.linkClicks), "insufficient",
        p.addsToCart, p.checkoutsInitiated, p.purchases, "conversion"],
    );
  }
  console.log(
    `ECAS conversion-tracking rows: ${deviceCsv.devices.size} devices, ` +
    `${deviceCsv.platforms.size} platforms, ${deviceCsv.placements.size} placements.`,
  );

  // ── Concepts — sum spend/results from ad_level_performance ───────────
  const conceptTotals = new Map<string, { spend: number; results: number }>();
  for (const r of bundle.ad_level_performance ?? []) {
    const map = creativeByCell.get(String(r.ad_name).toUpperCase());
    const code = map?.concept_id ?? null;
    if (!code) continue;
    let ct = conceptTotals.get(code);
    if (!ct) { ct = { spend: 0, results: 0 }; conceptTotals.set(code, ct); }
    ct.spend = round2(ct.spend + Number(r.spend ?? 0));
    ct.results += Number(r.purchases ?? 0);
  }
  for (const c of library.local_concepts ?? []) {
    const ct = conceptTotals.get(c.code);
    const spend = ct ? round2(ct.spend) : null;
    const results = ct?.results ?? null;
    await q(
      `insert into concept_performance (account_id, book, concept, date_start, date_end, spend,
         link_clicks, results, cpa, cvr_link_pct, confidence, mapped_in_library)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [ECAS_ACCOUNT_ID, null, c.code, windowStart, windowEnd,
        spend, null, results, cpaOf(spend, results), null, "insufficient", true],
    );
    await q(
      `insert into concept_intelligence (account_id, book, concept_code, mapped_in_library, spend,
         link_clicks, results, cpa, buying_intent_score, performance_lift_vs_baseline, performance_tier,
         confidence_level, what, why, so_what, now_what)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [ECAS_ACCOUNT_ID, null, c.code, true, spend, null, results, cpaOf(spend, results),
        null, null, null, "insufficient", str(c.definition), str(c.evidence), null, null],
    );
  }

  // ── Data quality flags ───────────────────────────────────────────────
  for (const f of bundle.quality_flags ?? []) {
    await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'quality_flag',$2)`,
      [ECAS_ACCOUNT_ID, JSON.stringify({ note: `${f.flag} (${f.severity}): ${f.detail}`, ...f })]);
  }
  const attribution = bundle.bundle_metadata.attribution_windows ?? "unknown";
  await q(`insert into data_quality_flags (account_id, kind, payload) values ($1,'attribution_window',$2)`,
    [ECAS_ACCOUNT_ID, JSON.stringify({ note: `Attribution: ${attribution}`, attribution_windows: attribution })]);

  // ── Failure patterns (empty for Sprint 1) ────────────────────────────
  for (const p of library.failed_patterns ?? []) {
    await q(
      `insert into failure_patterns (account_id, segment_type, campaign, spend, engagement_present, diagnosis, wasted_spend, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ECAS_ACCOUNT_ID, "creative_pattern", null, null, null,
        str((p as any).pattern ?? p), null, JSON.stringify(p)],
    );
  }

  // ── Strategy Map: ICP profiles ───────────────────────────────────────
  for (const p of ecasStrategy.icp_profiles ?? []) {
    await q(
      `insert into icp_profiles (account_id, profile_id, profile_name, confidence_level, payload)
       values ($1,$2,$3,$4,$5)`,
      [ECAS_ACCOUNT_ID, p.profile_id, str(p.profile_name), str(p.confidence_level), JSON.stringify(p)],
    );
  }

  // ── Strategy Map: message pillars ────────────────────────────────────
  for (const p of ecasStrategy.message_pillars ?? []) {
    await q(
      `insert into message_pillars (account_id, pillar_id, pillar_name, payload) values ($1,$2,$3,$4)`,
      [ECAS_ACCOUNT_ID, p.pillar_id, str(p.pillar_name), JSON.stringify(p)],
    );
  }

  // ── Strategy Map: variable combinations ─────────────────────────────
  // ECAS combinations don't carry cpa/cvr_pct/recommendation — those stay NULL.
  for (const v of ecasStrategy.variable_combinations ?? []) {
    await q(
      `insert into variable_combinations (account_id, combination, context, cpa, cvr_pct, confidence, recommendation)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (account_id, combination) do nothing`,
      [ECAS_ACCOUNT_ID, v.combination, str(v.matrix_cell ?? v.context ?? null),
        num(v.cpa ?? null), num(v.cvr_pct ?? null), str(v.confidence), str(v.recommendation ?? null)],
    );
  }

  // ── Strategy Map: testing hypotheses ────────────────────────────────
  for (const h of ecasStrategy.testing_hypotheses ?? []) {
    await q(
      `insert into testing_hypotheses (account_id, hypothesis_id, statement, control_ref, test_variant,
         isolated_variable, sample_requirement, duration, success_criteria, risk, expected_impact, failure_plan, priority, pillar_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ECAS_ACCOUNT_ID, h.hypothesis_id, str(h.statement), str(h.control),
        str(h.test_variant), str(h.isolated_variable), str(h.sample_requirement), str(h.duration),
        str(h.success_criteria), str(h.risk), str(h.expected_impact), str(h.failure_plan),
        str(h.priority), h.pillar_id ?? null],
    );
  }

  // ── Brief Builder: 16 matrix-cell briefs ────────────────────────────
  for (const b of ecasBriefs.briefs ?? []) {
    const meta = b.brief_metadata ?? {};
    await q(
      `insert into imported_creative_briefs (account_id, brief_id, mode, book, asset_type, priority, confidence, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ECAS_ACCOUNT_ID, meta.brief_id, str(meta.mode), null,
        str(meta.asset_type), str(meta.priority), str(meta.confidence), JSON.stringify(b)],
    );
  }

  // ── MST foundation: library cells (16, one per matrix cell) ─────────
  let ecasCellIdx = libCellsBase;
  for (const cell of ecasMst.local_library_cells ?? []) {
    await q(
      `insert into library_cells (account_id, cell_id, concept_id, asset_filename, asset_path,
         qa_mapping_status, mapping_confidence, row_index, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ECAS_ACCOUNT_ID, cell.cell_id, str(cell.concept_id), str(cell.asset_filename),
        str(cell.asset_path), str(cell.qa_mapping_status), str(cell.mapping_confidence),
        ecasCellIdx++, JSON.stringify(cell)],
    );
  }

  // ── Account modules ──────────────────────────────────────────────────
  const ecasModules: Array<[string, unknown]> = [
    ["iap_metadata", {
      client_id: library.client_id,
      client_name: library.client_name,
      library_version: library.library_version,
      source_files: library.source_files,
      global_variables_used: library.global_variables_used,
      product_context: library.product_context,
      bundle_metadata: bundle.bundle_metadata,
      account_totals: { ...bundle.account_totals, result_type: resultType },
      loop_run: intelligence.report_metadata,
      source_package: `ECAS IAP analysis package (East Coast Art Studio, ${windowStart} → ${windowEnd})`,
      manual_uploads: [
        {
          file: ECAS_DEMO_CSV,
          kind: "meta_export_demographic_breakdown",
          uploaded: "2026-07-25",
          grain: "ad × day × gender × age × primary text",
          rows_parsed: csv.rowCount,
          ads: csvAds.length,
          day_range: csv.dayRange,
          verification: `Sums to $${csvSpend} / ${csvImpressions} imp / ${csvLinkClicks} link clicks / ${csvAtc} ATC / ${csvResults} purchases ($${csvPurchaseValue}) — matches account totals exactly.`,
        },
        {
          file: ECAS_DEVICE_CSV,
          kind: "meta_export_conversion_device_breakdown",
          uploaded: "2026-07-25",
          grain: "platform × placement × conversion device",
          rows_parsed: deviceCsv.rowCount,
          window: deviceCsv.window,
          tracking_change: "Conversion-based: funnel actions attributed to converting device; spend/impressions not device-attributable (tracking_basis='conversion').",
          verification: `${devPurchases} purchases and ${devCheckouts} checkouts reconcile with DEMO CSV (both 0).`,
        },
      ],
    }],
    ["core_reanalysis_read", {
      primary_control: "No control established — zero conversions, invalid test cycle",
      primary_control_read: str(intelligence.executive_summary?.verdict) ??
        "Invalid test — see campaign_intelligence.json.",
      registration_control: null,
      registration_control_read: null,
      data_caveat: "MST Sprint 1 is an invalid test: $57.97 / ~$1,000 committed budget, zero purchases or checkouts, 4/16 cells never delivered, unresolved Initiate Checkout tracking gap. No creative or avatar reads are actionable.",
    }],
    ["analysis_core_summary", {
      report_metadata: intelligence.report_metadata,
      executive_summary: intelligence.executive_summary,
      buyer_intent_funnel: intelligence.buyer_intent_funnel,
      traffic_quality_correlation: intelligence.traffic_quality_correlation,
      creative_dna_signals: intelligence.creative_dna_signals,
      performance_tiers: intelligence.performance_tiers,
      winning_variable_stack: intelligence.winning_variable_stack,
      insight_confidence: intelligence.insight_confidence,
      winning_patterns: library.winning_patterns,
      failed_patterns: library.failed_patterns,
      active_hypotheses: library.active_hypotheses,
      evidence_notes: library.evidence_notes,
    }],
    ["scaling_playbook", ecasStrategy.scaling_playbook ?? null],
    ["mst", {
      status: str(ecasMst.status) ?? "active",
      render_policy: ecasMst.render_policy ?? null,
      // Normalize ECAS's flat cell array into the MSTMatrix object shape the
      // UI expects: { columns, rows, diagonal_down, diagonal_up, cells }.
      // LittleData ships this shape already; ECAS Sprint 1 ships a flat list.
      historical_matrix_4x4: (() => {
        const flat: any[] = Array.isArray(ecasMst.historical_matrix_4x4)
          ? ecasMst.historical_matrix_4x4 : [];
        if (!flat.length) return ecasMst.historical_matrix_4x4 ?? null;
        const colOrder = [...new Set(flat.map((c: any) => c.concept_id as string))].sort();
        const rowOrder = [...new Set(flat.map((c: any) => c.row_variable as string))].sort();
        const columns = colOrder.map((id) => {
          const concept = conceptsByCode.get(id);
          return { id, name: concept?.definition ?? id, icp: concept?.icp_id ?? null };
        });
        const rows = rowOrder.map((id) => {
          // Use the C1 (first concept) cell's tone as the row's shared variable label
          const lead = flat.find((c: any) => c.row_variable === id && c.concept_id === colOrder[0]);
          const leadEntry = lead ? (creativeByCell.get(lead.cell_id?.toUpperCase() ?? "") ?? null) : null;
          const shared = lead?.tone ?? leadEntry?.variable_stack?.TN ?? id;
          return { id, shared, color: "var(--accent)" };
        });
        const normalizedCells = flat.map((c: any) => {
          const colIdx = colOrder.indexOf(c.concept_id);
          const rowIdx = rowOrder.indexOf(c.row_variable);
          const diag = colIdx === rowIdx ? "diagonal_down"
            : colIdx + rowIdx === colOrder.length - 1 ? "diagonal_up" : null;
          const entry = creativeByCell.get(c.cell_id?.toUpperCase() ?? "") ?? null;
          const vs = entry?.variable_stack ?? {};
          const concept = conceptsByCode.get(c.concept_id);
          return {
            cell_id: c.cell_id,
            column_id: c.concept_id,
            row_id: c.row_variable,
            column_label: concept?.definition ?? c.concept_id,
            row_shared_variable: c.tone ?? vs.TN ?? c.row_variable,
            diagonal_role: diag,
            concept_code: c.concept_id,
            variable_stack: {
              cn: vs.CN ?? null,
              hk: c.hook ?? vs.HK ?? null,
              tn: c.tone ?? vs.TN ?? null,
              hp: c.proof_or_pain ?? vs.HP ?? null,
              cta: c.cta_code ?? vs.CTA ?? null,
            },
            plain_text: {
              headline: c.hook ?? null,
              primary: c.hook ?? null,
              hook: c.hook ?? null,
              tone: c.tone ?? null,
              proof_or_pain: c.proof_or_pain ?? null,
              cta: c.cta_code ?? null,
            },
          };
        });
        return {
          columns,
          rows,
          diagonal_down: normalizedCells.filter((c) => c.diagonal_role === "diagonal_down").map((c) => c.cell_id),
          diagonal_up: normalizedCells.filter((c) => c.diagonal_role === "diagonal_up").map((c) => c.cell_id),
          cells: normalizedCells,
        };
      })(),
      source_artifacts: ecasMst.source_artifacts ?? [],
    }],
  ];
  for (const [module, payload] of ecasModules) {
    await q(
      `insert into account_modules (account_id, module, payload) values ($1,$2,$3)
       on conflict (account_id, module) do update set payload = excluded.payload`,
      [ECAS_ACCOUNT_ID, module, JSON.stringify(payload)],
    );
  }

  // ── IAP loop stage bookkeeping ───────────────────────────────────────
  const ecasRuns: Array<[string, string, string | null, string | null]> = [
    ["bundle_prep", "complete", "ecas/normalized_data_bundle.json",
      "MST Sprint 1 DEMO export (11 delivering ads, Jul 14-24, $57.97 spend, zero conversions). 5 cells excluded: C2A/C2D/C3C/C4D (zero delivery) + C1C (device-only, absent from DEMO CSV)."],
    ["analysis_core", "complete", "ecas/campaign_intelligence.json",
      "Invalid test read — spend 5.8% of committed budget, zero conversions, unresolved tracking gap. No avatar/PMF/variable reads actionable. Directional CTR only: C3A (5.3%), C1B (2.1%)."],
    ["strategy_map", "complete", "ecas/strategic_map.json",
      "4 ICPs (GiftGiver45/Milestone2534/HometownSelf/MemoryKeeperCouple), 3 message pillars, 16 variable combinations, 2 hypotheses. All hypothesis_only — zero live conversion validation."],
    ["brief_builder", "complete", "ecas/creative_briefs.json",
      "All 16 MST Sprint 1 matrix-cell briefs produced pre-launch (4:5 format; 9:16 not yet produced for any cell)."],
    ["creative_scan", "pending", null,
      "Not yet run — blocked on tracking fix, full budget delivery, and all 16 cells live before a valid read is possible."],
    ["optimization_loop", "pending", null,
      "Not yet run — blocked on creative_scan (which is blocked on tracking fix + budget delivery)."],
  ];
  for (const [stage, status, source, note] of ecasRuns) {
    await q(
      `insert into iap_runs (account_id, stage, status, window_start, window_end, generated_at, source_file, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (account_id, stage) do update set status=excluded.status, window_start=excluded.window_start,
         window_end=excluded.window_end, generated_at=excluded.generated_at, source_file=excluded.source_file, note=excluded.note`,
      [ECAS_ACCOUNT_ID, stage, status, windowStart, windowEnd,
        status === "complete" ? (str(intelligence.report_metadata?.generated_at) ?? null) : null,
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
      await q(`delete from ${t} where account_id = any($1)`, [[ACCOUNT_ID, ECAS_ACCOUNT_ID]]);
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
           isolated_variable, sample_requirement, duration, success_criteria, risk, expected_impact, failure_plan, priority, pillar_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [ACCOUNT_ID, h.hypothesis_id, str(h.statement), str(h.control), str(h.test_variant),
          str(h.isolated_variable), str(h.sample_requirement), str(h.duration), str(h.success_criteria),
          str(h.risk), str(h.expected_impact), str(h.failure_plan), str(h.priority), h.pillar_id ?? null],
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

    // ── East Coast Art Studio — historical period (May–Jun 2026) ────────
    const ldAdPerfCount = await importLittleData(q);
    console.log(`ECAS historical: imported ${ldAdPerfCount} ad_performance rows for account '${ECAS_ACCOUNT_ID}' (May–Jun 2026).`);

    // ── East Coast Art Studio — MSTm Sprint 1 (Jul 2026) ─────────────
    const ecasAdPerfCount = await importEcas(q);
    console.log(`ECAS: imported ${ecasAdPerfCount} ad_performance rows for account '${ECAS_ACCOUNT_ID}'.`);

    await q("commit");

    // ── Report ─────────────────────────────────────────────────────────
    const counts = await client.query(`
      select 'ad_performance' t, count(*) n from ad_performance where account_id='bookster'
      union all select 'ads', count(*) from ads where account_id='bookster'
      union all select 'ad_performance (ecas)', count(*) from ad_performance where account_id='ecas'
      union all select 'ads (ecas)', count(*) from ads where account_id='ecas'
      union all select 'library_cell_performance (ecas)', count(*) from library_cell_performance where account_id='ecas'
      union all select 'concept_performance (ecas)', count(*) from concept_performance where account_id='ecas'
      union all select 'imported_creative_briefs (ecas)', count(*) from imported_creative_briefs where account_id='ecas'
      union all select 'iap_runs (ecas)', count(*) from iap_runs where account_id='ecas'
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
