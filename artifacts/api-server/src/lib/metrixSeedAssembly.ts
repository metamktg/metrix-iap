// ─── Metrix seed assembly ─────────────────────────────────────────────
// Builds the seed-shaped bundle served by GET /metrix/seed from Supabase
// tables (imported from the real Bookster IAP loop package). No static
// fallback: if Supabase is unreachable or empty, the route fails loudly.
//
// Loop stages without real data behind them are honest:
//   - optimization_loop → null (stage never ran)
//   - creative_scan     → pending (surfaced via loop_status)
// Nothing is fabricated; gap tables (data_quality, variable_registry) are
// passed through so the client can surface them.

import { getSupabase } from "./supabase";

type Row = Record<string, any>;

const BOOKSTER = "bookster";

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

// ─── assembly ─────────────────────────────────────────────────────────

export async function assembleMetrixSeed(): Promise<Row> {
  const [
    appConfig,
    adAccounts,
    accountModules,
    signalCards,
    adPerformance,
    conceptPerformance,
    campaignWindows,
    dataQualityFlags,
    libraryCells,
    libraryCellPerformance,
    variablePerformance,
    demographicSignal,
    placementSignal,
    messagePillars,
    testingHypotheses,
    icpProfiles,
    variableCombinations,
    creativeBriefs,
    iapRuns,
    variableRegistry,
    conceptIntelligence,
    failurePatterns,
  ] = await Promise.all([
    selectAll("app_config"),
    selectAll("ad_accounts", (q) => q.order("id")),
    selectAll("account_modules"),
    selectAll("signal_cards", (q) => q.order("id")),
    selectAll("ad_performance", (q) => q.eq("account_id", BOOKSTER)),
    selectAll("concept_performance", (q) => q.eq("account_id", BOOKSTER).order("book").order("concept")),
    selectAll("campaign_windows", (q) => q.eq("account_id", BOOKSTER).order("date_start")),
    selectAll("data_quality_flags", (q) => q.eq("account_id", BOOKSTER).order("id")),
    selectAll("library_cells", (q) => q.eq("account_id", BOOKSTER).order("row_index")),
    selectAll("library_cell_performance", (q) => q.eq("account_id", BOOKSTER).order("id")),
    selectAll("variable_performance", (q) => q.eq("account_id", BOOKSTER).order("id")),
    selectAll("demographic_signal", (q) => q.eq("account_id", BOOKSTER).order("row_index")),
    selectAll("placement_signal", (q) => q.eq("account_id", BOOKSTER).order("signal_scope").order("row_index")),
    selectAll("message_pillars", (q) => q.eq("account_id", BOOKSTER).order("id")),
    selectAll("testing_hypotheses", (q) => q.eq("account_id", BOOKSTER).order("hypothesis_id")),
    selectAll("icp_profiles", (q) => q.eq("account_id", BOOKSTER).order("id")),
    selectAll("variable_combinations", (q) => q.eq("account_id", BOOKSTER).order("id")),
    selectAll("creative_briefs", (q) => q.eq("account_id", BOOKSTER).order("brief_id")),
    selectAll("iap_runs", (q) => q.eq("account_id", BOOKSTER)),
    selectAll("variable_registry", (q) => q.order("status").order("prefix")),
    selectAll("concept_intelligence", (q) => q.eq("account_id", BOOKSTER).order("book").order("concept_code")),
    selectAll("failure_patterns", (q) => q.eq("account_id", BOOKSTER).order("id")),
  ]);

  if (adAccounts.length === 0 || adPerformance.length === 0) {
    throw new Error(
      "Supabase holds no imported Metrix data yet. Run: pnpm --filter @workspace/scripts run import:metrix",
    );
  }

  const config = new Map(appConfig.map((r) => [r["key"], r["value"]]));
  const modulesFor = (accountId: string) => {
    const map = new Map<string, any>();
    for (const m of accountModules) {
      if (m["account_id"] === accountId) map.set(m["module"], m["payload"]);
    }
    return map;
  };
  const boosterModules = modulesFor(BOOKSTER);

  // ── Totals computed from real date-stamped rows (BOOK0 + BOOK2) ─────
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
  for (const event of Object.keys(byEvent)) {
    const t = byEvent[event]!;
    t["spend"] = round(t["spend"]);
  }
  const linkCtrPct = totalImpressions > 0 ? round((totalLinkClicks / totalImpressions) * 100, 4) : 0;

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

  const analysis = {
    performance_by_cell: performanceByCell,
    v3_variable_performance: variablePerf,
    demographic_registration_signal: demographicSignal.map((r) => r["payload"]),
    v3_placement_signal: placementSignal.filter((r) => r["signal_scope"] === "v3").map((r) => r["payload"]),
    c4e_placement_signal: placementSignal.filter((r) => r["signal_scope"] === "c4e").map((r) => r["payload"]),
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
  const strategy = {
    message_pillars: messagePillars.map((row) => {
      const p = row["payload"] as Row;
      return {
        id: p["pillar_id"],
        label: p["pillar_name"],
        source_cells: conceptRefsFromIcps(p["target_icps"]),
        plain_descriptor: p["strategic_purpose"] ?? "",
        why_it_matters: p["performance_evidence"] ?? "",
        variable_stack: parseVariableStack(p["messaging_framework"]),
        // full loop payload, passed through for richer future UI
        funnel_application: p["funnel_application"],
        execution_specifications: p["execution_specifications"],
        placement_strategy: p["placement_strategy"],
        scaling_guidance: p["scaling_guidance"],
        target_icps: p["target_icps"],
      };
    }),
    active_hypotheses: testingHypotheses.map((h) => ({
      id: h["hypothesis_id"],
      label: h["statement"] ?? "",
      source: h["control_ref"] ?? "",
      status: h["priority"] ?? "unprioritized",
      risk: h["risk"] ?? undefined,
      test_variant: h["test_variant"],
      isolated_variable: h["isolated_variable"],
      success_criteria: h["success_criteria"],
      expected_impact: h["expected_impact"],
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
    scaling_playbook: boosterModules.get("scaling_playbook") ?? null,
  };

  // ── Brief builder (real Brief Builder output) ───────────────────────
  const briefBuilder = {
    source_policy:
      "Briefs are the real Brief Builder stage output of the IAP loop run, generated from strategy_map ICPs and pillars.",
    draft_briefs: creativeBriefs.map((row) => {
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
      };
    }),
  };

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
  const listenCards = signalCards.filter((c) => c["surface"] === "listen").map(cardShape);
  const managerCards = signalCards.filter((c) => c["surface"] === "manager_overview").map(cardShape);

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

  // ── Accounts ─────────────────────────────────────────────────────────
  const boosterRow = adAccounts.find((a) => a["id"] === BOOKSTER);
  const skovRow = adAccounts.find((a) => a["id"] === "skov_pet");
  const coreRead = boosterModules.get("core_reanalysis_read") ?? null;
  const mstDoc = boosterModules.get("mst") ?? {};
  const metadata = boosterModules.get("iap_metadata") ?? {};
  const analysisCoreSummary = boosterModules.get("analysis_core_summary") ?? null;

  const dataCaveat =
    `Totals cover the full imported window ${windowStart} → ${windowEnd} across BOOK0 and BOOK2. ` +
    `${coreRead?.["data_caveat"] ?? ""}`.trim();

  const bookster = {
    id: BOOKSTER,
    name: boosterRow?.["name"] ?? "Bookster",
    status: boosterRow?.["status"] ?? "configured",
    platform: boosterRow?.["platform"] ?? "Meta Ads",
    facebook_page_dp_url: boosterRow?.["facebook_page_dp_url"] ?? null,
    source_status: boosterRow?.["source_status"] ?? undefined,
    iap: {
      metadata,
      core_reanalysis_read: coreRead,
      campaign_summary: {
        bottom_line_totals: byEvent,
        total_spend_usd: round(totalSpend),
        total_impressions: totalImpressions,
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
      report_builder: boosterModules.get("report_builder") ?? null,
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
      historical_matrix_4x4: mstDoc["historical_matrix_4x4"] ?? null,
      source_artifacts: mstDoc["source_artifacts"] ?? [],
    },
    listen: { signal_cards: listenCards },
  };

  const skovModules = modulesFor("skov_pet");
  const skov = {
    id: "skov_pet",
    name: skovRow?.["name"] ?? "SKOV Pet",
    status: skovRow?.["status"] ?? "unconfigured",
    platform: skovRow?.["platform"] ?? "Meta Ads",
    overview_state: skovRow?.["overview_state"] ?? null,
    iap: null,
    mst: skovModules.get("mst") ?? { status: "not_available" },
  };

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
    ad_accounts: [bookster, skov],
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
