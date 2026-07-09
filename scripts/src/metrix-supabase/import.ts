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
// into scripts/data/metrix/ shaped like:
//   {
//     "meta_ad_account_id": "1234567890",          // numeric, "act_" prefix ok
//     "ads": [
//       { "ad_name": "<exact ad_name from the package>",
//         "meta_ad_id": "23851234567890123",
//         "creative_asset_url": "https://..." }    // optional per ad
//     ]
//   }
// The importer backfills ads.meta_ad_id / ads.creative_asset_url (and
// ad_accounts.meta_ad_account_id) from it. Absent file → columns stay NULL.
const META_EXPORT_FILE = "meta_ads_export.json";

interface MetaAdBackfill {
  metaAdId: string | null;
  creativeAssetUrl: string | null;
}

function loadMetaAdsExport(): {
  metaAdAccountId: string | null;
  byAdName: Map<string, MetaAdBackfill>;
} {
  const byAdName = new Map<string, MetaAdBackfill>();
  if (!existsSync(join(DATA_DIR, META_EXPORT_FILE))) {
    console.log(`No ${META_EXPORT_FILE} found — meta_ad_id / creative_asset_url stay NULL (expected until raw Meta exports arrive).`);
    return { metaAdAccountId: null, byAdName };
  }
  const doc = readJson(META_EXPORT_FILE);
  const metaAdAccountId = str(doc.meta_ad_account_id)?.replace(/^act_/, "") ?? null;
  for (const a of doc.ads ?? []) {
    const adName = str(a.ad_name);
    if (!adName) continue;
    const metaAdId = str(a.meta_ad_id);
    const creativeAssetUrl = str(a.creative_asset_url);
    if (!metaAdId && !creativeAssetUrl) continue;
    byAdName.set(adName, { metaAdId, creativeAssetUrl });
  }
  console.log(`Loaded ${META_EXPORT_FILE}: ${byAdName.size} ads with meta_ad_id/creative_asset_url` +
    (metaAdAccountId ? `, ad account ${metaAdAccountId}` : ", no meta_ad_account_id (deep links stay pending)"));
  return { metaAdAccountId, byAdName };
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
  const metaExport = loadMetaAdsExport();

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
      await q(`delete from ${t} where account_id = $1`, [ACCOUNT_ID]);
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

    await q("commit");

    // ── Report ─────────────────────────────────────────────────────────
    const counts = await client.query(`
      select 'ad_performance' t, count(*) n from ad_performance where account_id='bookster'
      union all select 'ads', count(*) from ads where account_id='bookster'
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
