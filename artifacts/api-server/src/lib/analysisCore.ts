// ─── IAP Analysis Core (in-app, deterministic) ────────────────────────
// Turns the manual-upload bundle (the scoped demographic + device/placement
// CSV rows a run just ingested) into the Analysis Core layer the UI and the
// strategy engine read: per-cell library performance, per-variable rollups,
// demographic/placement signal rows, concept performance + intelligence
// (tiers, baseline lift), failure patterns, the core control read and the
// analysis-core summary module.
//
// Everything here is PURE computation over the uploaded rows — no model
// calls, no fabricated metrics. Honesty rules:
//   - A metric is null when the export didn't carry it, never zeroed.
//   - Reach is a unique-people metric and is NOT summable across days —
//     it stays null on aggregated rows, never a fabricated sum.
//   - Variable stacks come only from codes actually present in ad names
//     (MST naming convention); ads without codes simply carry no stack.
//   - Tiers/confidence follow spend/results evidence thresholds; thin
//     evidence is labeled insufficient/validation_required, never upgraded.

import type { IapCsvRow } from "./iapCsvParser";

type Row = Record<string, any>;

export type AnalysisCoreInput = {
  accountId: string;
  accountName: string;
  dateStart: string;
  dateEnd: string;
  /** Scoped rows from the demographic export (ad × day × gender × age). */
  demoRows: IapCsvRow[];
  /** Scoped rows from the device/placement export (ad × day × device × platform × placement). */
  placementRows: IapCsvRow[];
  /** Staged filenames the run analyzed (provenance for iap_runs / summary). */
  sourceFiles: string[];
};

export type AnalysisCoreOutput = {
  libraryCellRows: Row[];
  variableRows: Row[];
  demographicSignalRows: Row[];
  placementSignalRows: Row[];
  conceptPerformanceRows: Row[];
  conceptIntelligenceRows: Row[];
  failurePatternRows: Row[];
  /** account_modules payloads keyed by module name. */
  coreReanalysisRead: Row;
  analysisCoreSummary: Row;
  totalRows: number;
};

// ── Evidence thresholds (mirror the importer's analysis conventions) ──
/** Below this spend a read is "insufficient" — too thin to call anything. */
export const MIN_READ_SPEND = 50;
/** Cell id used for the account-level demographic aggregate grain (matches the client's ACCOUNT_LEVEL_CELL_ID). */
export const ACCOUNT_LEVEL_CELL_ID = "ACCOUNT";
const ACCOUNT_LEVEL_AD_NAME = "All ads (manual upload)";
/** Per-ad demographic signal is written for the top-N spenders plus every ad with a result. */
const DEMO_SIGNAL_TOP_ADS = 10;

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function sumOptional(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** spend ÷ results, null unless both exist and results > 0. */
function cpaOf(spend: number | null, results: number | null): number | null {
  return spend !== null && results !== null && results > 0 ? round2(spend / results) : null;
}

/** numerator ÷ denominator × 100, null unless both exist and denominator > 0. */
function pctOf(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0
    ? round4((numerator / denominator) * 100)
    : null;
}

// ── Variable-stack extraction from MST-named ads ──────────────────────
// MST names are underscore-joined code stacks, e.g.
// C1A_CN_ICP_BusyParents_CN_Design_UGC_FW_PAS_TN_Emotional_HK_Problem_001.
// A code is PREFIX + "_" + one CamelCase segment, except CN_ICP_* and
// CN_Design_* which carry one extra segment. Only codes actually present
// are extracted — nothing is guessed for unconventional names.

const FAMILY_BY_PREFIX: Record<string, string> = {
  HK: "hook",
  TN: "tone",
  FW: "framework",
  CN: "concept",
  HP: "pain_proof",
  PR: "proof",
  CTA: "cta",
};

const PAYLOAD_KEY_BY_FAMILY: Record<string, string> = {
  hook: "hook_variable",
  tone: "tone_variable",
  framework: "framework_variable",
  concept: "concept_variable",
  pain_proof: "pain_proof_variable",
  proof: "proof_variable",
  cta: "cta_variable",
};

/** Leading MST matrix-position token ("C1A_..." → "C1A"), null when absent. */
export function matrixCellOf(adName: string): string | null {
  const m = adName.match(/^(C\d+[A-Z])(?![A-Za-z0-9])/);
  return m ? m[1]! : null;
}

/** Codes per variable family found in an ad name. Empty map when the name carries none. */
export function extractVariableStack(adName: string): Map<string, string[]> {
  const segments = adName.split(/[_\s]+/).filter(Boolean);
  const byFamily = new Map<string, string[]>();
  for (let i = 0; i < segments.length - 1; i++) {
    const prefix = segments[i]!;
    const family = FAMILY_BY_PREFIX[prefix];
    if (!family) continue;
    let next = segments[i + 1]!;
    // A code segment is alphanumeric and not itself a prefix or a pure number.
    if (FAMILY_BY_PREFIX[next] || /^\d+$/.test(next) || !/^[A-Za-z][A-Za-z0-9-]*$/.test(next)) continue;
    let code = `${prefix}_${next}`;
    let consumed = i + 1;
    // CN_ICP_<Avatar> / CN_Design_<System> carry one extra segment.
    if (prefix === "CN" && (next === "ICP" || next === "Design")) {
      const third = segments[i + 2];
      if (third && !FAMILY_BY_PREFIX[third] && !/^\d+$/.test(third) && /^[A-Za-z]/.test(third)) {
        code = `${code}_${third}`;
        consumed = i + 2;
      }
    }
    const list = byFamily.get(family) ?? [];
    if (!list.includes(code)) list.push(code);
    byFamily.set(family, list);
    i = consumed;
  }
  return byFamily;
}

/** The single concept code for a cell: the first non-ICP/non-Design CN code, else the first CN code. */
export function conceptCodeOf(stack: Map<string, string[]>): string | null {
  const cn = stack.get("concept") ?? [];
  if (cn.length === 0) return null;
  return cn.find((c) => !/^CN_(ICP|Design)_/.test(c)) ?? cn[0]!;
}

/** "CN_ProductDemo" → "Product Demo"; "CN_ICP_BusyParents" → "ICP Busy Parents". */
export function humanizeCode(code: string): string {
  const body = code.replace(/^[A-Z]+_/, "");
  return body
    .split(/[_-]/)
    .map((seg) => seg.replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
    .join(" ")
    .trim();
}

// ── Aggregation buckets ───────────────────────────────────────────────

type Totals = {
  spend: number | null;
  impressions: number | null;
  clicksAll: number | null;
  linkClicks: number | null;
  results: number | null;
  resultType: string | null;
  extra: Record<string, number>;
};

function emptyTotals(): Totals {
  return { spend: null, impressions: null, clicksAll: null, linkClicks: null, results: null, resultType: null, extra: {} };
}

function accumulate(t: Totals, row: IapCsvRow): void {
  t.spend = sumOptional(t.spend, numOrNull(row.base["amount_spent"]));
  t.impressions = sumOptional(t.impressions, numOrNull(row.base["impressions"]));
  t.clicksAll = sumOptional(t.clicksAll, numOrNull(row.base["clicks_all"]));
  t.linkClicks = sumOptional(t.linkClicks, numOrNull(row.base["link_clicks"]));
  t.results = sumOptional(t.results, numOrNull(row.base["results"]));
  if (t.resultType === null && typeof row.base["result_type"] === "string" && row.base["result_type"]) {
    t.resultType = row.base["result_type"];
  }
  for (const [k, v] of Object.entries(row.extra)) {
    if (typeof v !== "number") continue;
    t.extra[k] = (t.extra[k] ?? 0) + v;
  }
}

const spendOf = (t: Totals): number => t.spend ?? 0;
const resultsOf = (t: Totals): number => t.results ?? 0;

/** Shared metric block for signal/cell payloads (fixture-shaped keys). */
function metricPayload(t: Totals): Row {
  return {
    "Result type": t.resultType ?? "Results",
    "Amount spent (USD)": t.spend === null ? null : round2(t.spend),
    // Reach is a unique-people metric — never summable across rows/days.
    Reach: null,
    Impressions: t.impressions,
    Results: t.results,
    "Clicks (all)": t.clicksAll,
    "Link clicks": t.linkClicks,
    CPA_result: cpaOf(t.spend, t.results),
    CTR_link_pct: pctOf(t.linkClicks, t.impressions),
    Result_per_link_click_pct: pctOf(t.results, t.linkClicks),
  };
}

function readConfidence(t: Totals): string {
  if (spendOf(t) < MIN_READ_SPEND) return "insufficient";
  if (resultsOf(t) < 5) return "validation_required";
  if (resultsOf(t) < 30) return "medium";
  return "high";
}

// ── Core builder ──────────────────────────────────────────────────────

export function buildAnalysisCore(input: AnalysisCoreInput): AnalysisCoreOutput {
  const { accountId, accountName, dateStart, dateEnd, demoRows, placementRows, sourceFiles } = input;
  const window = { date_start: dateStart, date_end: dateEnd };

  // ── Per-cell aggregation from the placement export (ad-level truth) ──
  // cell = leading MST matrix position when present, else the ad itself.
  type CellAgg = Totals & { cellId: string; adNames: Set<string> };
  const cells = new Map<string, CellAgg>();
  for (const row of placementRows) {
    const adName = row.breakdowns["Ad name"]!;
    const cellId = matrixCellOf(adName) ?? adName;
    const resultType = (row.base["result_type"] as string) || "Results";
    const key = [cellId, resultType].join("");
    if (!cells.has(key)) cells.set(key, { ...emptyTotals(), cellId, adNames: new Set() });
    const agg = cells.get(key)!;
    agg.adNames.add(adName);
    accumulate(agg, row);
  }
  const cellList = [...cells.values()].sort((a, b) => resultsOf(b) - resultsOf(a) || spendOf(b) - spendOf(a));

  // Account totals (from the same export the cells are cut from).
  const accountTotals = emptyTotals();
  for (const row of placementRows) accumulate(accountTotals, row);
  const baselineCpa = cpaOf(accountTotals.spend, accountTotals.results);
  const resultNoun = accountTotals.resultType ?? "Results";

  // ── library_cell_performance ────────────────────────────────────────
  const stackForCell = (agg: CellAgg): Map<string, string[]> => {
    const merged = new Map<string, string[]>();
    for (const adName of agg.adNames) {
      for (const [family, codes] of extractVariableStack(adName)) {
        const list = merged.get(family) ?? [];
        for (const code of codes) if (!list.includes(code)) list.push(code);
        merged.set(family, list);
      }
    }
    return merged;
  };

  const libraryCellRows: Row[] = cellList.map((agg) => {
    const stack = stackForCell(agg);
    const conceptCode = conceptCodeOf(stack);
    const confidence = readConfidence(agg);
    const spend = round2(spendOf(agg));
    const iapRead =
      `Confidence: ${confidence}. $${spend} spend → ${resultsOf(agg)} ${agg.resultType ?? "results"}` +
      `${cpaOf(agg.spend, agg.results) !== null ? ` (CPA $${cpaOf(agg.spend, agg.results)})` : ""} over the ` +
      `${dateStart} → ${dateEnd} manual-upload window.`;
    const payload: Row = {
      cell_id: agg.cellId,
      ...metricPayload(agg),
      book2_concept_name: conceptCode
        ? humanizeCode(conceptCode)
        : agg.adNames.size === 1
          ? [...agg.adNames][0]!
          : agg.cellId,
      iap_read: iapRead,
    };
    for (const [family, codes] of stack) {
      const key = PAYLOAD_KEY_BY_FAMILY[family];
      if (key) payload[key] = codes.join(" + ");
    }
    return {
      account_id: accountId,
      cell_id: agg.cellId,
      result_type: agg.resultType ?? "Results",
      ...window,
      payload,
    };
  });

  // ── variable_performance (only codes that actually appear) ──────────
  type VarAgg = Totals & { family: string; code: string; ads: Set<string> };
  const variables = new Map<string, VarAgg>();
  for (const row of placementRows) {
    const adName = row.breakdowns["Ad name"]!;
    const resultType = (row.base["result_type"] as string) || "Results";
    for (const [family, codes] of extractVariableStack(adName)) {
      for (const code of codes) {
        const key = [family, code, resultType].join("");
        if (!variables.has(key)) variables.set(key, { ...emptyTotals(), family, code, ads: new Set() });
        const agg = variables.get(key)!;
        agg.ads.add(adName);
        accumulate(agg, row);
      }
    }
  }
  const variableRows: Row[] = [...variables.values()]
    .sort((a, b) => resultsOf(b) - resultsOf(a) || spendOf(b) - spendOf(a))
    .map((agg) => ({
      account_id: accountId,
      variable_family: agg.family,
      variable_id: agg.code,
      result_type: agg.resultType ?? "Results",
      ...window,
      payload: {
        variable_family: agg.family,
        variable_id: agg.code,
        unique_ads: agg.ads.size,
        ...metricPayload(agg),
      },
    }));

  // ── demographic_signal (ACCOUNT grain + per-cell grain) ─────────────
  type DemoAgg = Totals & { gender: string; age: string };
  const accountSegments = new Map<string, DemoAgg>();
  const cellSegments = new Map<string, Map<string, DemoAgg & { adNames: Set<string> }>>();
  const demoAdTotals = new Map<string, Totals>();
  for (const row of demoRows) {
    const gender = row.breakdowns["Gender"]!;
    const age = row.breakdowns["Age"]!;
    const adName = row.breakdowns["Ad name"]!;
    const cellId = matrixCellOf(adName) ?? adName;
    const segKey = [gender, age].join("");

    if (!accountSegments.has(segKey)) accountSegments.set(segKey, { ...emptyTotals(), gender, age });
    accumulate(accountSegments.get(segKey)!, row);

    if (!cellSegments.has(cellId)) cellSegments.set(cellId, new Map());
    const perCell = cellSegments.get(cellId)!;
    if (!perCell.has(segKey)) perCell.set(segKey, { ...emptyTotals(), gender, age, adNames: new Set() });
    perCell.get(segKey)!.adNames.add(adName);
    accumulate(perCell.get(segKey)!, row);

    if (!demoAdTotals.has(cellId)) demoAdTotals.set(cellId, emptyTotals());
    accumulate(demoAdTotals.get(cellId)!, row);
  }

  const demoSignalPayload = (cellId: string, adName: string, seg: DemoAgg): Row => ({
    cell_id: cellId,
    "Ad name": adName,
    Age: seg.age,
    Gender: seg.gender,
    ...metricPayload(seg),
  });

  let demoIdx = 0;
  const demographicSignalRows: Row[] = [];
  for (const seg of [...accountSegments.values()].sort((a, b) => spendOf(b) - spendOf(a))) {
    demographicSignalRows.push({
      account_id: accountId,
      cell_id: ACCOUNT_LEVEL_CELL_ID,
      ad_name: ACCOUNT_LEVEL_AD_NAME,
      age: seg.age,
      gender: seg.gender,
      ...window,
      row_index: demoIdx++,
      payload: demoSignalPayload(ACCOUNT_LEVEL_CELL_ID, ACCOUNT_LEVEL_AD_NAME, seg),
    });
  }
  // Per-cell grain for the cells with a readable sample: top spenders plus
  // every cell with at least one result (keeps segment→creative attribution
  // honest without exploding row counts on thin ads).
  const rankedCells = [...demoAdTotals.entries()].sort((a, b) => spendOf(b[1]) - spendOf(a[1]));
  const signalCells = new Set<string>([
    ...rankedCells.slice(0, DEMO_SIGNAL_TOP_ADS).map(([id]) => id),
    ...rankedCells.filter(([, t]) => resultsOf(t) > 0).map(([id]) => id),
  ]);
  for (const [cellId, segs] of cellSegments) {
    if (!signalCells.has(cellId)) continue;
    for (const seg of [...segs.values()].sort((a, b) => spendOf(b) - spendOf(a))) {
      const adName = seg.adNames.size === 1 ? [...seg.adNames][0]! : cellId;
      demographicSignalRows.push({
        account_id: accountId,
        cell_id: cellId,
        ad_name: adName,
        age: seg.age,
        gender: seg.gender,
        ...window,
        row_index: demoIdx++,
        payload: demoSignalPayload(cellId, adName, seg),
      });
    }
  }

  // ── placement_signal (delivery-based placement × platform) ──────────
  type PlacementAgg = Totals & { placement: string; platform: string };
  const placements = new Map<string, PlacementAgg>();
  for (const row of placementRows) {
    // Conversion-based rows (no spend/impressions) are surfaced via the
    // seed's conversion_tracking_signal — mixing them here would fabricate
    // delivery semantics for conversion-attributed rows.
    const hasDelivery = numOrNull(row.base["amount_spent"]) !== null || numOrNull(row.base["impressions"]) !== null;
    if (!hasDelivery) continue;
    const placement = row.breakdowns["Placement"]!;
    const platform = row.breakdowns["Platform"]!;
    const key = [placement, platform].join("");
    if (!placements.has(key)) placements.set(key, { ...emptyTotals(), placement, platform });
    accumulate(placements.get(key)!, row);
  }
  const placementSignalRows: Row[] = [...placements.values()]
    .sort((a, b) => spendOf(b) - spendOf(a))
    .map((agg, idx) => ({
      account_id: accountId,
      signal_scope: "v3",
      placement: agg.placement,
      platform: agg.platform,
      ...window,
      row_index: idx,
      payload: {
        Placement: agg.placement,
        Platform: agg.platform,
        "Result type": agg.resultType ?? "Results",
        "Amount spent (USD)": agg.spend === null ? null : round2(agg.spend),
        Impressions: agg.impressions,
        "Link clicks": agg.linkClicks,
        Results: agg.results,
        CPA: cpaOf(agg.spend, agg.results),
        CTR_link_pct: pctOf(agg.linkClicks, agg.impressions),
      },
    }));

  // ── concept_performance + concept_intelligence ──────────────────────
  type ConceptAgg = Totals & { code: string; cellIds: Set<string>; ads: Set<string> };
  const concepts = new Map<string, ConceptAgg>();
  for (const agg of cellList) {
    const code = conceptCodeOf(stackForCell(agg));
    if (!code) continue;
    if (!concepts.has(code)) concepts.set(code, { ...emptyTotals(), code, cellIds: new Set(), ads: new Set() });
    const c = concepts.get(code)!;
    c.cellIds.add(agg.cellId);
    for (const a of agg.adNames) c.ads.add(a);
    c.spend = sumOptional(c.spend, agg.spend);
    c.impressions = sumOptional(c.impressions, agg.impressions);
    c.clicksAll = sumOptional(c.clicksAll, agg.clicksAll);
    c.linkClicks = sumOptional(c.linkClicks, agg.linkClicks);
    c.results = sumOptional(c.results, agg.results);
    if (c.resultType === null) c.resultType = agg.resultType;
  }

  const tierOf = (c: ConceptAgg): string | null => {
    if (spendOf(c) < MIN_READ_SPEND) return null;
    const cpa = cpaOf(c.spend, c.results);
    if (cpa === null) return "4 - Eliminate"; // real spend, zero results
    if (baselineCpa === null) return "3 - Validate";
    const ratio = cpa / baselineCpa;
    if (ratio <= 0.8) return "1 - Scale Winners";
    if (ratio <= 1.1) return "2 - Optimize";
    if (ratio <= 1.5) return "3 - Validate";
    return "4 - Eliminate";
  };

  const conceptPerformanceRows: Row[] = [];
  const conceptIntelligenceRows: Row[] = [];
  for (const c of [...concepts.values()].sort((a, b) => resultsOf(b) - resultsOf(a) || spendOf(b) - spendOf(a))) {
    const spend = c.spend === null ? null : round2(c.spend);
    const cpa = cpaOf(c.spend, c.results);
    const confidence = readConfidence(c);
    const tier = tierOf(c);
    const lift =
      cpa !== null && baselineCpa !== null && baselineCpa > 0
        ? String(round4((baselineCpa - cpa) / baselineCpa))
        : null;
    conceptPerformanceRows.push({
      account_id: accountId,
      book: null,
      concept: c.code,
      ...window,
      spend,
      link_clicks: c.linkClicks,
      results: c.results,
      cpa,
      cvr_link_pct: pctOf(c.results, c.linkClicks),
      confidence,
      mapped_in_library: false,
    });
    conceptIntelligenceRows.push({
      account_id: accountId,
      book: null,
      concept_code: c.code,
      mapped_in_library: false,
      spend,
      link_clicks: c.linkClicks,
      results: c.results,
      cpa,
      buying_intent_score: null,
      performance_lift_vs_baseline: lift,
      performance_tier: tier,
      confidence_level: confidence,
      what: `${humanizeCode(c.code)} concept (${c.code}) across ${c.ads.size} ad(s) / ${c.cellIds.size} cell(s): ` +
        `$${spend ?? 0} spend, ${resultsOf(c)} ${c.resultType ?? "results"}${cpa !== null ? `, CPA $${cpa}` : ""}.`,
      why:
        cpa !== null && baselineCpa !== null
          ? `CPA ${cpa <= baselineCpa ? "beats" : "trails"} the account baseline ($${baselineCpa}) by ${Math.abs(round4(((baselineCpa - cpa) / baselineCpa) * 100))}%.`
          : `No CPA read yet — ${spendOf(c) < MIN_READ_SPEND ? `below the $${MIN_READ_SPEND} evidence threshold` : "zero recorded results on real spend"}.`,
      so_what:
        tier === "1 - Scale Winners"
          ? "Strongest concept in this window — a scaling candidate."
          : tier === "4 - Eliminate"
            ? "Underperforms the account baseline — candidate for pause/rework."
            : tier === null
              ? "Evidence too thin to rank this concept yet."
              : "Mid-pack — optimize or validate before scaling.",
      now_what:
        tier === "1 - Scale Winners"
          ? "Feed this concept's variable stack into the next strategy cycle as a control."
          : tier === "4 - Eliminate"
            ? "Divert its budget to stronger concepts in the next cycle."
            : "Extend the test window or budget until the read is decision-grade.",
    });
  }

  // ── failure_patterns (real spend, zero results) ─────────────────────
  const failurePatternRows: Row[] = cellList
    .filter((agg) => spendOf(agg) >= MIN_READ_SPEND && resultsOf(agg) === 0)
    .map((agg) => {
      const spend = round2(spendOf(agg));
      const engaged = (agg.linkClicks ?? 0) > 0;
      return {
        account_id: accountId,
        segment_type: "creative_pattern",
        campaign: null,
        spend,
        engagement_present: engaged,
        diagnosis:
          `"${agg.cellId}" spent $${spend} with zero recorded ${(agg.resultType ?? "results").toLowerCase()}` +
          `${engaged ? ` despite ${agg.linkClicks} link clicks — clicks without conversion` : " and no link-click engagement"}.`,
        wasted_spend: spend,
        payload: {
          cell_id: agg.cellId,
          ad_names: [...agg.adNames],
          spend,
          link_clicks: agg.linkClicks,
          impressions: agg.impressions,
          result_type: agg.resultType,
        },
      };
    });

  // ── core_reanalysis_read (control selection) ────────────────────────
  const control = cellList.find((agg) => resultsOf(agg) > 0 && spendOf(agg) >= MIN_READ_SPEND) ?? null;
  const coreReanalysisRead: Row = control
    ? {
        primary_control: control.cellId,
        primary_control_read:
          `${control.cellId} leads the window with ${resultsOf(control)} ${control.resultType ?? "results"} on ` +
          `$${round2(spendOf(control))} spend (CPA $${cpaOf(control.spend, control.results)}); ` +
          `confidence: ${readConfidence(control)}.`,
        registration_control: null,
        registration_control_read: null,
        data_caveat:
          `Reads come from the manual-upload window ${dateStart} → ${dateEnd} (${sourceFiles.length} staged file(s)); ` +
          `re-run analysis after uploading fresh exports.`,
      }
    : {
        primary_control: "No control established — pre-signal account",
        primary_control_read:
          `No creative has both $${MIN_READ_SPEND}+ spend and recorded ${resultNoun.toLowerCase()} in this window — pre-signal account, no decision-grade creative reads yet.`,
        registration_control: null,
        registration_control_read: null,
        data_caveat: `Reads come from the manual-upload window ${dateStart} → ${dateEnd}; evidence is below decision thresholds.`,
      };

  // ── analysis_core_summary module ────────────────────────────────────
  const confidenceCounts = { high: 0, medium: 0, validation_required: 0, insufficient: 0 } as Record<string, number>;
  for (const c of concepts.values()) confidenceCounts[readConfidence(c)] = (confidenceCounts[readConfidence(c)] ?? 0) + 1;

  const winningStack: Row = {};
  for (const family of Object.keys(PAYLOAD_KEY_BY_FAMILY)) {
    const best = [...variables.values()]
      .filter((v) => v.family === family && resultsOf(v) > 0)
      .sort((a, b) => resultsOf(b) - resultsOf(a) || spendOf(b) - spendOf(a))[0];
    if (best) winningStack[`${family}_type`] = best.code;
  }

  const wastedSpend = round2(failurePatternRows.reduce((n, r) => n + Number(r["wasted_spend"] ?? 0), 0));
  const topCell = cellList[0] ?? null;
  const analysisCoreSummary: Row = {
    report_metadata: {
      account: accountName,
      generated: new Date().toISOString(),
      window_start: dateStart,
      window_end: dateEnd,
      source: "in-app manual analysis (deterministic Analysis Core)",
      source_files: sourceFiles,
    },
    executive_summary: {
      top_finding: topCell
        ? `${topCell.cellId} leads the window with ${resultsOf(topCell)} ${topCell.resultType ?? "results"} on $${round2(spendOf(topCell))} spend` +
          `${baselineCpa !== null ? ` (account baseline CPA $${baselineCpa})` : ""}.`
        : "No creative rows fell within the analyzed window.",
      total_spend: accountTotals.spend === null ? null : round2(accountTotals.spend),
      total_results: accountTotals.results,
      result_type: resultNoun,
      blended_cpa: baselineCpa,
      critical_alert:
        failurePatternRows.length > 0
          ? `${failurePatternRows.length} creative(s) totaling $${wastedSpend} spend show zero recorded ${resultNoun.toLowerCase()} — review before the next cycle.`
          : null,
    },
    buyer_intent_funnel: {
      note: "Account-level funnel from the uploaded exports; stages absent from the export are omitted, never zeroed.",
      impressions: accountTotals.impressions,
      clicks_all: accountTotals.clicksAll,
      link_clicks: accountTotals.linkClicks,
      results: accountTotals.results,
      ...(Object.keys(accountTotals.extra).length > 0
        ? {
            extra_events: Object.fromEntries(
              Object.entries(accountTotals.extra).map(([k, v]) => [k, round2(v)]),
            ),
          }
        : {}),
    },
    winning_variable_stack:
      Object.keys(winningStack).length > 0
        ? {
            ...winningStack,
            note: "Top code per variable family by results in this window — hypothesis-grade, feed-forward signal to Strategy Map.",
          }
        : null,
    insight_confidence: confidenceCounts,
  };

  const totalRows =
    libraryCellRows.length +
    variableRows.length +
    demographicSignalRows.length +
    placementSignalRows.length +
    conceptPerformanceRows.length +
    conceptIntelligenceRows.length +
    failurePatternRows.length;

  return {
    libraryCellRows,
    variableRows,
    demographicSignalRows,
    placementSignalRows,
    conceptPerformanceRows,
    conceptIntelligenceRows,
    failurePatternRows,
    coreReanalysisRead,
    analysisCoreSummary,
    totalRows,
  };
}
