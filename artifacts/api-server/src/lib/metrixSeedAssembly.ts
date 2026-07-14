// ─── Metrix seed assembly ─────────────────────────────────────────────
// Builds the seed-shaped bundle served by GET /metrix/seed from Supabase
// tables. Account-aware: every row in `ad_accounts` is assembled
// generically from tables filtered by its account_id — nothing is
// hardcoded to a single account. Accounts with real performance data get
// the full IAP object; accounts without it get an honest pending shape
// (iap: null). No static fallback: if Supabase is unreachable or empty,
// the route fails loudly.
//
// Loop stages without real data behind them are honest:
//   - optimization_loop → null (stage never ran)
//   - creative_scan     → pending (surfaced via loop_status)
// Nothing is fabricated; gap tables (data_quality, variable_registry) are
// passed through so the client can surface them.

import { getSupabase } from "./supabase";

type Row = Record<string, any>;

// ─── helpers ──────────────────────────────────────────────────────────

const round = (v: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

async function selectAll(table: string, build?: (q: any) => any): Promise<Row[]> {
  const supabase = getSupabase();
  let query: any = supabase.from(table).select("*");
  if (build) query = build(query);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Supabase query failed for "${table}": ${error.message}`);
  }
  return data ?? [];
}

/** Group rows by account_id, preserving the fetch order within each group. */
export function groupByAccount(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const id = String(r["account_id"] ?? "");
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(r);
  }
  return map;
}

const forAccount = (grouped: Map<string, Row[]>, accountId: string): Row[] =>
  grouped.get(accountId) ?? [];

/** messaging_framework like "FW_BAB + HK_Benefit + HP_Time" → variable_stack */
function parseVariableStack(framework: string | null | undefined): Record<string, string> {
  const familyByPrefix: Record<string, string> = {
    HK: "hook",
    TN: "tone",
    FW: "framework",
    CN: "concept",
    PR: "proof",
    HP: "pain_proof",
    CTA: "cta",
  };
  const stack: Record<string, string> = {};
  for (const part of (framework ?? "").split("+").map((s) => s.trim()).filter(Boolean)) {
    const prefix = part.split("_")[0] ?? "";
    const family = familyByPrefix[prefix];
    if (family && !(family in stack)) stack[family] = part;
  }
  return stack;
}

/** "ICP_BOOK0_C2_TimePoorLearner" → "C2" (best-effort concept ref) */
function conceptRefsFromIcps(targetIcps: string[] | undefined): string[] {
  const refs = new Set<string>();
  for (const icp of targetIcps ?? []) {
    const m = icp.match(/_(C\d[A-Z]?)_/);
    if (m?.[1]) refs.add(m[1]);
  }
  return [...refs];
}

/** ["BOOK0","BOOK2"] → "BOOK0 and BOOK2"; ["A","B","C"] → "A, B and C" */
function humanJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ─── per-account tables (everything keyed by account_id) ─────────────

export type AccountTables = {
  adPerformance: Map<string, Row[]>;
  conceptPerformance: Map<string, Row[]>;
  campaignWindows: Map<string, Row[]>;
  dataQualityFlags: Map<string, Row[]>;
  libraryCells: Map<string, Row[]>;
  libraryCellPerformance: Map<string, Row[]>;
  variablePerformance: Map<string, Row[]>;
  demographicSignal: Map<string, Row[]>;
  placementSignal: Map<string, Row[]>;
  devicePerformance: Map<string, Row[]>;
  platformPerformance: Map<string, Row[]>;
  placementPerformance: Map<string, Row[]>;
  messagePillars: Map<string, Row[]>;
  testingHypotheses: Map<string, Row[]>;
  icpProfiles: Map<string, Row[]>;
  variableCombinations: Map<string, Row[]>;
  creativeBriefs: Map<string, Row[]>;
  iapRuns: Map<string, Row[]>;
  conceptIntelligence: Map<string, Row[]>;
  failurePatterns: Map<string, Row[]>;
  adsRegistry: Map<string, Row[]>;
  accountModules: Row[];
  signalCards: Row[];
};

const modulesFor = (accountModules: Row[], accountId: string): Map<string, any> => {
  const map = new Map<string, any>();
  for (const m of accountModules) {
    if (m["account_id"] === accountId) map.set(m["module"], m["payload"]);
  }
  return map;
};

const zeroEventTotals = (): Row => ({
  spend: 0,
  reach: 0,
  impressions: 0,
  results: 0,
  clicks_all: 0,
  link_clicks: 0,
});

/**
 * Replace ad-level per-event sums with authoritative account-level totals
 * (bundle-prep `account_totals` carried in the iap_metadata module).
 * Only safe when the account's rows report a single result_type matching
 * the override — otherwise account-wide numbers would double-count into
 * one event, so the row sums are kept untouched.
 */
const overrideEventTotals = (byEvent: Record<string, Row>, ov: Row | null | undefined): void => {
  if (!ov || typeof ov["result_type"] !== "string") return;
  const event = ov["result_type"] as string;
  const events = Object.keys(byEvent);
  if (events.length > 1 || (events.length === 1 && events[0] !== event)) return;
  byEvent[event] ??= zeroEventTotals();
  if (ov["spend"] != null) byEvent[event]["spend"] = Number(ov["spend"]);
  if (ov["impressions"] != null) byEvent[event]["impressions"] = Number(ov["impressions"]);
  if (ov["purchases"] != null) byEvent[event]["results"] = Number(ov["purchases"]);
};

// ─── generic per-account assembly ─────────────────────────────────────

/**
 * Build the seed-shaped ad-account object for ANY account id.
 * Accounts with real ad_performance rows get the full IAP object;
 * accounts without get the honest pending shape (iap: null).
 */
export function buildAccountObject(account: Row, t: AccountTables): Row {
  const accountId = String(account["id"]);
  const modules = modulesFor(t.accountModules, accountId);
  const adPerformance = forAccount(t.adPerformance, accountId);

  // ── No performance data yet → honest pending/unconfigured shape ─────
  if (adPerformance.length === 0) {
    return {
      id: accountId,
      name: account["name"] ?? accountId,
      status: account["status"] ?? "unconfigured",
      platform: account["platform"] ?? "Meta Ads",
      ...(account["overview_state"] ? { overview_state: account["overview_state"] } : {}),
      ...(account["meta_ad_account_id"] ? { meta_ad_account_id: account["meta_ad_account_id"] } : {}),
      iap: null,
      mst: modules.get("mst") ?? { status: "not_available" },
    };
  }

  // ── Full assembly from this account's rows ──────────────────────────
  const conceptPerformance = forAccount(t.conceptPerformance, accountId);
  const campaignWindows = forAccount(t.campaignWindows, accountId);
  const dataQualityFlags = forAccount(t.dataQualityFlags, accountId);
  const libraryCells = forAccount(t.libraryCells, accountId);
  const libraryCellPerformance = forAccount(t.libraryCellPerformance, accountId);
  const variablePerformance = forAccount(t.variablePerformance, accountId);
  const demographicSignal = forAccount(t.demographicSignal, accountId);
  const placementSignal = forAccount(t.placementSignal, accountId);
  const devicePerformance = forAccount(t.devicePerformance, accountId);
  const platformPerformance = forAccount(t.platformPerformance, accountId);
  const placementPerformance = forAccount(t.placementPerformance, accountId);
  const messagePillars = forAccount(t.messagePillars, accountId);
  const testingHypotheses = forAccount(t.testingHypotheses, accountId);
  const icpProfiles = forAccount(t.icpProfiles, accountId);
  const variableCombinations = forAccount(t.variableCombinations, accountId);
  const creativeBriefs = forAccount(t.creativeBriefs, accountId);
  const iapRuns = forAccount(t.iapRuns, accountId);
  const conceptIntelligence = forAccount(t.conceptIntelligence, accountId);
  const failurePatterns = forAccount(t.failurePatterns, accountId);
  const adsRegistry = forAccount(t.adsRegistry, accountId);

  // ── Totals computed from real date-stamped rows ─────────────────────
  const byEvent: Record<string, Row> = {};
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalLinkClicks = 0;
  for (const r of adPerformance) {
    const event = r["result_type"] as string;
    byEvent[event] ??= { spend: 0, reach: 0, impressions: 0, results: 0, clicks_all: 0, link_clicks: 0 };
    byEvent[event]["spend"] += Number(r["spend"] ?? 0);
    byEvent[event]["reach"] += Number(r["reach"] ?? 0);
    byEvent[event]["impressions"] += Number(r["impressions"] ?? 0);
    byEvent[event]["results"] += Number(r["results"] ?? 0);
    byEvent[event]["clicks_all"] += Number(r["clicks_all"] ?? 0);
    byEvent[event]["link_clicks"] += Number(r["link_clicks"] ?? 0);
    totalSpend += Number(r["spend"] ?? 0);
    totalImpressions += Number(r["impressions"] ?? 0);
    totalLinkClicks += Number(r["link_clicks"] ?? 0);
  }
  // ── Account-level totals override (bundle-prep exports) ─────────────
  // Some import packages carry authoritative account-level totals that
  // exceed the ad-level table (ads absent from that export still spent).
  // When iap_metadata.account_totals is present, report those as the
  // account totals — with the ad-level coverage spelled out in the data
  // caveat below, never silently and never via fabricated rows.
  const metadata = (modules.get("iap_metadata") ?? {}) as Row;
  const accountTotals = (metadata["account_totals"] ?? null) as Row | null;
  overrideEventTotals(byEvent, accountTotals);
  const effectiveSpend =
    accountTotals?.["spend"] != null ? Number(accountTotals["spend"]) : totalSpend;
  const effectiveImpressions =
    accountTotals?.["impressions"] != null ? Number(accountTotals["impressions"]) : totalImpressions;

  for (const event of Object.keys(byEvent)) {
    const tot = byEvent[event]!;
    tot["spend"] = round(tot["spend"]);
  }
  const linkCtrPct = effectiveImpressions > 0 ? round((totalLinkClicks / effectiveImpressions) * 100, 4) : 0;

  const windowStart = adPerformance.reduce(
    (min, r) => (r["date_start"] < min ? r["date_start"] : min),
    adPerformance[0]!["date_start"],
  );
  const windowEnd = adPerformance.reduce(
    (max, r) => (r["date_end"] > max ? r["date_end"] : max),
    adPerformance[0]!["date_end"],
  );

  // ── Analysis (verbatim library rows + computed top-checkout views) ──
  const performanceByCell = libraryCellPerformance.map((r) => r["payload"]);
  const variablePerf = variablePerformance.map((r) => r["payload"]);
  const checkout = "onb_initiate_checkout";
  const topCheckoutCells = performanceByCell
    .filter((r) => r["Result type"] === checkout)
    .sort((a, b) => Number(b["Results"] ?? 0) - Number(a["Results"] ?? 0));
  const topCheckoutVariables = variablePerf
    .filter((r) => r["Result type"] === checkout && Number(r["Results"] ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b["Results"] ?? 0) - Number(a["Results"] ?? 0) ||
        String(a["variable_id"]).localeCompare(String(b["variable_id"])),
    );

  // ── Conversion-based device/platform/placement signal ───────────────
  // Rows with tracking_basis='conversion' come from Meta's conversion-
  // device export: funnel actions attributed to the converting device.
  // Spend/impressions are NULL by design (not device-attributable), so
  // no CPA/CTR exist on this surface. Delivery-based rows (tracking_basis
  // NULL) are not surfaced here — different semantics, never mixed.
  const conversionRows = (rows: Row[], key: string) =>
    rows
      .filter((r) => r["tracking_basis"] === "conversion")
      .map((r) => ({
        [key]: r[key],
        date_start: r["date_start"],
        date_end: r["date_end"],
        link_clicks: r["link_clicks"] === null ? null : Number(r["link_clicks"]),
        adds_to_cart: r["adds_to_cart"] === null ? null : Number(r["adds_to_cart"]),
        checkouts_initiated: r["checkouts_initiated"] === null ? null : Number(r["checkouts_initiated"]),
        purchases: r["purchases"] === null ? null : Number(r["purchases"]),
        confidence: r["confidence"],
      }))
      .sort((a, b) => Number(b.link_clicks ?? 0) - Number(a.link_clicks ?? 0));
  const conversionDevices = conversionRows(devicePerformance, "device");
  const conversionPlatforms = conversionRows(platformPerformance, "platform");
  const conversionPlacements = conversionRows(placementPerformance, "placement");
  const conversionTrackingSignal =
    conversionDevices.length + conversionPlatforms.length + conversionPlacements.length > 0
      ? {
          tracking_basis: "conversion",
          window_start: conversionDevices[0]?.date_start ?? conversionPlatforms[0]?.date_start ?? null,
          window_end: conversionDevices[0]?.date_end ?? conversionPlatforms[0]?.date_end ?? null,
          note:
            "Conversion-based tracking: funnel actions are attributed to the converting device/platform/placement. " +
            "Spend and impressions are not device-attributable under this tracking, so no CPA/CTR exist here. " +
            "The export window may differ from the account's campaign window — treat cross-surface comparisons as directional.",
          devices: conversionDevices,
          platforms: conversionPlatforms,
          placements: conversionPlacements,
        }
      : null;

  const analysis = {
    performance_by_cell: performanceByCell,
    v3_variable_performance: variablePerf,
    demographic_registration_signal: demographicSignal.map((r) => r["payload"]),
    v3_placement_signal: placementSignal.filter((r) => r["signal_scope"] === "v3").map((r) => r["payload"]),
    c4e_placement_signal: placementSignal.filter((r) => r["signal_scope"] === "c4e").map((r) => r["payload"]),
    ...(conversionTrackingSignal ? { conversion_tracking_signal: conversionTrackingSignal } : {}),
    top_checkout_cells: topCheckoutCells,
    top_checkout_variables: topCheckoutVariables,
    // Cross-book concept view from the normalized bundle (new, real data)
    concept_rollup: conceptPerformance.map((r) => ({
      book: r["book"],
      concept: r["concept"],
      date_start: r["date_start"],
      date_end: r["date_end"],
      spend: r["spend"] === null ? null : Number(r["spend"]),
      link_clicks: r["link_clicks"] === null ? null : Number(r["link_clicks"]),
      results: r["results"] === null ? null : Number(r["results"]),
      cpa: r["cpa"] === null ? null : Number(r["cpa"]),
      cvr_link_pct: r["cvr_link_pct"] === null ? null : Number(r["cvr_link_pct"]),
      confidence: r["confidence"],
      mapped_in_library: r["mapped_in_library"],
    })),
  };

  // ── Strategy (mapped from the real Strategy Map output) ─────────────
  // Provenance: when the in-app Metrix engine has generated a strategy
  // for this account (source='generated' rows), that set is rendered and
  // the imported set is set aside — never merged (duplicate pillars) and
  // never deleted (importer rows stay untouched). Provenance is surfaced
  // so the UI can badge generated output honestly.
  const generatedPillars = messagePillars.filter((r) => r["source"] === "generated");
  const activePillars = generatedPillars.length > 0 ? generatedPillars : messagePillars;
  const generatedHypotheses = testingHypotheses.filter((r) => r["source"] === "generated");
  const activeHypotheses =
    generatedPillars.length > 0 && generatedHypotheses.length > 0
      ? generatedHypotheses
      : generatedPillars.length > 0
        ? []
        : testingHypotheses;
  const strategyProvenance = generatedPillars.length > 0 ? "generated" : "imported";
  const strategy = {
    provenance: strategyProvenance,
    message_pillars: activePillars.map((row) => {
      const p = row["payload"] as Row;
      const payloadCells = Array.isArray(p["source_cells"])
        ? (p["source_cells"] as string[]).filter((c) => typeof c === "string" && c.length > 0)
        : [];
      return {
        id: p["pillar_id"],
        label: p["pillar_name"],
        source_cells: payloadCells.length > 0 ? payloadCells : conceptRefsFromIcps(p["target_icps"]),
        plain_descriptor: p["strategic_purpose"] ?? "",
        why_it_matters: p["performance_evidence"] ?? "",
        variable_stack: parseVariableStack(p["messaging_framework"]),
        // full loop payload, passed through for richer future UI
        funnel_application: p["funnel_application"],
        execution_specifications: p["execution_specifications"],
        placement_strategy: p["placement_strategy"],
        scaling_guidance: p["scaling_guidance"],
        target_icps: p["target_icps"],
        origin: row["source"] ?? "imported",
      };
    }),
    active_hypotheses: activeHypotheses.map((h) => ({
      id: h["hypothesis_id"],
      label: h["statement"] ?? "",
      source: h["control_ref"] ?? "",
      status: h["priority"] ?? "unprioritized",
      pillar_id: h["pillar_id"] ?? undefined,
      risk: h["risk"] ?? undefined,
      test_variant: h["test_variant"],
      isolated_variable: h["isolated_variable"],
      success_criteria: h["success_criteria"],
      expected_impact: h["expected_impact"],
      origin: h["source"] ?? "imported",
    })),
    icp_profiles: icpProfiles.map((r) => r["payload"]),
    variable_combinations: variableCombinations.map((v) => ({
      combination: v["combination"],
      context: v["context"],
      cpa: v["cpa"] === null ? null : Number(v["cpa"]),
      cvr_pct: v["cvr_pct"] === null ? null : Number(v["cvr_pct"]),
      confidence: v["confidence"],
      recommendation: v["recommendation"],
    })),
    scaling_playbook: modules.get("scaling_playbook") ?? null,
  };

  // ── Brief builder (real Brief Builder output) ───────────────────────
  // Same provenance rule as strategy: an in-app generated brief set is
  // rendered in place of the imported set (never merged, imported rows
  // never touched).
  const generatedBriefs = creativeBriefs.filter((r) => r["source"] === "generated");
  const activeBriefs = generatedBriefs.length > 0 ? generatedBriefs : creativeBriefs;
  const briefBuilder = {
    provenance: generatedBriefs.length > 0 ? "generated" : "imported",
    source_policy:
      generatedBriefs.length > 0
        ? "Briefs were generated in-app by the Metrix engine from this account's stored strategy pillars. Review before production use."
        : "Briefs are the real Brief Builder stage output of the IAP loop run, generated from strategy_map ICPs and pillars.",
    draft_briefs: activeBriefs.map((row) => {
      const b = row["payload"] as Row;
      const meta = (b["brief_metadata"] ?? {}) as Row;
      const foundation = (b["strategic_foundation"] ?? {}) as Row;
      const angleStack = String(foundation["angle_stack"] ?? "");
      return {
        id: meta["brief_id"] ?? row["brief_id"],
        source_pillar: foundation["message_pillar"] ?? meta["strategic_source"] ?? "",
        asset_type: meta["asset_type"] ?? "static",
        human_direction: foundation["data_insight"] ?? "",
        plain_variable_descriptors: angleStack.split("+").map((s: string) => s.trim()).filter(Boolean),
        status: `generated_${String(meta["priority"] ?? "").toLowerCase() || "draft"}`,
        book: row["book"],
        mode: meta["mode"],
        voice: meta["voice"],
        confidence: meta["confidence"],
        full_brief: b,
        origin: row["source"] ?? "imported",
      };
    }),
  };

  // ── Listen cards (account-scoped) ────────────────────────────────────
  const listenCards = t.signalCards
    .filter((c) => c["surface"] === "listen" && c["account_id"] === accountId)
    .map(cardShape);

  // ── Loop stage status (honest pending states) ───────────────────────
  const stageOrder = [
    "bundle_prep",
    "analysis_core",
    "strategy_map",
    "brief_builder",
    "creative_scan",
    "optimization_loop",
  ];
  const loopStatus = stageOrder
    .map((stage) => iapRuns.find((r) => r["stage"] === stage))
    .filter((r): r is Row => Boolean(r))
    .map((r) => ({
      stage: r["stage"],
      status: r["status"],
      window_start: r["window_start"],
      window_end: r["window_end"],
      generated_at: r["generated_at"],
      source_file: r["source_file"],
      note: r["note"],
    }));

  const coreRead = modules.get("core_reanalysis_read") ?? null;
  const mstDoc = modules.get("mst") ?? {};
  const analysisCoreSummary = modules.get("analysis_core_summary") ?? null;

  // ── Avatar ↔ ICP profile mapping (matrix column → strategy profile) ──
  // Historically the matrix avatar columns and the strategy ICP profiles
  // could use disjoint id schemes, so they cannot be joined by key. The
  // strategist-authored bridge is a matrix-mode creative brief, which carries
  // BOTH a matrix cell position (its leading token is the avatar column id,
  // e.g. "C2B" → "C2") and a target ICP profile. We only trust matrix-mode
  // briefs (general-mode briefs use free-text positions) and only keep
  // profile ids that actually exist for this account. As defense in depth,
  // when a grid column declares its own `icp`, we additionally drop any link
  // that disagrees with it — so a mis-numbered cell code can never surface a
  // wrong avatar↔ICP link. Unmatched avatars get no field, so the client
  // shows no link rather than fabricating a join.
  const validProfileIds = new Set(
    icpProfiles
      .map((r) => (r["payload"] as Row | undefined)?.["profile_id"])
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  const columnProfileLinks = new Map<string, Set<string>>();
  for (const row of creativeBriefs) {
    const b = (row["payload"] ?? {}) as Row;
    const meta = (b["brief_metadata"] ?? {}) as Row;
    if (String(meta["mode"] ?? row["mode"] ?? "") !== "matrix") continue;
    const tf = (b["testing_framework"] ?? {}) as Row;
    const sf = (b["strategic_foundation"] ?? {}) as Row;
    const colMatch = String(tf["matrix_position"] ?? "").match(/^(C\d+)/);
    const profileId = String(sf["target_icp"] ?? "").trim().split(/\s+/)[0] ?? "";
    // Trust only ids that actually exist for this account — this is
    // id-scheme-agnostic (ICP_BOOK*_*, LD-ICP-*, etc.), never a hardcoded
    // prefix. An unmatched or free-text position simply yields no link.
    if (!colMatch || !validProfileIds.has(profileId)) continue;
    const colId = colMatch[1]!;
    if (!columnProfileLinks.has(colId)) columnProfileLinks.set(colId, new Set());
    columnProfileLinks.get(colId)!.add(profileId);
  }
  const rawMatrix = (mstDoc["historical_matrix_4x4"] ?? null) as Row | null;
  const matrixWithLinks =
    rawMatrix && Array.isArray(rawMatrix["columns"])
      ? {
          ...rawMatrix,
          columns: (rawMatrix["columns"] as Row[]).map((col) => {
            const links = columnProfileLinks.get(String(col["id"] ?? ""));
            const colIcp = typeof col["icp"] === "string" ? (col["icp"] as string) : "";
            // If the grid column declares its own ICP, only keep links that
            // agree with it (defense in depth against a mis-numbered cell code).
            const matched = links ? [...links].filter((id) => !colIcp || id === colIcp).sort() : [];
            return matched.length > 0 ? { ...col, matched_profile_ids: matched } : col;
          }),
        }
      : rawMatrix;

  // Which books this account's imported window covers (e.g. BOOK0, BOOK2).
  const books = [...new Set(adPerformance.map((r) => String(r["book"] ?? "")).filter(Boolean))].sort();
  const acrossClause = books.length > 0 ? ` across ${humanJoin(books)}` : "";
  // When account-level totals exceed the ad-level table, say so explicitly.
  const coverageNote =
    accountTotals && round(effectiveSpend) !== round(totalSpend)
      ? ` Account totals come from the account-level export; the ad-level table covers $${round(totalSpend)} of the $${round(effectiveSpend)} account spend — the remainder sits on ads absent from the ad-level export.`
      : "";
  const dataCaveat = (
    `Totals cover the full imported window ${windowStart} → ${windowEnd}${acrossClause}.${coverageNote} ` +
    `${coreRead?.["data_caveat"] ?? ""}`
  ).trim();

  return {
    id: accountId,
    name: account["name"] ?? accountId,
    status: account["status"] ?? "configured",
    platform: account["platform"] ?? "Meta Ads",
    facebook_page_dp_url: account["facebook_page_dp_url"] ?? null,
    source_status: account["source_status"] ?? undefined,
    // Numeric Meta ad account id (no "act_" prefix) for Ads Manager deep
    // links. Null until a raw Meta export supplies it via the importer.
    meta_ad_account_id: account["meta_ad_account_id"] ?? null,
    // Creative asset pipeline (verified end-to-end):
    //   1. Admin uploads image/video via POST /accounts/:id/manual-imports
    //      (kind = "creative_asset", ad_names = [matched ad_name values])
    //   2. POST /accounts/:id/sync-creative-links runs syncAllCreativeLinksForAccount:
    //      updates ads.creative_asset_url = servable URL, ads.asset_filename = filename
    //   3. Seed assembly here picks up creative_asset_url + asset_filename from the
    //      ads table and ships them in AdRecord (both fields included below)
    //   4. primaryAdForCell (creative-assembly.ts) resolves the best ad per cell:
    //      prefers cell-code match, falls back to MSTLibraryCell.mapped_ad_names
    //      lookup against ads.ad_name — covers manual accounts with no meta_ads_export
    //   5. CreativeVisual renders <img> or <video> using assetUrl + assetFilename;
    //      isVideoAsset uses assetFilename extension for reliable video detection
    //
    // If creatives still show "No asset": run Re-sync creatives in IAP Library
    // (admin button) or POST /accounts/:id/sync-creative-links from the API.
    ads: adsRegistry.map((r) => ({
      ad_name: r["ad_name"],
      book: r["book"] ?? null,
      cell: r["cell"] ?? null,
      concept: r["concept"] ?? null,
      variation: r["variation"] ?? null,
      test_id: r["test_id"] ?? null,
      meta_ad_id: r["meta_ad_id"] ?? null,
      creative_asset_url: r["creative_asset_url"] ?? null,
      asset_filename: r["asset_filename"] ?? null,
      asset_servable: r["asset_servable"] === true,
    })),
    iap: {
      metadata,
      core_reanalysis_read: coreRead,
      campaign_summary: {
        bottom_line_totals: byEvent,
        total_spend_usd: round(effectiveSpend),
        total_impressions: effectiveImpressions,
        total_link_clicks: totalLinkClicks,
        overall_link_ctr_pct: linkCtrPct,
        data_caveat: dataCaveat,
        window_start: windowStart,
        window_end: windowEnd,
        campaign_windows: campaignWindows.map((w) => ({
          campaign_name: w["campaign_name"],
          book: w["book"],
          os: w["os"],
          date_start: w["date_start"],
          date_end: w["date_end"],
          result_type: w["result_type"],
          spend: w["spend"] === null ? null : Number(w["spend"]),
        })),
      },
      analysis,
      strategy,
      brief_builder: briefBuilder,
      report_builder: modules.get("report_builder") ?? null,
      // Optimization Loop stage has not run — no golden formula exists yet.
      optimization_loop: null,
      intelligence: {
        summary: analysisCoreSummary,
        concept_scores: conceptIntelligence.map((r) => ({
          book: r["book"],
          concept_code: r["concept_code"],
          mapped_in_library: r["mapped_in_library"],
          spend: r["spend"] === null ? null : Number(r["spend"]),
          link_clicks: r["link_clicks"] === null ? null : Number(r["link_clicks"]),
          results: r["results"] === null ? null : Number(r["results"]),
          cpa: r["cpa"] === null ? null : Number(r["cpa"]),
          buying_intent_score: r["buying_intent_score"] === null ? null : Number(r["buying_intent_score"]),
          performance_lift_vs_baseline: r["performance_lift_vs_baseline"],
          performance_tier: r["performance_tier"],
          confidence_level: r["confidence_level"],
          what: r["what"],
          why: r["why"],
          so_what: r["so_what"],
          now_what: r["now_what"],
        })),
        failure_patterns: failurePatterns.map((r) => r["payload"] ?? r),
      },
      data_quality: dataQualityFlags.map((r) => ({ kind: r["kind"], ...r["payload"] })),
      loop_status: loopStatus,
    },
    mst: {
      status: mstDoc["status"] ?? "active",
      render_policy: mstDoc["render_policy"] ?? "",
      local_book2_library: libraryCells.map((r) => r["payload"]),
      historical_matrix_4x4: matrixWithLinks,
      source_artifacts: mstDoc["source_artifacts"] ?? [],
    },
    listen: { signal_cards: listenCards },
  };
}

// ── Cards ────────────────────────────────────────────────────────────
const cardShape = (c: Row) => ({
  id: c["card_id"],
  account_id: c["account_id"],
  scope: c["scope"],
  title: c["title"],
  rationale: c["rationale"],
  impact: c["impact"],
  confidence: c["confidence"],
  source_path: c["source_path"] ?? undefined,
  recommended_action: c["recommended_action"],
  ...(c["manager_card_descriptor"] ? { manager_card_descriptor: c["manager_card_descriptor"] } : {}),
});

// ─── assembly ─────────────────────────────────────────────────────────

export async function assembleMetrixSeed(): Promise<Row> {
  // One fetch per table (account-agnostic), grouped by account_id in
  // memory — query count stays constant no matter how many accounts exist.
  const [
    appConfig,
    adAccounts,
    accountModules,
    signalCards,
    adPerformanceAll,
    conceptPerformanceAll,
    campaignWindowsAll,
    dataQualityFlagsAll,
    libraryCellsAll,
    libraryCellPerformanceAll,
    variablePerformanceAll,
    demographicSignalAll,
    placementSignalAll,
    devicePerformanceAll,
    platformPerformanceAll,
    placementPerformanceAll,
    messagePillarsAll,
    testingHypothesesAll,
    icpProfilesAll,
    variableCombinationsAll,
    creativeBriefsAll,
    iapRunsAll,
    variableRegistry,
    conceptIntelligenceAll,
    failurePatternsAll,
    adsRegistryAll,
  ] = await Promise.all([
    selectAll("app_config"),
    selectAll("ad_accounts", (q) => q.order("id")),
    selectAll("account_modules"),
    selectAll("signal_cards", (q) => q.order("id")),
    selectAll("ad_performance"),
    selectAll("concept_performance", (q) => q.order("book").order("concept")),
    selectAll("campaign_windows", (q) => q.order("date_start")),
    selectAll("data_quality_flags", (q) => q.order("id")),
    selectAll("library_cells", (q) => q.order("row_index")),
    selectAll("library_cell_performance", (q) => q.order("id")),
    selectAll("variable_performance", (q) => q.order("id")),
    selectAll("demographic_signal", (q) => q.order("row_index")),
    selectAll("placement_signal", (q) => q.order("signal_scope").order("row_index")),
    selectAll("device_performance", (q) => q.order("id")),
    selectAll("platform_performance", (q) => q.order("id")),
    selectAll("placement_performance", (q) => q.order("id")),
    selectAll("message_pillars", (q) => q.order("id")),
    selectAll("testing_hypotheses", (q) => q.order("hypothesis_id")),
    selectAll("icp_profiles", (q) => q.order("id")),
    selectAll("variable_combinations", (q) => q.order("id")),
    selectAll("imported_creative_briefs", (q) => q.order("brief_id")),
    selectAll("iap_runs"),
    selectAll("variable_registry", (q) => q.order("status").order("prefix")),
    selectAll("concept_intelligence", (q) => q.order("book").order("concept_code")),
    selectAll("failure_patterns", (q) => q.order("id")),
    selectAll("ads", (q) => q.order("ad_name")),
  ]);

  if (adAccounts.length === 0 || adPerformanceAll.length === 0) {
    throw new Error(
      "Supabase holds no imported Metrix data yet. Run: pnpm --filter @workspace/scripts run import:metrix",
    );
  }

  // ── Global concept registry ────────────────────────────────────────
  // Keyed by concept_code (matrix codes like C2B, C4E) or the raw
  // concept_intelligence code (like C2, LD-CN-001). We index both so
  // that source_cells (variant-level, e.g. C2B) and concept_intelligence
  // codes (column-level, e.g. C2) are discoverable.
  //
  // Priority for descriptor text:
  //   1. concept_descriptor (new DB column, per-account override)
  //   2. first sentence of `what` (natural language description)
  //   3. cleaned code parse fallback
  //
  // source_cells: library cells whose cell_id matches the concept_code or
  // whose concept_id matches. For matrix concepts this is typically 1:1.
  //
  // The registry is global (not per-account) — all accounts share the same
  // concept codes and the same rendered labels.

  const conceptRegistry: Record<string, {
    code: string;
    descriptor: string;
    book: string | null;
    what: string | null;
    why: string | null;
    source_cells: string[];
  }> = {};

  const libraryCellsByConceptId = new Map<string, string[]>();
  for (const lc of libraryCellsAll) {
    const conceptId = String(lc["concept_id"] ?? "");
    const cellId = String(lc["cell_id"] ?? "");
    if (!conceptId || !cellId) continue;
    if (!libraryCellsByConceptId.has(conceptId)) libraryCellsByConceptId.set(conceptId, []);
    libraryCellsByConceptId.get(conceptId)!.push(cellId);
    // Also index by cell_id directly (1:1 for matrix variant codes)
    if (!libraryCellsByConceptId.has(cellId)) libraryCellsByConceptId.set(cellId, []);
    libraryCellsByConceptId.get(cellId)!.push(cellId);
  }

  // Index library cell_ids for direct concept_code → cell_id matching
  const libraryCellIdSet = new Set(libraryCellsAll.map((lc) => String(lc["cell_id"] ?? "")));

  for (const row of conceptIntelligenceAll) {
    const code = String(row["concept_code"] ?? "");
    if (!code) continue;

    // Descriptor: DB override > what > fallback
    const rawWhat = row["what"] ? String(row["what"]) : null;
    const dbDescriptor = row["concept_descriptor"] ? String(row["concept_descriptor"]) : null;
    const whatDescriptor = rawWhat
      ? (rawWhat.split(/\.\s/)[0] ?? rawWhat).slice(0, 100).trim()
      : null;

    // Cleaned code parse: "C2B" → "Concept C2 · B", "LD-CN-001" → "LD CN 001"
    const codeDescriptor = /^C\d+[A-Z]$/.test(code)
      ? `Concept ${code.replace(/([A-Z])$/, " · $1")}`
      : /^C\d+$/.test(code)
        ? `Concept ${code}`
        : code.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

    const descriptor = dbDescriptor ?? whatDescriptor ?? codeDescriptor;

    // source_cells: library cells for this concept code or its variants
    const directCells = libraryCellsByConceptId.get(code) ?? [];
    // For column-level codes (e.g. "C2"), also collect cells whose cell_id starts with code
    // (e.g. C2A, C2B, C2C) to cover all variants.
    const variantCells = libraryCellIdSet.has(code)
      ? [code]
      : [...libraryCellIdSet].filter((id) => id.startsWith(code) && /^[A-Z]$/.test(id.slice(code.length)));
    const sourceCells = [...new Set([...directCells, ...variantCells])].filter(Boolean);
    // Fallback: if this code itself looks like a valid cell_id, include it.
    if (sourceCells.length === 0 && /^C\d+[A-Z]$/.test(code)) {
      sourceCells.push(code);
    }

    // Prefer the entry with an explicit concept_descriptor (per-account override)
    const existing = conceptRegistry[code];
    if (!existing || (dbDescriptor && !existing.descriptor.startsWith("Concept "))) {
      conceptRegistry[code] = {
        code,
        descriptor,
        book: row["book"] ?? null,
        what: rawWhat,
        why: row["why"] ? String(row["why"]) : null,
        source_cells: sourceCells.length > 0 ? sourceCells : [code],
      };
    }
  }

  const tables: AccountTables = {
    adPerformance: groupByAccount(adPerformanceAll),
    conceptPerformance: groupByAccount(conceptPerformanceAll),
    campaignWindows: groupByAccount(campaignWindowsAll),
    dataQualityFlags: groupByAccount(dataQualityFlagsAll),
    libraryCells: groupByAccount(libraryCellsAll),
    libraryCellPerformance: groupByAccount(libraryCellPerformanceAll),
    variablePerformance: groupByAccount(variablePerformanceAll),
    demographicSignal: groupByAccount(demographicSignalAll),
    placementSignal: groupByAccount(placementSignalAll),
    devicePerformance: groupByAccount(devicePerformanceAll),
    platformPerformance: groupByAccount(platformPerformanceAll),
    placementPerformance: groupByAccount(placementPerformanceAll),
    messagePillars: groupByAccount(messagePillarsAll),
    testingHypotheses: groupByAccount(testingHypothesesAll),
    icpProfiles: groupByAccount(icpProfilesAll),
    variableCombinations: groupByAccount(variableCombinationsAll),
    creativeBriefs: groupByAccount(creativeBriefsAll),
    iapRuns: groupByAccount(iapRunsAll),
    conceptIntelligence: groupByAccount(conceptIntelligenceAll),
    failurePatterns: groupByAccount(failurePatternsAll),
    adsRegistry: groupByAccount(adsRegistryAll),
    accountModules,
    signalCards,
  };

  const config = new Map(appConfig.map((r) => [r["key"], r["value"]]));

  // ── Every registered account, assembled generically ─────────────────
  const accountObjects = adAccounts.map((account) => buildAccountObject(account, tables));

  // ── Manager totals across ALL accounts with real performance rows ───
  // Blended per account so the same account-level totals override used in
  // buildAccountObject applies here too — manager totals always equal the
  // sum of the per-account totals shown in the app.
  const byEvent: Record<string, Row> = {};
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalLinkClicks = 0;
  for (const account of adAccounts) {
    const accountId = String(account["id"]);
    const local: Record<string, Row> = {};
    let rowSpend = 0;
    let rowImpressions = 0;
    for (const r of tables.adPerformance.get(accountId) ?? []) {
      const event = r["result_type"] as string;
      local[event] ??= zeroEventTotals();
      local[event]["spend"] += Number(r["spend"] ?? 0);
      local[event]["reach"] += Number(r["reach"] ?? 0);
      local[event]["impressions"] += Number(r["impressions"] ?? 0);
      local[event]["results"] += Number(r["results"] ?? 0);
      local[event]["clicks_all"] += Number(r["clicks_all"] ?? 0);
      local[event]["link_clicks"] += Number(r["link_clicks"] ?? 0);
      rowSpend += Number(r["spend"] ?? 0);
      rowImpressions += Number(r["impressions"] ?? 0);
      totalLinkClicks += Number(r["link_clicks"] ?? 0);
    }
    const modules = modulesFor(accountModules, accountId);
    const accountTotals = ((modules.get("iap_metadata") ?? {}) as Row)["account_totals"] as
      | Row
      | null
      | undefined;
    overrideEventTotals(local, accountTotals);
    for (const [event, tvals] of Object.entries(local)) {
      byEvent[event] ??= zeroEventTotals();
      for (const key of Object.keys(tvals)) {
        byEvent[event]![key] += Number(tvals[key] ?? 0);
      }
    }
    totalSpend += accountTotals?.["spend"] != null ? Number(accountTotals["spend"]) : rowSpend;
    totalImpressions +=
      accountTotals?.["impressions"] != null ? Number(accountTotals["impressions"]) : rowImpressions;
  }
  for (const event of Object.keys(byEvent)) {
    const t = byEvent[event]!;
    t["spend"] = round(t["spend"]);
  }
  const linkCtrPct = totalImpressions > 0 ? round((totalLinkClicks / totalImpressions) * 100, 4) : 0;

  const managerCards = signalCards.filter((c) => c["surface"] === "manager_overview").map(cardShape);
  const managerMeta = (config.get("manager_account_meta") ?? {}) as Row;
  const configured = adAccounts.filter((a) => a["status"] === "configured").length;

  return {
    schema_version: "2.0.0-supabase",
    generated_at: (config.get("generated_at") as string) ?? new Date().toISOString().slice(0, 10),
    integrity_note:
      (config.get("integrity_note") as string) ??
      "Assembled from Supabase tables imported from the real Bookster IAP loop package.",
    app_defaults: config.get("app_defaults") ?? null,
    manager_account: {
      id: managerMeta["id"] ?? "manager_main",
      name: managerMeta["name"] ?? "Manager account",
      type: managerMeta["type"] ?? "manager",
      overview_mode: managerMeta["overview_mode"] ?? "aggregate_totals_only",
      configured_ad_accounts: configured,
      unconfigured_ad_accounts: adAccounts.length - configured,
      bottom_line_totals: {
        spend_usd: round(totalSpend),
        impressions: totalImpressions,
        link_clicks: totalLinkClicks,
        link_ctr_pct: linkCtrPct,
        result_totals_by_event: byEvent,
      },
      recommendation_cards: managerCards,
    },
    ad_accounts: accountObjects,
    concept_registry: conceptRegistry,
    variable_registry: variableRegistry.map((r) => ({
      prefix: r["prefix"],
      family: r["family"],
      status: r["status"],
      note: r["note"],
    })),
  };
}

// ── tiny cache so repeated page loads don't refire ~20 REST queries ────
let cached: { at: number; data: Row } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getMetrixSeedFromSupabase(): Promise<Row> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const data = await assembleMetrixSeed();
  cached = { at: Date.now(), data };
  return data;
}

/** Drop the cached bundle (e.g. after a new account is registered). */
export function invalidateMetrixSeedCache(): void {
  cached = null;
}

// ─── per-user authorization view ──────────────────────────────────────
// Members see only the ad accounts they have been granted; admins see
// everything ("all" bypasses filtering entirely). The full bundle stays
// cached once; this derives a per-user view WITHOUT mutating the cached
// object. Manager totals are re-summed from the visible accounts'
// campaign summaries (which already reflect any account-level totals
// overrides), so a member's manager blend never leaks numbers from
// accounts they cannot see. An empty grant set is a valid state: the
// client gets ad_accounts: [] and renders onboarding — never an error.

const TOTAL_FIELDS = ["spend", "reach", "impressions", "results", "clicks_all", "link_clicks"] as const;

export function composeSeedForUser(
  bundle: Row,
  allowed: Set<string> | "all",
  options?: { viewAgencyRollups?: boolean },
): Row {
  if (allowed === "all") return bundle;

  const accounts = ((bundle["ad_accounts"] as Row[]) ?? []).filter((a) =>
    allowed.has(String(a["id"])),
  );

  // A member with view_agency_rollups sees manager-level totals across ALL
  // accounts (not just their own grants) — the master permission is
  // specifically about seeing the agency-wide picture, independent of which
  // individual ad accounts they've been granted for drill-down access.
  if (options?.viewAgencyRollups) {
    return { ...bundle, ad_accounts: accounts };
  }

  const byEvent: Record<string, Row> = {};
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalLinkClicks = 0;
  for (const account of accounts) {
    const summary = (account["iap"] as Row | null)?.["campaign_summary"] as Row | undefined;
    if (!summary) continue;
    totalSpend += Number(summary["total_spend_usd"] ?? 0);
    totalImpressions += Number(summary["total_impressions"] ?? 0);
    totalLinkClicks += Number(summary["total_link_clicks"] ?? 0);
    const accountByEvent = (summary["bottom_line_totals"] ?? {}) as Record<string, Row>;
    for (const [event, totals] of Object.entries(accountByEvent)) {
      const target = (byEvent[event] ??= {
        spend: 0, reach: 0, impressions: 0, results: 0, clicks_all: 0, link_clicks: 0,
      });
      for (const field of TOTAL_FIELDS) {
        target[field] = Number(target[field] ?? 0) + Number(totals?.[field] ?? 0);
      }
    }
  }
  for (const event of Object.keys(byEvent)) {
    byEvent[event]!["spend"] = round(byEvent[event]!["spend"]);
  }

  const manager = (bundle["manager_account"] ?? {}) as Row;
  const configured = accounts.filter((a) => a["status"] === "configured").length;
  const managerCards = ((manager["recommendation_cards"] as Row[]) ?? []).filter(
    (c) => c["account_id"] != null && allowed.has(String(c["account_id"])),
  );

  return {
    ...bundle,
    manager_account: {
      ...manager,
      configured_ad_accounts: configured,
      unconfigured_ad_accounts: accounts.length - configured,
      bottom_line_totals: {
        spend_usd: round(totalSpend),
        impressions: totalImpressions,
        link_clicks: totalLinkClicks,
        link_ctr_pct: totalImpressions > 0 ? round((totalLinkClicks / totalImpressions) * 100, 4) : 0,
        result_totals_by_event: byEvent,
      },
      recommendation_cards: managerCards,
    },
    ad_accounts: accounts,
  };
}
