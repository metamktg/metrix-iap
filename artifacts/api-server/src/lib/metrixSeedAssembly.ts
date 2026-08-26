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
import {
  resolveCurrentGeneratedSet,
  runOrderKey,
  successfulRunsNewestFirst,
} from "./generatedCurrency";
import { syncAllCreativeLinksForAccount } from "./analysisEngine";
import { resolveAccountObjectives } from "./cohortConfig";
import { logger } from "./logger";

type Row = Record<string, any>;

// ─── helpers ──────────────────────────────────────────────────────────

const round = (v: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export async function selectAll(table: string, build?: (q: any) => any, columns = "*"): Promise<Row[]> {
  const supabase = getSupabase();
  // Paginate in 1000-row pages so large tables (device_performance,
  // demographic_performance, etc.) are fetched in full even when the
  // Supabase / PostgREST server-side row limit is 1000.
  //
  // `columns` exists for tables carrying bytea payloads: select("*") on
  // manual_imports dragged every uploaded file's full content through
  // PostgREST on each seed assembly — fine at a handful of assets, fatal at
  // a real creative library (observed live: 125 assets ≈ 257 MB of bytea ≈
  // half a gigabyte of hex JSON in one page; the seed request never
  // completed and production hung on the splash screen). Callers touching
  // such tables MUST enumerate the metadata columns they need.
  const PAGE_SIZE = 1000;
  let offset = 0;
  const allRows: Row[] = [];
  for (;;) {
    let query: any = supabase.from(table).select(columns);
    if (build) query = build(query);
    query = query.range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) {
      throw new Error(`Supabase query failed for "${table}": ${error.message}`);
    }
    const rows: Row[] = data ?? [];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows;
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

/**
 * Pure helper: given a list of manual_imports rows (kind=creative_asset,
 * with non-null ad_names) and the current ads table rows, returns the
 * account_ids that have at least one creative import mapping but none of
 * the mapped ad_names have a non-null creative_asset_url. These accounts
 * have had their creative links wiped (e.g. by a re-import upsert) and
 * need syncAllCreativeLinksForAccount to restore them.
 *
 * Exported for unit testing — keeps the detection logic as a pure function
 * independent of Supabase calls.
 */
export function detectAccountsNeedingCreativeSync(
  manualImports: Row[],
  ads: Row[],
): string[] {
  // Regression diagnosis (three known vectors that land here):
  //   (a) Re-import / analysis wipe: ads.upsert with ignoreDuplicates:false
  //       resets creative_asset_url to NULL on existing rows — sync is not
  //       re-triggered automatically so URLs stay NULL until the next UI action.
  //   (b) Seed assembly reads whatever creative_asset_url is in ads at build
  //       time. If it's NULL, the seed ships NULL and every card shows a placeholder.
  //   (c) mapped_ad_names string drift: if ad_names in manual_imports diverged
  //       from ads.ad_name (case, trimming, re-import rename) then the sync
  //       call itself has no rows to UPDATE and returns 0 linked — the ad row
  //       exists but the URL never gets set.
  const importsByAccount = groupByAccount(manualImports);
  const adsByAccount = groupByAccount(ads);
  const needSync: string[] = [];
  for (const [accountId, imports] of importsByAccount) {
    const allMappedNames = imports.flatMap(
      (imp) => (imp["ad_names"] as string[] | null) ?? [],
    );
    if (allMappedNames.length === 0) continue;
    const mappedNameSet = new Set(allMappedNames);
    const accountAds = adsByAccount.get(accountId) ?? [];
    const hasLinkedAd = accountAds.some(
      (ad) => mappedNameSet.has(String(ad["ad_name"] ?? "")) && ad["creative_asset_url"] != null,
    );
    if (!hasLinkedAd) needSync.push(accountId);
  }
  return needSync;
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
    const m = icp.match(/_(C\d[A-Za-z]?)_/i);
    if (m?.[1]) refs.add(m[1].toUpperCase());
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
  cellCreativeOverrides: Map<string, Row[]>;
  creativeDeconstructions: Map<string, Row[]>;
  generationRuns: Map<string, Row[]>;
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
  const creativeDeconstructions = forAccount(t.creativeDeconstructions, accountId).map(
    deconstructionSeedShape,
  );

  // ── No performance data yet → honest pending/unconfigured shape ─────
  if (adPerformance.length === 0) {
    return {
      id: accountId,
      name: account["name"] ?? accountId,
      status: account["status"] ?? "unconfigured",
      platform: account["platform"] ?? "Meta Ads",
      // Configured objectives (Settings → General); legacy single-cohort
      // rows resolve to their one objective — never a silent default.
      objectives: resolveAccountObjectives(account),
      ...(account["overview_state"] ? { overview_state: account["overview_state"] } : {}),
      ...(account["meta_ad_account_id"] ? { meta_ad_account_id: account["meta_ad_account_id"] } : {}),
      iap: null,
      mst: modules.get("mst") ?? { status: "not_available" },
      creative_deconstructions: creativeDeconstructions,
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
  const generationRuns = forAccount(t.generationRuns, accountId);
  const iapRuns = forAccount(t.iapRuns, accountId);
  const conceptIntelligence = forAccount(t.conceptIntelligence, accountId);
  const failurePatterns = forAccount(t.failurePatterns, accountId);
  const adsRegistry = forAccount(t.adsRegistry, accountId);
  const cellCreativeOverrides = forAccount(t.cellCreativeOverrides, accountId);

  // ── Warn on mapped_ad_names mismatches (regression detector) ────────
  // If a library cell declares mapped_ad_names but NONE of those names
  // exist in the current ads registry for this account, the card will show
  // a "No asset" placeholder. This can happen when the ad_names strings
  // in manual_imports diverged from ads.ad_name (case change, re-import
  // rename, or a wipe that wasn't re-synced). Log a structured warning so
  // the regression is detectable in server logs before a user reports it.
  const adNameSet = new Set(adsRegistry.map((r) => String(r["ad_name"] ?? "")));
  for (const lc of libraryCells) {
    const payload = (lc["payload"] ?? {}) as Row;
    const mappedNames = (payload["mapped_ad_names"] as string[] | null | undefined) ?? [];
    if (mappedNames.length === 0) continue;
    const hasMatch = mappedNames.some((n) => adNameSet.has(n));
    if (!hasMatch) {
      logger.warn(
        { accountId, cellId: lc["cell_id"], unmatchedNames: mappedNames },
        "seed assembly: mapped_ad_names produced zero ad matches — cell will show 'No asset' placeholder",
      );
    }
  }

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
  // When iap_metadata.account_totals is present, use it only when it is
  // LARGER than the DB sum — this prevents a stale or incorrect bundle
  // value from replacing a correct (and larger) DB-computed total.
  // The override is intentionally additive/ceiling, never a floor reducer.
  const metadata = (modules.get("iap_metadata") ?? {}) as Row;
  const accountTotals = (metadata["account_totals"] ?? null) as Row | null;
  overrideEventTotals(byEvent, accountTotals);
  const effectiveSpend =
    accountTotals?.["spend"] != null
      ? Math.max(totalSpend, Number(accountTotals["spend"]))
      : totalSpend;
  const effectiveImpressions =
    accountTotals?.["impressions"] != null
      ? Math.max(totalImpressions, Number(accountTotals["impressions"]))
      : totalImpressions;

  for (const event of Object.keys(byEvent)) {
    const tot = byEvent[event]!;
    tot["spend"] = round(tot["spend"]);
  }
  // Guard: link_clicks > impressions is physically impossible for delivery data.
  // When it occurs the rows came from a conversion-event export that carries
  // attributed clicks but no delivery impressions — CTR is meaningless, emit null
  // so the UI renders "—" rather than an absurd percentage (e.g. 154 250 %).
  const linkCtrPct =
    effectiveImpressions > 0 && totalLinkClicks <= effectiveImpressions
      ? round((totalLinkClicks / effectiveImpressions) * 100, 4)
      : null;

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

  // ── Delivery-based device signal ─────────────────────────────────────
  // device_kind='impression' rows (tracking_basis NULL/'delivery') carry real
  // spend/impressions per device, mirroring v3/c4e placement signal shape.
  // Meta's export can omit this breakdown entirely for a given window (see
  // analysisEngine's device-coverage csv_warnings) — in that case this array
  // is simply empty and the UI falls back to conversion_tracking_signal.devices
  // (funnel-attributed, not delivery) with honest labeling, never blended.
  const deliveryDevices = devicePerformance
    .filter((r) => r["device_kind"] === "impression" && r["tracking_basis"] !== "conversion")
    .map((r) => ({
      device: r["device"],
      date_start: r["date_start"],
      date_end: r["date_end"],
      spend: r["spend"] === null ? null : Number(r["spend"]),
      impressions: r["impressions"] === null ? null : Number(r["impressions"]),
      link_clicks: r["link_clicks"] === null ? null : Number(r["link_clicks"]),
      results: r["results"] === null ? null : Number(r["results"]),
      cpa: r["cpa"] === null ? null : Number(r["cpa"]),
    }))
    .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0));

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
    device_delivery_signal: deliveryDevices,
    ...(conversionTrackingSignal ? { conversion_tracking_signal: conversionTrackingSignal } : {}),
    top_checkout_cells: topCheckoutCells,
    top_checkout_variables: topCheckoutVariables,
    // Cross-book concept view from the normalized bundle (new, real data)
    concept_rollup: conceptPerformance.map((r) => ({
      book: r["book"],
      concept: r["concept"],
      date_start: r["date_start"],
      date_end: r["date_end"],
      manual_analysis_run_id: r["manual_analysis_run_id"] ?? null,
      spend: r["spend"] === null ? null : Number(r["spend"]),
      link_clicks: r["link_clicks"] === null ? null : Number(r["link_clicks"]),
      results: r["results"] === null ? null : Number(r["results"]),
      cpa: r["cpa"] === null ? null : Number(r["cpa"]),
      cvr_link_pct: r["cvr_link_pct"] === null ? null : Number(r["cvr_link_pct"]),
      confidence: r["confidence"],
      mapped_in_library: r["mapped_in_library"],
      // Stage 2 Analysis Core fields — populated after each analysis run
      buying_intent_score: r["buying_intent_score"] === null || r["buying_intent_score"] === undefined
        ? null : Number(r["buying_intent_score"]),
      performance_lift_vs_baseline: r["performance_lift_vs_baseline"] ?? null,
      performance_tier: r["performance_tier"] ?? null,
      confidence_level: r["confidence_level"] ?? null,
    })),
  };

  // ── Strategy (mapped from the real Strategy Map output) ─────────────
  // Provenance: when the in-app Metrix engine has generated a strategy for
  // this account, that set is rendered and the imported set is set aside —
  // never merged (duplicate pillars) and never deleted (importer rows stay
  // untouched). Provenance is surfaced so the UI can badge generated output
  // honestly.
  //
  // Generated sets are now retained across runs (GAP-01), so `source =
  // 'generated'` no longer identifies ONE set: each is narrowed to the
  // current run before it is compared against the imported set.
  const strategyRuns = successfulRunsNewestFirst(generationRuns, "strategy");
  const currentPillarSet = resolveCurrentGeneratedSet(
    messagePillars.filter((r) => r["source"] === "generated"),
    strategyRuns,
  );
  const generatedPillars = currentPillarSet.rows;
  // Same rule as briefs below: the imported fallback is filtered explicitly,
  // never the raw array, so an archived set can never render beside it.
  const importedPillars = messagePillars.filter((r) => r["source"] !== "generated");
  const activePillars = generatedPillars.length > 0 ? generatedPillars : importedPillars;
  // ICP profiles generate independently of pillars (Strategy Map's
  // "ICP Profile Registry" output) — the same generated-preferred-over-
  // imported swap, but on its own generated-set check, not gated on pillars.
  const generatedIcpProfiles = resolveCurrentGeneratedSet(
    icpProfiles.filter((r) => r["source"] === "generated"),
    strategyRuns,
  ).rows;
  const importedIcpProfiles = icpProfiles.filter((r) => r["source"] !== "generated");
  const activeIcpProfiles = generatedIcpProfiles.length > 0 ? generatedIcpProfiles : importedIcpProfiles;
  const generatedHypotheses = resolveCurrentGeneratedSet(
    testingHypotheses.filter((r) => r["source"] === "generated"),
    strategyRuns,
  ).rows;
  const activeHypotheses =
    generatedPillars.length > 0 && generatedHypotheses.length > 0
      ? generatedHypotheses
      : generatedPillars.length > 0
        ? []
        : testingHypotheses.filter((r) => r["source"] !== "generated");
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
    icp_profiles: activeIcpProfiles.map((r) => ({
      ...(r["payload"] as Row),
      origin: r["source"] ?? "imported",
    })),
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
  // Currency for briefs carries one extra condition. A strategy run used
  // to DELETE the generated briefs, because they reference pillars it had
  // just replaced. It no longer does — so "latest successful briefs run"
  // alone would keep rendering a set built against pillars that are no
  // longer the ones on screen. A brief set is current only if it was
  // generated AFTER the strategy set being rendered; otherwise it is
  // retained as archive and the seed falls back to the imported briefs,
  // which is exactly what the delete used to produce.
  const currentBriefSet = resolveCurrentGeneratedSet(
    creativeBriefs.filter((r) => r["source"] === "generated"),
    successfulRunsNewestFirst(generationRuns, "briefs"),
  );
  const briefsPredateRenderedStrategy =
    currentBriefSet.run !== null &&
    currentPillarSet.run !== null &&
    runOrderKey(currentBriefSet.run.started_at) < runOrderKey(currentPillarSet.run.started_at);
  const generatedBriefs = briefsPredateRenderedStrategy ? [] : currentBriefSet.rows;
  // Fall back to the IMPORTED rows explicitly. Before archiving, the raw array
  // held nothing else — the generated rows had been deleted — so falling back
  // to it was the same thing. It is not any more: archived and demoted sets
  // still sit in this array, and returning it whole would render superseded
  // briefs beside the imported ones as if they were one live set.
  const importedBriefs = creativeBriefs.filter((r) => r["source"] !== "generated");
  const activeBriefs = generatedBriefs.length > 0 ? generatedBriefs : importedBriefs;
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
    const colMatch = String(tf["matrix_position"] ?? "").match(/^(C\d+)/i);
    const profileId = String(sf["target_icp"] ?? "").trim().split(/\s+/)[0] ?? "";
    // Trust only ids that actually exist for this account — this is
    // id-scheme-agnostic (ICP_BOOK*_*, LD-ICP-*, etc.), never a hardcoded
    // prefix. An unmatched or free-text position simply yields no link.
    if (!colMatch || !validProfileIds.has(profileId)) continue;
    const colId = colMatch[1]!.toUpperCase();
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
    // Configured objectives (Settings → General); legacy single-cohort
    // rows resolve to their one objective — never a silent default.
    objectives: resolveAccountObjectives(account),
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
    ads: (() => {
      // Build a map of cell_id → override URL+filename from cell_creative_overrides.
      // These are direct per-cell uploads that bypass the ad-name matching flow.
      const cellOverrideMap = new Map<string, { url: string; filename: string }>();
      for (const o of cellCreativeOverrides) {
        const cellId = String(o["cell_id"] ?? "");
        if (cellId) {
          cellOverrideMap.set(cellId, {
            url: `/api/metrix/accounts/${accountId}/cells/${cellId}/creative`,
            filename: String(o["filename"] ?? ""),
          });
        }
      }
      // Per-ad performance aggregates so the client can render an ad-level
      // tile for EVERY ad in the analysis — including ads with no cell /
      // concept code (common for manual imports of historical accounts).
      const perAdStats = new Map<
        string,
        { spend: number; results: number; impressions: number; link_clicks: number; result_type: string | null }
      >();
      for (const r of adPerformance) {
        const name = String(r["ad_name"] ?? "");
        if (!name) continue;
        const s = perAdStats.get(name) ?? { spend: 0, results: 0, impressions: 0, link_clicks: 0, result_type: null };
        s.spend       += Number(r["spend"] ?? 0);
        s.results     += Number(r["results"] ?? 0);
        s.impressions += Number(r["impressions"] ?? 0);
        s.link_clicks += Number(r["link_clicks"] ?? 0);
        s.result_type ??= r["result_type"] ? String(r["result_type"]) : null;
        perAdStats.set(name, s);
      }
      // Apply overrides to existing ad rows (replaces their creative URL).
      const baseAds = adsRegistry.map((r) => {
        const cellId = r["cell"] ? String(r["cell"]) : null;
        const override = cellId ? cellOverrideMap.get(cellId) : undefined;
        return {
          ad_name: r["ad_name"],
          book: r["book"] ?? null,
          cell: cellId,
          concept: r["concept"] ?? null,
          variation: r["variation"] ?? null,
          test_id: r["test_id"] ?? null,
          meta_ad_id: r["meta_ad_id"] ?? null,
          creative_asset_url: override ? override.url : (r["creative_asset_url"] ?? null),
          asset_filename: override ? override.filename : (r["asset_filename"] ?? null),
          asset_servable: override ? true : r["asset_servable"] === true,
          performance: perAdStats.get(String(r["ad_name"] ?? "")) ?? null,
        };
      });
      // For cells with an override but no matching ad row (library-only cells),
      // inject a synthetic ad record so primaryAdForCell can resolve the visual.
      const adCellIds = new Set(baseAds.map((a) => a.cell).filter(Boolean));
      const syntheticAds = [...cellOverrideMap.entries()]
        .filter(([cellId]) => !adCellIds.has(cellId))
        .map(([cellId, { url, filename }]) => ({
          ad_name: `__cell_override_${cellId}`,
          book: null,
          cell: cellId,
          concept: null,
          variation: null,
          test_id: null,
          meta_ad_id: null,
          creative_asset_url: url,
          asset_filename: filename,
          asset_servable: true,
        }));
      return [...baseAds, ...syntheticAds];
    })(),
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
    creative_deconstructions: creativeDeconstructions,
  };
}

// ── Creative deconstruction classifications (per-account seed shape) ──
// Content bytes never leave the DB; only the classification metadata the
// client needs for badges + the review queue is exposed.
const deconstructionSeedShape = (r: Row): Row => ({
  id: String(r["id"]),
  manual_import_id: String(r["manual_import_id"]),
  filename: r["filename"],
  ad_names: Array.isArray(r["ad_names"]) ? r["ad_names"] : [],
  status: r["status"],
  variables: Array.isArray(r["variables"]) ? r["variables"] : [],
  overall_confidence: r["overall_confidence"] != null ? Number(r["overall_confidence"]) : null,
  detected_copy: r["detected_copy"] ?? null,
  brief_ref: r["brief_ref"] ?? null,
  brief_variables: Array.isArray(r["brief_variables"]) ? r["brief_variables"] : null,
  cell_id: r["cell_id"] ?? null,
  overridden_by: r["overridden_by"] ?? null,
  overridden_at: r["overridden_at"] ?? null,
  created_at: String(r["created_at"]),
  updated_at: String(r["updated_at"]),
});

// ── Cards ────────────────────────────────────────────────────────────
// ── Signal card shape, including the structured contract (E1) ─────────
//
// A card's analysis is prose, so the UI can only render sentences. The
// structured fields below state the parts a card FACE needs — the number,
// what it is measured against, the one-line reading — alongside the prose,
// which becomes the disclosure-layer `body`.
//
// They are null whenever the producer did not supply them, and nothing here
// derives them from the prose. Regex-mangling "Spend recorded ($57.97) is
// 5.8% of the committed ~$1,000" into a headline and a metric would be
// fabricating structure the producer never asserted, and a card face is
// exactly where a fabricated number does the most damage. A card with no
// structured fields renders from `title`/`rationale` as it does today.
//
// `action` and `evidence_ref` are the existing `recommended_action` and
// `source_path` under the contract's names — the same values, not new ones —
// and both original keys stay for callers already reading them.
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
  // ── structured contract ──
  headline: c["headline"] ?? null,
  metric_value: c["metric_value"] ?? null,
  metric_context: c["metric_context"] ?? null,
  delta_pct: c["delta_pct"] === null || c["delta_pct"] === undefined ? null : Number(c["delta_pct"]),
  implication: c["implication"] ?? null,
  action: c["recommended_action"] ?? null,
  evidence_ref: c["source_path"] ?? null,
  body: c["rationale"] ?? null,
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
    cellCreativeOverridesAll,
    manualImportsCreativeAll,
    creativeDeconstructionsAll,
    generationRunsAll,
  ] = await Promise.all([
    selectAll("app_config", (q) => q.order("key")),
    selectAll("ad_accounts", (q) => q.order("id")),
    selectAll("account_modules", (q) => q.order("account_id").order("module")),
    selectAll("signal_cards", (q) => q.order("id")),
    selectAll("ad_performance", (q) => q.order("id")),
    selectAll("concept_performance", (q) => q.order("book").order("concept").order("id")),
    selectAll("campaign_windows", (q) => q.order("date_start").order("id")),
    selectAll("data_quality_flags", (q) => q.order("id")),
    selectAll("library_cells", (q) => q.order("row_index").order("id")),
    selectAll("library_cell_performance", (q) => q.order("id")),
    selectAll("variable_performance", (q) => q.order("id")),
    selectAll("demographic_signal", (q) => q.order("row_index").order("id")),
    selectAll("placement_signal", (q) => q.order("signal_scope").order("row_index").order("id")),
    selectAll("device_performance", (q) => q.order("id")),
    selectAll("platform_performance", (q) => q.order("id")),
    selectAll("placement_performance", (q) => q.order("id")),
    selectAll("message_pillars", (q) => q.order("id")),
    selectAll("testing_hypotheses", (q) => q.order("hypothesis_id")),
    selectAll("icp_profiles", (q) => q.order("id")),
    selectAll("variable_combinations", (q) => q.order("id")),
    selectAll("imported_creative_briefs", (q) => q.order("brief_id")),
    selectAll("iap_runs", (q) => q.order("account_id").order("stage")),
    selectAll("variable_registry", (q) => q.order("status").order("prefix")),
    selectAll("concept_intelligence", (q) => q.order("book").order("concept_code").order("id")),
    selectAll("failure_patterns", (q) => q.order("id")),
    selectAll("ads", (q) => q.order("ad_name").order("id")),
    // Graceful: return [] if the table hasn't been created yet (pre-migration).
    selectAll("cell_creative_overrides", (q) => q.order("uploaded_at").order("id")).catch(() => [] as Row[]),
    // creative_asset manual_imports: used for auto-heal detection only; rows
    // with null ad_names are excluded because they carry no mapping to fix.
    // Metadata columns ONLY — never the bytea content (see selectAll's note:
    // select("*") here pulled the entire creative library's file bytes into
    // every seed build and hung production once the library grew real).
    selectAll(
      "manual_imports",
      (q) => q.eq("kind", "creative_asset").not("ad_names", "is", null).order("id"),
      "id, account_id, kind, filename, ad_names, status",
    ).catch(() => [] as Row[]),
    // Creative deconstruction classifications (review queue + badges).
    // Graceful: [] if the table hasn't been created yet (pre-migration).
    selectAll("creative_deconstructions", (q) => q.order("created_at", { ascending: false }).order("id", { ascending: false })).catch(
      () => [] as Row[],
    ),
    // Generation run lineage — resolves WHICH generated set is current now
    // that runs no longer delete the ones they supersede (GAP-01).
    // Metadata columns only; the run rows carry no payload worth shipping.
    // Graceful: [] if the table hasn't been created yet (pre-migration),
    // which degrades to the pre-scoping behaviour rather than to no
    // strategy at all.
    selectAll(
      "generation_runs",
      (q) => q.eq("status", "success").order("started_at", { ascending: false }),
      "id, account_id, kind, status, started_at",
    ).catch(() => [] as Row[]),
  ]);

  if (adAccounts.length === 0 || adPerformanceAll.length === 0) {
    throw new Error(
      "Supabase holds no imported Metrix data yet. Run: pnpm --filter @workspace/scripts run import:metrix",
    );
  }

  // ── Auto-heal: sync creative links for accounts that need it ────────
  // Detect accounts where creative_asset manual_imports exist (with mapped
  // ad_names) but none of those ad_names have creative_asset_url set.
  // This catches three regression vectors:
  //   (a) Re-import / analysis wipe: a prior ads upsert reset creative_asset_url
  //       to NULL (e.g. ignoreDuplicates:false instead of true) and sync was
  //       never re-triggered — the column stayed NULL.
  //   (b) Seed building without self-healing: buildMetrixSeed read NULL from the
  //       ads table and shipped NULL in every AdRecord, so every card showed
  //       the placeholder. No check existed to catch this before emitting.
  //   (c) mapped_ad_names drift: ad_names strings in manual_imports diverged
  //       from ads.ad_name so syncAllCreativeLinksForAccount matched 0 rows
  //       and the URL was never written (names diverge on re-import renaming,
  //       case changes, or trimming differences). The warn below catches this.
  //
  // syncAllCreativeLinksForAccount is idempotent and O(imports), not
  // O(all-ads), so calling it here is safe for accounts with creative uploads.
  const accountsNeedingSync = detectAccountsNeedingCreativeSync(manualImportsCreativeAll, adsRegistryAll);
  let finalAdsRegistryAll = adsRegistryAll;
  if (accountsNeedingSync.length > 0) {
    logger.info({ accountsNeedingSync }, "metrixSeedAssembly: auto-healing creative links for accounts with wiped URLs");
    for (const accountId of accountsNeedingSync) {
      try {
        const summary = await syncAllCreativeLinksForAccount(accountId);
        logger.info(
          { accountId, linked: summary.linked, total: summary.total, unlinked: summary.unlinked_names.length },
          "metrixSeedAssembly: creative link auto-heal complete",
        );
      } catch (err) {
        logger.warn({ accountId, err }, "metrixSeedAssembly: creative link auto-heal failed (non-fatal)");
      }
    }
    // Re-fetch ads for the healed accounts so the seed assembly picks up
    // the newly written creative_asset_url values instead of the stale NULLs.
    try {
      const freshAds = await selectAll("ads", (q) =>
        q.in("account_id", accountsNeedingSync).order("ad_name"),
      );
      const healedSet = new Set(accountsNeedingSync);
      finalAdsRegistryAll = [
        ...adsRegistryAll.filter((r) => !healedSet.has(String(r["account_id"] ?? ""))),
        ...freshAds,
      ];
    } catch (err) {
      logger.warn({ err }, "metrixSeedAssembly: failed to re-fetch ads after auto-heal (non-fatal, stale data used)");
    }
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

  // ── Supplement registry with cell codes from library_cells ────────────
  // Signal/alert/hypothesis/brief text references cell-level codes (C2B,
  // C4E, etc.) that may not have a matching concept_intelligence row.
  // Build stub entries from the library cell payload so tokenizeConceptCodes
  // can produce chips for those codes and users can click through to the
  // Library — no fabricated descriptors, only data from real payload fields.
  const seenLibraryCellCodes = new Set<string>();
  for (const lc of libraryCellsAll) {
    const cellId = String(lc["cell_id"] ?? "");
    if (!cellId || seenLibraryCellCodes.has(cellId)) continue;
    seenLibraryCellCodes.add(cellId);
    // Only chip-able cell codes (C\d+[A-Z]); column codes handled above.
    if (!/^C\d+[A-Z]$/.test(cellId)) continue;
    // concept_intelligence rows take priority; skip if already registered.
    if (conceptRegistry[cellId]) continue;

    const payload = (lc["payload"] ?? {}) as Row;
    const conceptName = payload["book2_concept_name"]
      ? String(payload["book2_concept_name"])
      : null;
    const descriptor = conceptName
      ? (conceptName.split(/\.\s/)[0] ?? conceptName).slice(0, 100).trim()
      : `Concept ${cellId.replace(/([A-Z])$/, " · $1")}`;

    // Inherit book from the parent column-level entry (e.g. "C2" for "C2B").
    const columnCode = cellId.replace(/[A-Z]$/, "");
    const book = conceptRegistry[columnCode]?.book ?? null;

    conceptRegistry[cellId] = {
      code: cellId,
      descriptor,
      book,
      what: null,
      why: null,
      source_cells: [cellId],
    };
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
    adsRegistry: groupByAccount(finalAdsRegistryAll),
    cellCreativeOverrides: groupByAccount(cellCreativeOverridesAll),
    creativeDeconstructions: groupByAccount(creativeDeconstructionsAll),
    generationRuns: groupByAccount(generationRunsAll),
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
  //
  // CTR blending: an account whose link_clicks > impressions is a conversion-
  // export account — its CTR is meaningless (null at the per-account level).
  // Including its clicks in the manager numerator while only delivery accounts
  // contribute impressions to the denominator produces a nonsensical blended
  // rate (e.g. 15.8 % when one account has 0 delivery impressions at all).
  // ctrImpressions / ctrLinkClicks accumulate only delivery-basis accounts so
  // the blended CTR remains semantically valid. totalLinkClicks still sums all
  // accounts for the raw bottom_line_totals.link_clicks field.
  const byEvent: Record<string, Row> = {};
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalLinkClicks = 0;
  let ctrImpressions = 0;
  let ctrLinkClicks = 0;
  for (const account of adAccounts) {
    const accountId = String(account["id"]);
    const local: Record<string, Row> = {};
    let rowSpend = 0;
    let rowImpressions = 0;
    let rowLinkClicks = 0;
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
      rowLinkClicks += Number(r["link_clicks"] ?? 0);
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
    // Same ceiling guard as buildAccountObject — override only when larger than DB sum.
    const effectiveAccountSpend = accountTotals?.["spend"] != null
      ? Math.max(rowSpend, Number(accountTotals["spend"]))
      : rowSpend;
    const effectiveAccountImpressions = accountTotals?.["impressions"] != null
      ? Math.max(rowImpressions, Number(accountTotals["impressions"]))
      : rowImpressions;
    totalSpend += effectiveAccountSpend;
    totalImpressions += effectiveAccountImpressions;
    totalLinkClicks += rowLinkClicks;
    // Only include in blended CTR if this account is delivery-basis.
    // link_clicks > impressions signals a conversion export — mixing its
    // clicks into the CTR numerator against delivery-only impressions is
    // semantically wrong, so skip it entirely from the CTR fraction.
    if (rowLinkClicks <= effectiveAccountImpressions) {
      ctrImpressions += effectiveAccountImpressions;
      ctrLinkClicks += rowLinkClicks;
    }
  }
  for (const event of Object.keys(byEvent)) {
    const t = byEvent[event]!;
    t["spend"] = round(t["spend"]);
  }
  // Blended CTR uses only delivery-basis accounts (ctrImpressions / ctrLinkClicks).
  // If no accounts have valid delivery data, emit null so the UI renders "—".
  const linkCtrPct =
    ctrImpressions > 0
      ? round((ctrLinkClicks / ctrImpressions) * 100, 4)
      : null;

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
// TTL is a SAFETY NET, not the freshness mechanism: every in-app mutation
// path (staging/deleting imports, analysis runs, generation runs, creative
// links, account registration, Meta pulls, deconstructions) calls
// invalidateMetrixSeedCache() explicitly, so app-driven changes appear
// immediately regardless of TTL. Five minutes only bounds staleness from
// out-of-band writes (direct DB edits, the importer) while cutting the
// ~25-parallel-query rebuild from twice a minute to at most every 5 —
// the dominant steady-state Supabase load for idle viewers.
let cached: { at: number; data: Row } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

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
  // Only delivery-basis accounts contribute to the blended CTR (same logic as
  // assembleMetrixSeed). overall_link_ctr_pct is null for conversion-export
  // accounts — skip their clicks/impressions from the CTR fraction.
  let ctrImpressions = 0;
  let ctrLinkClicks = 0;
  for (const account of accounts) {
    const summary = (account["iap"] as Row | null)?.["campaign_summary"] as Row | undefined;
    if (!summary) continue;
    const accountImpressions = Number(summary["total_impressions"] ?? 0);
    const accountLinkClicks = Number(summary["total_link_clicks"] ?? 0);
    totalSpend += Number(summary["total_spend_usd"] ?? 0);
    totalImpressions += accountImpressions;
    totalLinkClicks += accountLinkClicks;
    // overall_link_ctr_pct is non-null only for delivery-basis accounts.
    if (summary["overall_link_ctr_pct"] != null) {
      ctrImpressions += accountImpressions;
      ctrLinkClicks += accountLinkClicks;
    }
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
        link_ctr_pct: ctrImpressions > 0
          ? round((ctrLinkClicks / ctrImpressions) * 100, 4)
          : null,
        result_totals_by_event: byEvent,
      },
      recommendation_cards: managerCards,
    },
    ad_accounts: accounts,
  };
}
