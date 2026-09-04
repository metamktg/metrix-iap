// ─── Manual-upload analysis engine ─────────────────────────────────────
// Turns the two staged manual_imports CSVs (performance_demo_csv +
// performance_placement_csv, matching the IAP_DEMOGRAPHIC_TEXT_SIGNAL /
// IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL Meta pivot export templates) into
// ad_performance / demographic_performance / placement_performance /
// platform_performance / device_performance rows for a MANUALLY selected
// date window. Never runs automatically on upload — only via an explicit
// POST from the user (see routes/metrixAnalysis.ts).
//
// Honesty rules (mirror the generation_runs pattern):
//   - A manual_analysis_runs row is inserted as 'running' and flips to
//     'success' only after every output row has committed.
//   - On any failure, partial output rows this run wrote are deleted and
//     the run is marked 'error' — no dishonest success states.
//   - Re-running replaces this manual account's rows within the selected
//     window (full refresh, not merge) — manual accounts are never touched
//     by the offline importer, so this is always safe.
//   - Ecommerce/Service/App metric columns are only ever written when
//     present in the uploaded CSV's header — never fabricated or zeroed.
//   - BOTH the demographic and device/placement/platform CSVs must be
//     staged before a run can start — the two exports are required, not
//     optional alternatives.

import { classifyResultEvent, type IntentClass } from "./resultEvents";
import {
  confidenceScore,
  creativeInputFromMetadata,
  evidenceGrade,
  hasCopy,
  volumeConfidence,
} from "./creativeComponents";
import { getSupabase } from "./supabase";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";
import { selectAllRows } from "./paginatedSelect";
import { logger } from "./logger";
import { startRunHeartbeat, lastSignOfLife, reclaimedRunMessage } from "./runHeartbeat";
import { parseIapCsv, IapCsvFormatError, type IapCsvRow, type IapCsvParseResult } from "./iapCsvParser";
import type { IapCsvClass } from "./iapCsvSpec";
import { detectCsvClassFromHeaders, checkDuplicateCsvClasses, iapCsvClassLabel, optionalMetricSlugsForGroups, IAP_CSV_CLASS_SPECS, type ObjectiveColumnGroup } from "./iapCsvSpec";
import { inferObjectives } from "./cohortConfig";
import { computeObjectiveCoverage, OBJECTIVE_GROUP_FOR_KEY } from "./objectiveCoverage";
import { convertXlsxToCsvText, looksLikeXlsxContent, readXlsxHeaderCells } from "./xlsxToCsv";
import { extensionOf } from "./creativeAssetType";
import { syncStickyCreativeAssetMappings } from "./creativeAssetMappingService";
import { loadImportBytes } from "./supabaseBinary";
import { autoMapUnmappedCreatives } from "./creativeAutoMap";
import { detectReportGrain, type ReportGrain } from "./reportGrain";
import { resolveClassOverlaps, type OverlapSupersession } from "./reportOverlap";
import { insertChunkedWithRecovery, isRetryableInsertFailure, defaultBackoffMs, type ChunkedInsertClient } from "./chunkedInsert";
import { touchRunHeartbeat } from "./runHeartbeat";
import {
  buildLedger,
  buildObservations,
  buildTruth,
  identityKey,
  type LedgerRow,
  type Observation,
  type ReconciliationSummary,
  type ReportInput,
} from "./reconciliation";
import { extractConfiguredAssets, extractDeliveredAssets } from "./creativeAssets";
import { buildVariableEvidence, buildVariableSegmentPerformance, type AdTotals, type DeconstructionInput } from "./variableEvidence";
import type { AdIdentity } from "./reportGrain";


export const STALE_ANALYSIS_RUN_MS = 10 * 60 * 1000;

export type DateRangePreset = "7d" | "14d" | "30d" | "all";

/** Preset for the view-level date filter (distinct from the analysis-run preset). */
export type ViewPreset = "7d" | "14d" | "28d" | "90d" | "all";

export const VIEW_PRESETS: ViewPreset[] = ["7d", "14d", "28d", "90d", "all"];

export interface AnalysisSummaryWindow {
  start: string;
  end: string;
}

export interface AnalysisSummaryTotals {
  total_spend_usd: number;
  total_impressions: number;
  total_link_clicks: number;
  overall_link_ctr_pct: number;
  bottom_line_totals: Record<
    string,
    { spend: number; reach: number; impressions: number; results: number; clicks_all: number; link_clicks: number }
  >;
}

export interface AnalysisSummaryDemoRow {
  age: string;
  gender: string;
  /** Result-event grain (2026-09-03): the event these totals were summed under ("unknown" for rows written before the split). */
  result_type: string;
  intent_class: string | null;
  spend: number | null;
  /** Null on rows ingested before demographic_performance carried the column. */
  impressions: number | null;
  results: number | null;
  link_clicks: number | null;
  adds_to_cart: number | null;
  checkouts_initiated: number | null;
  purchases: number | null;
  /** "Adds to cart conversion value" $ total — additive across rows, only present on newer exports that carry it. */
  adds_to_cart_value: number | null;
}

export interface AnalysisSummaryPlacementRow {
  placement: string;
  /** Result-event grain (2026-09-03): the event these totals were summed under. */
  result_type: string;
  intent_class: string | null;
  spend: number;
  impressions: number;
  link_clicks: number;
  results: number;
}

export interface AnalysisSummaryConceptRow {
  concept: string;
  book: string | null;
  /** Result-event grain (2026-09-03): the event these totals were summed under. */
  result_type: string;
  intent_class: string | null;
  spend: number;
  results: number;
  link_clicks: number;
}

/** One calendar day of additive ad_performance totals — feeds sparklines. */
export interface AnalysisSummaryDayRow {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  link_clicks: number;
  /** Sum across every event — read `results_by_event` before treating it as one thing. */
  results: number;
  /** Results per Meta result type for the day, so a reader can scope to one event or one intent class. */
  results_by_event: Record<string, number>;
}

export interface AnalysisSummaryResult {
  preset: ViewPreset;
  available_window: AnalysisSummaryWindow | null;
  active_window: AnalysisSummaryWindow | null;
  totals: AnalysisSummaryTotals;
  /** Per-day additive totals inside the active window, ascending by date. */
  daily: AnalysisSummaryDayRow[];
  /** Totals for the equal-length window immediately preceding the active
   *  one — real measured values, null when no preceding window applies
   *  (preset "all") or it holds no rows. */
  prior_totals: AnalysisSummaryTotals | null;
  prior_window: AnalysisSummaryWindow | null;
  demographic_rows: AnalysisSummaryDemoRow[];
  placement_rows: AnalysisSummaryPlacementRow[];
  concept_rows: AnalysisSummaryConceptRow[];
  /**
   * Join coverage measured by the latest successful manual analysis run
   * (see computeDataCoverage) — the honesty layer every surface that
   * aggregates a report class's rows must consult before classifying
   * segments or rendering confident aggregates. Null for accounts without
   * manual analysis runs (importer/live-Meta accounts) and legacy runs that
   * predate coverage measurement.
   */
  data_coverage: AnalysisDataCoverage | null;
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    /** Machine-readable discriminator for callers that need to branch (e.g. show a confirmation dialog). */
    public readonly code?: string,
    /** Extra structured detail relevant to `code`, e.g. the list of files that triggered it. */
    public readonly files?: string[],
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export type ManualAnalysisRun = {
  id: string;
  account_id: string;
  status: "running" | "success" | "error";
  date_range: DateRangePreset;
  date_start: string | null;
  date_end: string | null;
  rows_ingested: number | null;
  imports_used: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  creatives_linked: number | null;
  creatives_total: number | null;
  creatives_unlinked_names: string[] | null;
  /** Warnings produced during tolerant CSV parsing (auto-resolved aliases, missing columns, etc.). Null when parsing was clean. */
  csv_warnings: string[] | null;
  /** Derived objectives whose column groups were present and assessed this run. Null on legacy/pre-objectives runs. */
  objectives_assessed: string[] | null;
  /** Non-blocking objective coverage flags: configured-but-absent skips and present-but-unconfigured suggestions. Null when none. */
  objective_flags: string[] | null;
  /** Live progress percentage 0–100. Updated at each pipeline stage. 0 = idle/just started, 100 = complete. */
  progress_pct: number;
  /** Human-readable label for the current pipeline stage. Empty string when idle or complete. */
  progress_stage: string;
};

export type CreativeLinkageSummary = {
  linked: number;
  total: number;
  unlinked_names: string[];
};

type Row = Record<string, any>;

const parseJsonArray = (raw: unknown): string[] | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
};

const runShape = (r: Row): ManualAnalysisRun => {
  const csvWarnings = parseJsonArray(r["csv_warnings"]);
  return {
    id: String(r["id"]),
    account_id: String(r["account_id"]),
    status: r["status"],
    date_range: r["date_range"],
    date_start: r["date_start"] ?? null,
    date_end: r["date_end"] ?? null,
    rows_ingested: r["rows_ingested"] ?? null,
    imports_used: r["imports_used"] ?? null,
    error_message: r["error_message"] ?? null,
    started_at: String(r["started_at"]),
    finished_at: r["finished_at"] ?? null,
    creatives_linked: null,
    creatives_total: null,
    creatives_unlinked_names: null,
    csv_warnings: csvWarnings,
    objectives_assessed: parseJsonArray(r["objectives_assessed"]),
    objective_flags: parseJsonArray(r["objective_flags"]),
    progress_pct: typeof r["progress_pct"] === "number" ? Number(r["progress_pct"]) : 0,
    progress_stage: r["progress_stage"] ? String(r["progress_stage"]) : "",
  };
};

async function accountExists(accountId: string): Promise<Row | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ad_accounts")
    .select("id, name, cohort, objectives, source_status")
    .eq("id", accountId)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0]! : null;
}

/**
 * Synthesizes a ManualAnalysisRun-like object from the latest report_pulls rows
 * for a live-Meta account. Live-Meta pulls use fetched_at (not finished_at) and
 * store results under ad_account_id (= the act_XXX account id). Returns null if
 * no report pulls exist for the account.
 */
async function synthesizeRunFromReportPulls(accountId: string): Promise<ManualAnalysisRun | null> {
  const supabase = getSupabase();
  const { data: pulls, error } = await supabase
    .from("report_pulls")
    .select("id, report_class, status, fetched_at, date_range_start, date_range_end, error_message")
    .eq("ad_account_id", accountId)
    .order("fetched_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  if (!pulls || pulls.length === 0) return null;

  // De-duplicate to one row per report_class (latest per class).
  const latestByClass = new Map<string, Row>();
  for (const pull of pulls) {
    const cls = String(pull["report_class"]);
    if (!latestByClass.has(cls)) latestByClass.set(cls, pull);
  }
  const latestPulls = [...latestByClass.values()];

  const allSuccess = latestPulls.every((p) => p["status"] === "success");
  const anyRunning = latestPulls.some((p) => p["status"] === "running");
  const overallStatus: ManualAnalysisRun["status"] = allSuccess
    ? "success"
    : anyRunning
      ? "running"
      : "error";

  // Use the most recent fetched_at as the run timestamp. For a finished run,
  // this is both started_at and finished_at (report pulls don't record a
  // separate start time).
  const latestFetchedAt = latestPulls
    .map((p) => String(p["fetched_at"]))
    .sort()
    .at(-1)!;

  const firstError = latestPulls.find((p) => p["error_message"])?.["error_message"] ?? null;
  const anyPull = latestPulls[0]!;

  return {
    id: String(anyPull["id"]),
    account_id: accountId,
    status: overallStatus,
    date_range: "30d",
    date_start: anyPull["date_range_start"] ? String(anyPull["date_range_start"]) : null,
    date_end: anyPull["date_range_end"] ? String(anyPull["date_range_end"]) : null,
    rows_ingested: null,
    imports_used: null,
    error_message: firstError ? String(firstError) : null,
    started_at: latestFetchedAt,
    finished_at: overallStatus !== "running" ? latestFetchedAt : null,
    creatives_linked: null,
    creatives_total: null,
    creatives_unlinked_names: null,
    csv_warnings: null,
    objectives_assessed: null,
    objective_flags: null,
    progress_pct: 0,
    progress_stage: "",
  };
}

function isStaleRunningRow(row: Record<string, any>): boolean {
  // Measured from the last sign of life (heartbeat), not from `started_at`:
  // a single large parse can hold one phase for minutes, so "started more
  // than STALE_ANALYSIS_RUN_MS ago" was never the same question as "dead".
  // See lib/runHeartbeat.ts.
  return (
    row["status"] === "running" &&
    Date.now() - lastSignOfLife(row) > STALE_ANALYSIS_RUN_MS
  );
}

/** Flips a dead 'running' row to 'error' and clears its (necessarily partial)
 * outputs. Shared by listAnalysisRuns and getLatestAnalysisRun so a stale run
 * reads the same honest status everywhere, not just wherever happens to hit
 * it first. */
async function flipStaleRunToError(row: Record<string, any>): Promise<Record<string, any>> {
  const supabase = getSupabase();
  const { data: updated, error: updErr } = await supabase
    .from("manual_analysis_runs")
    .update({
      status: "error",
      // See the matching note in generationEngine: self-describing message,
      // built BEFORE the progress fields are cleared below.
      error_message: reclaimedRunMessage(row, "analysis"),
      finished_at: new Date().toISOString(),
      // See the matching note in generationEngine: a reclaimed run never
      // reaches finishRun, so its progress fields must be cleared here or
      // the resolved row keeps advertising a live-looking stage.
      progress_pct: 0,
      progress_stage: "",
    })
    .eq("id", row["id"])
    .eq("status", "running")
    .select("*");
  if (updErr) throw new Error(updErr.message);
  await deleteRunOutputs(String(row["id"]));
  return updated?.[0] ?? { ...row, status: "error" };
}

/** All runs for an account, with dead 'running' rows honestly flipped to error. */
export async function listAnalysisRuns(accountId: string): Promise<ManualAnalysisRun[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_analysis_runs")
    .select("*")
    .eq("account_id", accountId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const rows = await Promise.all(
    (data ?? []).map((row) => (isStaleRunningRow(row) ? flipStaleRunToError(row) : row)),
  );
  return rows.map(runShape);
}

/** Latest run for an account, with a dead 'running' row honestly flipped to error.
 * Falls back to synthesizing a run from report_pulls when no manual run exists
 * (live-Meta accounts store their analysis results there instead). */
export async function getLatestAnalysisRun(accountId: string): Promise<ManualAnalysisRun | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_analysis_runs")
    .select("*")
    .eq("account_id", accountId)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) {
    // No manual run — check if this is a live-Meta account with report_pulls.
    return synthesizeRunFromReportPulls(accountId);
  }
  const finalRow = isStaleRunningRow(row) ? await flipStaleRunToError(row) : row;
  return runShape(finalRow);
}

// ─── Post-run completeness verification ────────────────────────────────
// Confirms every analysis surface actually received data for the latest
// run (or, for accounts without manual runs — importer/live-Meta — for the
// account as a whole). This is the single "analysis validated" source of
// truth the stage-status endpoint and the Strategy gate read, so no module
// can show "ready" while another module's table is empty.

export type AnalysisSurfaceCheck = {
  /** Stable machine key, e.g. "ad_performance". */
  key: string;
  /** Human label shown in the UI, e.g. "Metric tiles & ad performance". */
  label: string;
  /** Row count found for this surface. */
  rows: number;
  /** Required surfaces must have rows for the analysis to count as complete. */
  required: boolean;
  /** True when this surface's expectation is satisfied. */
  ok: boolean;
  /** Honest context when a non-required surface is empty. */
  note: string | null;
};

export type AnalysisCompleteness = {
  /** Manual run the check is scoped to; null when scoped to the whole account (importer/live-Meta data). */
  run_id: string | null;
  run_status: "none" | "running" | "success" | "error";
  /** True only when the run succeeded (or account-scoped data exists) AND every required surface has rows. */
  complete: boolean;
  checked_at: string;
  surfaces: AnalysisSurfaceCheck[];
};

const COMPLETENESS_SURFACES: { key: string; table: string; label: string; required: boolean; emptyNote: string | null }[] = [
  { key: "ad_performance",          table: "ad_performance",          label: "Metric tiles & ad performance", required: true,  emptyNote: null },
  { key: "concept_performance",     table: "concept_performance",     label: "Concepts",                      required: false, emptyNote: "No concept codes detected in ad names — concept-level analysis is not applicable for this data." },
  { key: "variable_performance",    table: "variable_performance",    label: "Variables",                     required: false, emptyNote: "No concept codes detected in ad names — variable-level analysis is not applicable for this data." },
  { key: "demographic_performance", table: "demographic_performance", label: "Demographics (Audience)",       required: true,  emptyNote: null },
  { key: "placement_performance",   table: "placement_performance",   label: "Placements",                    required: true,  emptyNote: null },
  { key: "platform_performance",    table: "platform_performance",    label: "Platforms",                     required: true,  emptyNote: null },
  { key: "device_performance",      table: "device_performance",      label: "Devices",                       required: true,  emptyNote: null },
];

/**
 * Counts each analysis surface's rows for the account's latest manual run
 * (run-scoped) or for the account as a whole when no manual run exists
 * (importer/live-Meta accounts). Also checks the creative library linkage.
 */
export async function verifyAnalysisRunCompleteness(accountId: string): Promise<AnalysisCompleteness> {
  const supabase = getSupabase();

  // Latest manual run row (raw — we don't want report_pulls synthesis here;
  // live-Meta/importer accounts are verified account-wide instead).
  const { data: runRows, error: runErr } = await supabase
    .from("manual_analysis_runs")
    .select("id, status")
    .eq("account_id", accountId)
    .order("started_at", { ascending: false })
    .limit(1);
  if (runErr) throw new Error(runErr.message);
  const latestRun = runRows?.[0] ?? null;
  const runStatus: AnalysisCompleteness["run_status"] = latestRun
    ? (latestRun["status"] as AnalysisCompleteness["run_status"])
    : "none";

  // Module counts are verified against the latest SUCCESSFUL run, not the
  // absolute latest. A failed run has no outputs by definition — scoping the
  // per-module counts to it reported "0 rows" across every module while the
  // last successful run's data sat intact underneath (observed live on AAFE
  // after the morning's two errored re-runs), and gated Strategy on a
  // failure the run history already reports. run_status still carries the
  // absolute latest run's state so a fresh failure stays visible.
  let scopedRun = latestRun;
  if (latestRun && latestRun["status"] !== "success") {
    const { data: successRows, error: successErr } = await supabase
      .from("manual_analysis_runs")
      .select("id, status")
      .eq("account_id", accountId)
      .eq("status", "success")
      .order("started_at", { ascending: false })
      .limit(1);
    if (successErr) throw new Error(successErr.message);
    scopedRun = successRows?.[0] ?? null;
  }
  const runId = scopedRun ? String(scopedRun["id"]) : null;

  const surfaces: AnalysisSurfaceCheck[] = await Promise.all(
    COMPLETENESS_SURFACES.map(async (s) => {
      let query = supabase.from(s.table).select("*", { count: "exact", head: true });
      query = runId
        ? query.eq("manual_analysis_run_id", runId)
        : query.eq("account_id", accountId);
      const { count, error } = await query;
      if (error) throw new Error(`${s.table}: ${error.message}`);
      const rows = count ?? 0;
      return {
        key: s.key,
        label: s.label,
        rows,
        required: s.required,
        ok: s.required ? rows > 0 : true,
        note: rows === 0 ? s.emptyNote : null,
      };
    }),
  );

  // Creative library: informational — linkage is best-effort by design.
  try {
    const linkage = await computeCreativeLinkageSummary(accountId);
    surfaces.push({
      key: "creative_library",
      label: "Creative library",
      rows: linkage.linked,
      required: false,
      ok: linkage.total === 0 || linkage.linked > 0,
      note:
        linkage.total === 0
          ? "No creative assets have been mapped for this account."
          : linkage.linked < linkage.total
            ? `${linkage.total - linkage.linked} of ${linkage.total} mapped creative(s) could not be linked to ad rows.`
            : null,
    });
  } catch {
    // Non-fatal: linkage summary failure must not fail the whole check.
    surfaces.push({
      key: "creative_library",
      label: "Creative library",
      rows: 0,
      required: false,
      ok: true,
      note: "Creative linkage status could not be read.",
    });
  }

  const requiredOk = surfaces.every((s) => !s.required || s.ok);
  // Completeness follows the SCOPED (last successful) run: a later failed
  // run doesn't erase the validated outputs it never touched. A run still
  // in flight keeps completeness false until it settles — its outputs are
  // partial by definition.
  const complete = runId
    ? runStatus !== "running" && requiredOk
    : requiredOk && surfaces.some((s) => s.rows > 0);

  return {
    run_id: runId,
    run_status: runStatus,
    complete,
    checked_at: new Date().toISOString(),
    surfaces,
  };
}

async function startRun(accountId: string, dateRange: DateRangePreset, createdBy: string): Promise<string> {
  const latest = await getLatestAnalysisRun(accountId);
  if (latest && latest.status === "running") {
    throw new AnalysisError("An analysis run is already in progress for this account.", 409);
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_analysis_runs")
    .insert({ account_id: accountId, status: "running", date_range: dateRange, created_by: createdBy })
    .select("id");
  if (error) {
    if (error.code === "23505") {
      throw new AnalysisError("An analysis run is already in progress for this account.", 409);
    }
    throw new Error(error.message);
  }
  return String(data![0]!["id"]);
}

async function finishRun(
  runId: string,
  status: "success" | "error",
  fields: {
    errorMessage?: string;
    dateStart?: string;
    dateEnd?: string;
    rowsIngested?: number;
    importsUsed?: number;
    csvWarnings?: string[];
    objectivesAssessed?: string[];
    objectiveFlags?: string[];
    coverage?: AnalysisDataCoverage;
    reconciliationSummary?: ReconciliationSummary;
  },
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("manual_analysis_runs")
    .update({
      status,
      // Honest terminal progress: success = 100 with the stage cleared;
      // error keeps the last real pct (shows where it died) but clears the
      // stage label so the UI never displays a live-sounding stage on a
      // settled run.
      ...(status === "success" ? { progress_pct: 100, progress_stage: "" } : { progress_stage: "" }),
      error_message: fields.errorMessage ?? null,
      date_start: fields.dateStart ?? null,
      date_end: fields.dateEnd ?? null,
      rows_ingested: fields.rowsIngested ?? null,
      imports_used: fields.importsUsed ?? null,
      csv_warnings: fields.csvWarnings && fields.csvWarnings.length > 0
        ? JSON.stringify(fields.csvWarnings)
        : null,
      objectives_assessed: fields.objectivesAssessed ? JSON.stringify(fields.objectivesAssessed) : null,
      objective_flags: fields.objectiveFlags && fields.objectiveFlags.length > 0
        ? JSON.stringify(fields.objectiveFlags)
        : null,
      coverage: fields.coverage ?? null,
      ...(fields.reconciliationSummary ? { reconciliation_summary: fields.reconciliationSummary } : {}),
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

/**
 * Fire-and-forget per-stage progress update.
 * Non-fatal: a progress write failure must never abort the analysis pipeline.
 */
async function updateProgress(runId: string, pct: number, stage: string): Promise<void> {
  // A stage boundary is a sign of life. The heartbeat interval cannot fire
  // while a synchronous stage holds the event loop, so the progress write
  // carries `heartbeat_at` itself, and it re-arms the interval's ceiling
  // (runHeartbeat.ts): a run that keeps reaching new stages is working,
  // however long it takes; one that stops reaching them is the wedged case
  // the ceiling exists for. Guarded on 'running' so a reclaimed run's late
  // progress write updates nothing.
  touchRunHeartbeat("manual_analysis_runs", runId);
  try {
    const supabase = getSupabase();
    await supabase
      .from("manual_analysis_runs")
      .update({ progress_pct: pct, progress_stage: stage, heartbeat_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("status", "running");
  } catch {
    // Silently ignore — progress display is non-critical
  }
}

/**
 * Destages a successful run's consumed CSVs: flips them from 'staged' to
 * 'processed' and tags them with the run that consumed them. This clears
 * them out of "currently staged" gating (Run-analysis button, upload
 * wizard slots) so the next run starts from an empty staging area, while
 * keeping the files themselves (and their content) intact and visible in
 * the Import History panel for restaging.
 */
async function markImportsProcessed(importIds: string[], runId: string): Promise<void> {
  if (importIds.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from("manual_imports")
    .update({ status: "processed", manual_analysis_run_id: runId })
    .in("id", importIds);
  if (error) throw new Error(error.message);
}

/**
 * Restages every import a past run consumed: flips them back to 'staged'
 * and clears the run linkage, so "Run analysis" picks them up again
 * without re-uploading. Used by the Import History panel's "Restage"
 * action to regenerate an analysis run from a prior batch of files.
 */
export async function restageImportsForRun(accountId: string, runId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_imports")
    .update({ status: "staged", manual_analysis_run_id: null })
    .eq("account_id", accountId)
    .eq("manual_analysis_run_id", runId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/** Deletes every output table's rows this specific run wrote (partial-output cleanup on failure/staleness). */
async function deleteRunOutputs(runId: string): Promise<void> {
  const supabase = getSupabase();
  // All 6 rollup tables now carry manual_analysis_run_id and retain history
  // across runs (see the analysis-run-scoping migration) — a failed run's
  // partial rows are no longer swept up by a full account wipe on the next
  // run, so they must be explicitly deleted by run id here.
  for (const table of [
    "ad_performance",
    "concept_performance",
    "variable_performance",
    "demographic_performance",
    "placement_performance",
    "platform_performance",
    "device_performance",
    // Reconciliation layer (run-scoped; creative_assets are upserts, not run rows).
    "ad_breakdown_performance",
    "reconciliation_ledger",
    "variable_evidence",
    "variable_segment_performance",
  ]) {
    const { error } = await supabase.from(table).delete().eq("manual_analysis_run_id", runId);
    if (error) throw new Error(error.message);
  }
}

function withinRange(date: string, dateRange: DateRangePreset, maxDate: string): boolean {
  if (dateRange === "all") return true;
  const days = dateRange === "7d" ? 7 : dateRange === "14d" ? 14 : 30;
  const max = new Date(`${maxDate}T00:00:00Z`).getTime();
  const cutoff = max - (days - 1) * 24 * 60 * 60 * 1000;
  const d = new Date(`${date}T00:00:00Z`).getTime();
  return d >= cutoff && d <= max;
}

function decodeStagedContentBuffer(hexOrRaw: string): Buffer {
  const hex = hexOrRaw.replace(/^\\x/, "");
  return Buffer.from(hex, "hex");
}

/**
 * Loads a staged manual_imports row's raw bytes, one file per call.
 *
 * Small files store their content inline in manual_imports.content; large
 * files (chunked upload — see the /manual-imports/uploads routes) store NULL
 * content and their bytes as ordered rows in manual_import_chunks. Either way
 * the bytes travel as PostgREST binary output (supabaseBinary.ts) — never as
 * a hex string inside a JSON document, which is what took the database down
 * on the first fresh-account run (see that module's header).
 *
 * `imp.content` handling:
 *   • a string — legacy inline hex already in hand; decoded, no request;
 *   • null — the caller knows the row is chunked (the upload-complete route);
 *   • undefined — not selected; resolved here from the row's own metadata.
 * Callers should stop selecting `content` at all and pass `{ id }`.
 */
export async function loadImportContentBuffer(imp: {
  id?: unknown;
  content?: unknown;
  size_bytes?: unknown;
}): Promise<Buffer> {
  if (typeof imp.content === "string") {
    return decodeStagedContentBuffer(imp.content);
  }
  const importId = String(imp.id ?? "");
  if (!importId) throw new Error("Import row has neither inline content nor an id to load bytes by.");
  if (imp.content === null) {
    // The caller knows the row is chunked (the upload-complete route);
    // an inline read would be wrong, so loadImportBytes' chunk index must
    // be non-empty — it throws with the row id when it is not.
    const hasChunks = await getSupabase()
      .from("manual_import_chunks")
      .select("chunk_index")
      .eq("import_id", importId)
      .limit(1);
    if (hasChunks.error) throw new Error(hasChunks.error.message);
    if (!hasChunks.data || hasChunks.data.length === 0) {
      throw new Error(`Import ${importId} has no inline content and no stored chunks.`);
    }
  }
  return loadImportBytes(importId, typeof imp.size_bytes === "number" ? imp.size_bytes : null);
}

/**
 * Decodes a staged manual_imports row's content into canonical CSV text,
 * transparently converting XLSX workbooks (detected by filename extension or
 * ZIP magic bytes, same rule as the upload route) into the exact CSV text
 * shape parseIapCsv() expects — see xlsxToCsv.ts. Returns any XLSX
 * conversion-time warnings (e.g. the Ad/Ad set/Campaign ID precision-loss
 * guard) alongside the text so callers can fold them into csv_warnings the
 * same way parseIapCsv's own warnings already are.
 *
 * `expectedColumns` steers multi-sheet workbook sheet selection only.
 */
async function decodeStagedContentAsCsvText(
  buf: Buffer,
  filename: string,
  expectedColumns?: readonly string[],
): Promise<{ text: string; warnings: string[] }> {
  if (extensionOf(filename) === "xlsx" || looksLikeXlsxContent(buf)) {
    const converted = await convertXlsxToCsvText(buf, expectedColumns);
    return { text: converted.csvText, warnings: converted.warnings };
  }
  return { text: buf.toString("utf8"), warnings: [] };
}

/**
 * Extracts the first (header) line of a CSV and splits it into individual
 * column name strings. Handles double-quoted fields but not embedded newlines
 * in headers — Meta Ads pivot export headers never span multiple lines.
 *
 * Used only for class detection (signature column lookup), not for full
 * data parsing, so a lightweight implementation is sufficient.
 */
function csvFirstLineHeaders(text: string): string[] {
  const newlineIdx = text.indexOf("\n");
  const firstLine = newlineIdx >= 0 ? text.slice(0, newlineIdx) : text;
  // Split on commas respecting double-quoted cells.
  const cells: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (inQuotes) {
      if (c === '"' && firstLine[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(field.trim());
      field = "";
    } else {
      field += c;
    }
  }
  cells.push(field.trim());
  return cells;
}

function num(v: number | string | null | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function sumOptional(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

type AggBucket = {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicksAll: number | null;
  linkClicks: number | null;
  results: number | null;
  resultType: string | null;
  addsToCart: number | null;
  checkoutsInitiated: number | null;
  purchases: number | null;
  /** "Adds to cart conversion value" — a $ total, additive across rows, distinct from the derived cost-per-ATC ratio. */
  addsToCartValue: number | null;
  extra: Record<string, number>;
};

type AdIdentityFields = {
  metaAdId?: string;
  imageName?: string;
  videoName?: string;
};

function captureAdIdentity(bucket: AdIdentityFields, row: IapCsvRow): void {
  if (!bucket.metaAdId && row.breakdowns["Ad ID"]) bucket.metaAdId = row.breakdowns["Ad ID"];
  if (!bucket.imageName && row.creativeMetadata?.["Image name"]) {
    bucket.imageName = row.creativeMetadata["Image name"];
  }
  if (!bucket.videoName && row.creativeMetadata?.["Video name"]) {
    bucket.videoName = row.creativeMetadata["Video name"];
  }
}

function rowAdIdentity(row: IapCsvRow): string {
  return row.breakdowns["Ad ID"]?.trim() || row.breakdowns["Ad name"]!;
}

function emptyBucket(): AggBucket {
  return {
    spend: null,
    impressions: null,
    reach: null,
    clicksAll: null,
    linkClicks: null,
    results: null,
    resultType: null,
    addsToCart: null,
    checkoutsInitiated: null,
    purchases: null,
    addsToCartValue: null,
    extra: {},
  };
}

/**
 * The result type a row is summed under. Every aggregate bucket the engine
 * builds includes this in its key (owner direction 2026-09-03: awareness and
 * purchase-intent events are never blended), so a bucket only ever holds one
 * event. Rows with no result type at all fold under "unknown" — the engine's
 * long-standing name for that data-quality gap, kept visible, never dropped.
 */
function rowResultType(row: IapCsvRow): string {
  const rt = row.base["result_type"];
  return typeof rt === "string" && rt.trim() !== "" ? rt.trim() : "unknown";
}

/** Intent class of a result type, or null when the export named no event Metrix can place. */
function intentClassOf(resultType: string | null | undefined): IntentClass | null {
  return classifyResultEvent(resultType).intent;
}

function accumulate(bucket: AggBucket, row: IapCsvRow): void {
  bucket.spend = sumOptional(bucket.spend, num(row.base["amount_spent"]));
  bucket.impressions = sumOptional(bucket.impressions, num(row.base["impressions"]));
  bucket.reach = sumOptional(bucket.reach, num(row.base["reach"]));
  bucket.clicksAll = sumOptional(bucket.clicksAll, num(row.base["clicks_all"]));
  bucket.linkClicks = sumOptional(bucket.linkClicks, num(row.base["link_clicks"]));
  bucket.results = sumOptional(bucket.results, num(row.base["results"]));
  if (bucket.resultType === null && typeof row.base["result_type"] === "string") {
    bucket.resultType = row.base["result_type"];
  }
  bucket.addsToCart = sumOptional(bucket.addsToCart, num(row.extra["adds_to_cart"]));
  bucket.checkoutsInitiated = sumOptional(bucket.checkoutsInitiated, num(row.extra["checkouts_initiated"]));
  bucket.purchases = sumOptional(bucket.purchases, num(row.extra["purchases"]));
  bucket.addsToCartValue = sumOptional(bucket.addsToCartValue, num(row.extra["adds_to_cart_conversion_value"]));
  for (const [k, v] of Object.entries(row.extra)) {
    if (typeof v !== "number") continue;
    bucket.extra[k] = (bucket.extra[k] ?? 0) + v;
  }
}

function derivedRates(spend: number | null, impressions: number | null, linkClicks: number | null, results: number | null) {
  return {
    cpa: results !== null && results > 0 && spend !== null ? spend / results : null,
    ctr_link_pct: linkClicks !== null && impressions !== null && impressions > 0 ? (linkClicks / impressions) * 100 : null,
    cvr_link_pct: linkClicks !== null && linkClicks > 0 && results !== null ? (results / linkClicks) * 100 : null,
    cpm: impressions !== null && impressions > 0 && spend !== null ? (spend / impressions) * 1000 : null,
  };
}

/**
 * Stable content signature for one parsed CSV row (breakdowns + metrics,
 * key-sorted so column order differences between files can't hide equality).
 */
export function stableRowSignature(r: IapCsvRow): string {
  const sorted = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify([sorted(r.breakdowns), sorted(r.base), sorted(r.extra)]);
}

/**
 * Appends one staged file's parsed rows onto its slot's accumulated rows,
 * dropping rows that are EXACT duplicates of rows from a previously parsed
 * file in the same slot (identical breakdowns + identical metric values).
 *
 * Why: multi-file-per-slot is additive by design (disjoint weekly exports),
 * but the same export staged twice in different formats (.xlsx and .csv of
 * one Sheets document — the real AAFE case) double-counts every metric.
 * The staging-time md5 guard only catches byte-identical files. An exact
 * duplicate row carries zero additional information, so dropping it can
 * never lose data — and it is announced, never silent. Rows are only
 * deduped ACROSS files: duplicates within one file are preserved (that
 * would be a source-data property this layer must not editorialize).
 *
 * Exported for unit tests.
 */
export function appendRowsCrossFileDeduped(
  target: IapCsvRow[],
  incoming: IapCsvRow[],
  seenFromPriorFiles: Set<string>,
  ctx: { filename: string; label: string; warnings: string[] },
): void {
  const thisFileSignatures: string[] = [];
  let dropped = 0;
  for (const r of incoming) {
    const sig = stableRowSignature(r);
    if (seenFromPriorFiles.has(sig)) {
      dropped += 1;
      continue;
    }
    thisFileSignatures.push(sig);
    target.push(r);
  }
  for (const sig of thisFileSignatures) seenFromPriorFiles.add(sig);
  if (dropped > 0) {
    ctx.warnings.push(
      `[Duplicate data] ${dropped} row(s) in ${ctx.label} "${ctx.filename}" are exact duplicates of rows in another staged ${ctx.label} file ` +
        `(identical dates, breakdowns, and metric values). They are counted once, never twice. ` +
        `If both files are the same export saved in different formats, remove one of them.`,
    );
  }
}

/** The reporting period a whole-period export covers. `endKnown` is false when the file states no reporting end and the run window end stands in. */
export interface ReportPeriod {
  start: string;
  end: string;
  endKnown: boolean;
}

/** One ad_performance row in the making: an ad on a day, or over a period when the run has no daily source at all. */
export type AdDayBucket = AggBucket &
  AdIdentityFields & {
    campaign: string;
    adSet: string;
    adName: string;
    resultType: string;
    date: string;
    /** Period end for a whole-period row; absent on a daily row (date_end = date). */
    dateEnd?: string;
  };

/**
 * Merges the three ad-level sources — the demographic (`scopedDemo`) and
 * device/placement (`scopedPlacement`) pivots plus the optional ad_summary
 * export (`scopedSummary`) — into one ad_performance bucket per (campaign,
 * ad, date). Priority for spend/results/resultType/linkClicks/clicksAll:
 * ad_summary > demo > null (ad_summary isn't privacy-limited the way the
 * demo export can be). Extracted out of startManualAnalysis (rather than
 * left inline) so this merge/dedupe logic — especially the
 * blank-Campaign-name ad_summary handling below — can be unit tested
 * without a live Supabase connection.
 *
 * Grain. `opts.periodOf` names the rows that come from a WHOLE-PERIOD
 * export (one reporting-start on every row, see wholePeriodOf). Such a row
 * is one ad's total over the period; dating it as a day puts the period's
 * spend on the reporting start (the AAFE +41% and the Pure Path ×3 totals).
 * So:
 *   • when ANY daily row exists, the ad rows are built from daily rows
 *     alone; whole-period rows contribute creative metadata and identity,
 *     and the ads they carry that no daily row covers are counted back in
 *     `periodOnlyAds` for the run to say so (their spend is in the
 *     breakdown tables and the ledger, never in the daily ad rows);
 *   • when NO daily row exists, every row is a period row: the bucket is
 *     dated at the period start with `dateEnd` at the period end, so
 *     ad_performance carries the period honestly (`grain: "period"`).
 * In period grain an ad's rows from different classes may state different
 * periods (a 30-day demographic pivot beside a 28-day placement pivot), so
 * the bucket key carries no date and the bucket's period widens to cover
 * every source; one ad is one row.
 * Legacy `summaryMetadataOnly` marks every summary row whole-period with
 * an unstated end. `creativeMetadataRows` are read for creative metadata
 * only: the summary rows of every staged file BEFORE overlap resolution,
 * so copy columns carried only by a whole-period export survive that
 * export losing its rows to a daily one.
 *
 * ad_summary's "Campaign name" breakdown is required to be present as a
 * column but its VALUES are tolerated blank (see iapCsvSpec.ts's ad_summary
 * requiredBreakdownColumns comment) — some accounts/date ranges export it
 * empty for every row. When that happens, every summaryAdBuckets key would
 * otherwise collapse to campaign="", which can never match the real
 * campaign name adBuckets/demoAdBuckets key on. summaryAdBucketsByAdDate
 * indexes those blank-campaign buckets by [adName, date] only (ad_name
 * stays part of the key, so two different ads never collide) as a fallback
 * match path — used both to let the supplement loop still find/apply them,
 * and to recognize a blank-campaign summary row as already covered by an
 * existing placement bucket instead of inserting it as a second, distinct
 * ad_performance row for the same ad/day.
 */
export function mergeAdPerformanceBuckets(
  scopedDemo: IapCsvRow[],
  scopedPlacement: IapCsvRow[],
  scopedSummary: IapCsvRow[],
  opts?: {
    /** Legacy: every ad_summary row is a whole-period row with an unstated end. */
    summaryMetadataOnly?: boolean;
    /** The period a whole-period row covers; null for a daily row. Object identity, so pass the rows the run scoped. */
    periodOf?: (row: IapCsvRow) => ReportPeriod | null;
    /** Extra ad_summary rows read for creative metadata only (every file's rows before overlap resolution). */
    creativeMetadataRows?: readonly IapCsvRow[];
  },
): {
  adBuckets: Map<string, AdDayBucket>;
  adCreativeMetadata: Map<string, Record<string, string>>;
  unknownResultTypeRows: number;
  /** "daily" when the ad rows are days; "period" when no daily source existed and every row carries its period. */
  grain: "daily" | "period";
  /** Ads present only in whole-period rows while daily rows exist, with the spend those rows carried (summary first, then placement, then demo). */
  periodOnlyAds: { count: number; spend: number };
} {
  type Cls = "demo" | "placement" | "summary";
  const periodOf = (row: IapCsvRow, cls: Cls): ReportPeriod | null => {
    const p = opts?.periodOf?.(row) ?? null;
    if (p) return p;
    if (cls === "summary" && opts?.summaryMetadataOnly) {
      const day = row.breakdowns["Day"]!;
      return { start: day, end: day, endKnown: false };
    }
    return null;
  };
  const inputs: [IapCsvRow[], Cls][] = [
    [scopedDemo, "demo"],
    [scopedPlacement, "placement"],
    [scopedSummary, "summary"],
  ];
  const anyDaily = inputs.some(([rows, cls]) => rows.some((r) => periodOf(r, cls) === null));
  // In period grain every row is one ad's period total: the key carries
  // no date, and a bucket's period widens over its sources.
  const PERIOD_KEY = "\u0000period";
  const bucketKey = (campaign: string, identity: string, date: string): string => [campaign, identity, anyDaily ? date : PERIOD_KEY].join("\u0001");
  const adDateKey = (identity: string, date: string): string => [identity, anyDaily ? date : PERIOD_KEY].join("\u0001");
  const widen = (bucket: { date: string; dateEnd?: string }, stamp: { date: string; dateEnd?: string }): void => {
    if (anyDaily) return;
    if (stamp.date < bucket.date) bucket.date = stamp.date;
    const end = stamp.dateEnd ?? stamp.date;
    if (bucket.dateEnd === undefined || end > bucket.dateEnd) bucket.dateEnd = end;
  };
  // Spend of whole-period rows per ad while daily rows exist, so the ads no
  // daily row covers can be counted back honestly at the end.
  const periodSpendByAd = new Map<string, Partial<Record<Cls, number>>>();
  /** The date stamp a row builds a bucket at, or null when it is metadata only. */
  const stampOf = (row: IapCsvRow, cls: Cls): { date: string; dateEnd?: string } | null => {
    const p = periodOf(row, cls);
    if (p === null) return { date: row.breakdowns["Day"]! };
    if (!anyDaily) return { date: p.start, dateEnd: p.end };
    const spend = num(row.base["amount_spent"]);
    if (spend !== null) {
      const id = rowAdIdentity(row);
      const cur = periodSpendByAd.get(id) ?? {};
      cur[cls] = (cur[cls] ?? 0) + spend;
      periodSpendByAd.set(id, cur);
    }
    return null;
  };

  // ── Ad-level supplementary aggregation from demo export ────────────
  // The demographic export reliably carries spend/results/result_type per
  // ad; the device/placement export is often impression-only (especially
  // Meta's "Impression device" breakdown). Build a per-(campaign, ad, date)
  // roll-up from the demo CSV so we can fill in spend and result_type when
  // the placement export has no financial data.
  const demoAdBuckets = new Map<string, AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; date: string; dateEnd?: string }>();
  for (const row of scopedDemo) {
    const stamp = stampOf(row, "demo");
    if (!stamp) continue;
    const campaign = row.breakdowns["Campaign name"]!;
    const adSet = row.breakdowns["Ad set name"] ?? "";
    const adName = row.breakdowns["Ad name"]!;
    const key = bucketKey(campaign, rowAdIdentity(row), stamp.date);
    if (!demoAdBuckets.has(key)) {
      demoAdBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, date: stamp.date, ...(stamp.dateEnd ? { dateEnd: stamp.dateEnd } : {}) });
    }
    widen(demoAdBuckets.get(key)!, stamp);
    accumulate(demoAdBuckets.get(key)!, row);
    captureAdIdentity(demoAdBuckets.get(key)!, row);
  }

  // ── Ad-level aggregation from ad_summary export (full spend) ────────
  // The ad_summary export has one row per ad per day and carries spend
  // unaffected by iOS privacy limits (unlike the demographic export which
  // only shows demographically-attributable spend). When present, it becomes
  // the primary spend source for ad_performance rows.
  const summaryAdBuckets = new Map<string, AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; date: string; dateEnd?: string }>();
  // Secondary index for blank-Campaign-name summary buckets only — see the
  // function-level comment above. Populated in lockstep with summaryAdBuckets
  // so both maps hold the SAME bucket object (accumulate() below still only
  // ever mutates the one object per ad/day, whichever map it's looked up from).
  const summaryAdBucketsByAdDate = new Map<string, AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; date: string; dateEnd?: string }>();
  // Creative metadata: collect the most-recently-seen metadata per ad name.
  // Same ad can appear across multiple rows (different dates) — metadata should
  // be consistent, so we just take the first non-empty value per column.
  const adCreativeMetadata = new Map<string, Record<string, string>>();
  const collectCreativeMetadata = (row: IapCsvRow): void => {
    if (!row.creativeMetadata || Object.keys(row.creativeMetadata).length === 0) return;
    const metadataKey = rowAdIdentity(row);
    const existing = adCreativeMetadata.get(metadataKey) ?? {};
    for (const [col, val] of Object.entries(row.creativeMetadata)) {
      if (!existing[col] && val) existing[col] = val;
    }
    adCreativeMetadata.set(metadataKey, existing);
  };
  for (const row of scopedSummary) {
    const campaign = row.breakdowns["Campaign name"] ?? "";
    const adSet = row.breakdowns["Ad set name"] ?? "";
    const adName = row.breakdowns["Ad name"]!;
    // A whole-period row beside daily rows contributes creative metadata
    // only: its "date" is the report window start, not a real day.
    const stamp = stampOf(row, "summary");
    if (stamp) {
      const key = bucketKey(campaign, rowAdIdentity(row), stamp.date);
      if (!summaryAdBuckets.has(key)) {
        const bucket = { ...emptyBucket(), campaign, adSet, adName, date: stamp.date, ...(stamp.dateEnd ? { dateEnd: stamp.dateEnd } : {}) };
        summaryAdBuckets.set(key, bucket);
        if (campaign === "") {
          summaryAdBucketsByAdDate.set(adDateKey(rowAdIdentity(row), stamp.date), bucket);
        }
      }
      widen(summaryAdBuckets.get(key)!, stamp);
      accumulate(summaryAdBuckets.get(key)!, row);
      captureAdIdentity(summaryAdBuckets.get(key)!, row);
    }
    collectCreativeMetadata(row);
  }
  for (const row of opts?.creativeMetadataRows ?? []) collectCreativeMetadata(row);

  // ── Ad-level rows (ad_performance): aggregate the placement export
  // across its device/platform/placement dimensions to a per-ad/day row.
  // Spend/results/resultType are filled from the demo aggregation when
  // the placement export is an impression-only device-breakdown export.
  const adBuckets = new Map<string, AdDayBucket>();
  for (const row of scopedPlacement) {
    const stamp = stampOf(row, "placement");
    if (!stamp) continue;
    const campaign = row.breakdowns["Campaign name"]!;
    const adSet = row.breakdowns["Ad set name"] ?? "";
    const adName = row.breakdowns["Ad name"]!;
    const key = bucketKey(campaign, rowAdIdentity(row), stamp.date);
    if (!adBuckets.has(key)) {
      adBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, resultType: "", date: stamp.date, ...(stamp.dateEnd ? { dateEnd: stamp.dateEnd } : {}) });
    }
    widen(adBuckets.get(key)!, stamp);
    accumulate(adBuckets.get(key)!, row);
    captureAdIdentity(adBuckets.get(key)!, row);
  }
  // ad/date combos (regardless of campaign) already covered by the placement
  // export above — used below only for the blank-campaign summary fallback,
  // so a blank-Campaign-name ad_summary row for an ad/date already present
  // here is recognized as a supplement, not inserted as a second row.
  const placementAdDateKeys = new Set(
    Array.from(adBuckets.values()).map((b) => adDateKey(b.metaAdId || b.adName, b.date)),
  );
  // Supplement from the ad_summary (preferred) then demo aggregation:
  // fill spend/results/resultType for any ad bucket the placement export
  // left financially empty. Priority: summary > demo > null.
  let unknownResultTypeRows = 0;
  for (const b of adBuckets.values()) {
    const adIdentity = b.metaAdId || b.adName;
    const adKey = bucketKey(b.campaign, adIdentity, b.date);
    // Exact [campaign, adName, date] match first; fall back to the
    // ad-date-only index for a blank-Campaign-name summary bucket that can
    // never carry the real campaign name to match adKey directly.
    const summary = summaryAdBuckets.get(adKey) ?? summaryAdBucketsByAdDate.get(adDateKey(adIdentity, b.date));
    const demo = demoAdBuckets.get(adKey);
    const preferred = summary ?? demo;
    if (preferred) {
      widen(b, { date: preferred.date, dateEnd: preferred.dateEnd });
      if (b.spend === null) b.spend = preferred.spend;
      if (b.results === null) b.results = preferred.results;
      if (!b.resultType) b.resultType = preferred.resultType ?? "";
      if (b.linkClicks === null) b.linkClicks = preferred.linkClicks;
      if (b.clicksAll === null) b.clicksAll = preferred.clicksAll;
      if (!b.metaAdId) b.metaAdId = preferred.metaAdId;
      if (!b.imageName) b.imageName = preferred.imageName;
      if (!b.videoName) b.videoName = preferred.videoName;
    }
    // Use a stable fallback only when result type is genuinely absent from
    // all exports — avoids the misleading "Results" column-header literal.
    // Surfaced as a csv_warning below rather than masked silently: an
    // "unknown" result type is a real data-quality gap, not a normal value.
    if (!b.resultType) {
      b.resultType = "unknown";
      unknownResultTypeRows += 1;
    }
  }
  // Surface summary-only ad/days (in ad_summary but absent from placement).
  // A blank-campaign summary bucket whose ad/date IS already in adBuckets
  // (under the real campaign name, via placementAdDateKeys) was already
  // folded into that row by the supplement loop above — skip it here so it
  // isn't ALSO inserted as a second, distinct ad_performance row.
  for (const [key, sum] of summaryAdBuckets) {
    const alreadyCovered =
      adBuckets.has(key) ||
      (sum.campaign === "" && placementAdDateKeys.has(adDateKey(sum.metaAdId || sum.adName, sum.date)));
    if (!alreadyCovered) {
      if (!sum.resultType) unknownResultTypeRows += 1;
      adBuckets.set(key, { ...sum, resultType: sum.resultType ?? "unknown" });
    }
  }
  // Also surface demo-only ad/days (ads present in demo but absent from
  // both placement and ad_summary) so no spend rows are silently dropped.
  for (const [key, demo] of demoAdBuckets) {
    if (!adBuckets.has(key)) {
      if (!demo.resultType) unknownResultTypeRows += 1;
      adBuckets.set(key, { ...demo, resultType: demo.resultType ?? "unknown" });
    }
  }

  // Ads the whole-period rows carry that no daily row does.
  const dailyAds = new Set(Array.from(adBuckets.values()).map((b) => b.metaAdId || b.adName));
  let periodOnlyCount = 0;
  let periodOnlySpend = 0;
  for (const [id, spend] of periodSpendByAd) {
    if (dailyAds.has(id)) continue;
    periodOnlyCount += 1;
    periodOnlySpend += spend.summary ?? spend.placement ?? spend.demo ?? 0;
  }
  return {
    adBuckets,
    adCreativeMetadata,
    unknownResultTypeRows,
    grain: anyDaily ? "daily" : "period",
    periodOnlyAds: { count: periodOnlyCount, spend: Math.round(periodOnlySpend * 100) / 100 },
  };
}

// ─── Join-coverage computation (degraded-data honesty layer) ────────────
//
// The platform's honesty invariant forbids rendering confident-looking
// output on silently under-covered data. The August 2026 AAFE run rendered
// Signal badges, ranked segment cards, and totals from a demographic export
// that carried only ~1.3% of the account's spend (11 of ~400 ads), with no
// indication anywhere. This block measures, per report class, how much of
// the account's daily-attributable activity that class's rows actually
// represent, persists it with the run, and ships it to every surface that
// aggregates the class's rows (see AnalysisSummaryResult.data_coverage).
// Below COVERAGE_THRESHOLD_PCT the UI must warn specifically and downgrade
// signal classification to "insufficient join coverage" — one shared
// definition of "trustworthy enough to classify".

// ─── BUG-08: the "missing reports" message ────────────────────────────
//
// A run consumes the STAGED batch, so a successful run leaves its files
// `processed` and the next run reports them missing. That is by design —
// reading processed files back would double-count — but the message never
// said the files still exist and can be re-staged from Import History, so the
// workaround people found was re-uploading a file already in the database
// (byte-identical, md5-verified, on 2026-08-24).
//
// Extracted as a pure function so both directions are testable without
// standing up the whole run pipeline. The restage sentence appears ONLY when
// there is really something to re-stage: pointing a user at an empty Import
// History is the BUG-29 failure again — telling someone to import a file they
// have already imported.
export function missingReportsMessage(
  missing: string[],
  restagableCount: number,
  missingKindCount: number,
): string {
  const base =
    missing.length >= 3
      ? `At least one delivery report is required before running analysis — a Demographics, Placements or Ad Summary export. Any additional compatible export adds resolution.`
      : `Both reports are required before running analysis. Missing: ${missing.join(" and ")}.`;
  if (restagableCount <= 0) return base;
  const files = `${restagableCount} previously processed file${restagableCount === 1 ? "" : "s"}`;
  const which = missingKindCount > 1 ? "these reports" : "this report";
  return `${base} ${files} for ${which} can be re-staged from Import History — no need to upload again.`;
}

/** Joined-spend coverage below this % is not trustworthy enough to classify segments. */
export const COVERAGE_THRESHOLD_PCT = 90;

export type ReportClassCoverageKey = "demographic" | "device_placement" | "ad_summary" | "conversion_device";

export interface ReportClassCoverage {
  report_class: ReportClassCoverageKey;
  /** Rows from this class inside the analysis window. */
  rows_scoped: number;
  /** Distinct ad names present in this class's scoped rows. */
  distinct_ads: number;
  /** Spend carried by this class's scoped rows (null when the class never carries spend). */
  spend: number | null;
  /** spend as % of the run's daily-attributable baseline spend. */
  spend_coverage_pct: number | null;
  /** distinct_ads as % of the baseline's distinct ads. */
  ad_coverage_pct: number | null;
  /** True when the file is a whole-period aggregate export (see detectAggregateAdSummary). */
  aggregate_shape: boolean;
  /** True when this class's joined-spend coverage falls below COVERAGE_THRESHOLD_PCT. */
  below_threshold: boolean;
  /** Cause + remedy, populated when below_threshold or aggregate_shape; null otherwise. */
  note: string | null;
}

export interface AnalysisDataCoverage {
  window: { start: string; end: string };
  /** Sum of spend across the run's merged daily ad rows — the daily-attributable baseline. */
  baseline_spend: number;
  baseline_distinct_ads: number;
  threshold_pct: number;
  classes: ReportClassCoverage[];
}

const pctOfBaseline = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/** Export headers Meta puts on a whole-period ad-level export in place of a Day breakdown (the parser aliases them to "Day"). */
const PERIOD_START_HEADERS: ReadonlySet<string> = new Set(["reporting starts", "report start", "date start"]);
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The period a staged file covers when it is a WHOLE-PERIOD export rather
 * than a daily one, or null. Meta's ad-level exports without the Day
 * breakdown put "Reporting starts" on every row; the parser aliases that
 * header to "Day", so such a file reads as one identical day across every
 * row (`grain.aggregate_shape`). Treating it as daily data misdates its
 * whole-period spend as a single day and inflates totals (observed +41% on
 * AAFE; ×3 on Pure Path, where the placement, device and demographic pivots
 * were all whole-period).
 *
 * The header the Day column resolved from (`grain.day_header`) is the
 * signal: "reporting starts" and its aliases mean a period; "day" or "date"
 mean one real day of data even beside multi-day files. When the grain
 * carries no header (a grain stored before the field existed), a stated
 * reporting end later than the start proves the period, and otherwise a
 * multi-day companion file does (the AAFE heuristic). The unstated end is
 * reported as such so the run can stand the window end in for it and say
 * so. A non-ISO stated end never reaches here (reportGrain.ts drops it).
 */
export function wholePeriodOf(
  grain: Pick<ReportGrain, "aggregate_shape" | "period"> & Partial<Pick<ReportGrain, "day_header">>,
  anyDailyInRun: boolean,
): ReportPeriod | null {
  if (!grain.aggregate_shape || !grain.period) return null;
  const start = grain.period.start;
  const end = ISO_DAY_RE.test(grain.period.end) && grain.period.end > start ? grain.period.end : start;
  const endKnown = end > start;
  const header = grain.day_header ?? null;
  if (header !== null && !PERIOD_START_HEADERS.has(header)) return null;
  if (header !== null) return { start, end, endKnown };
  if (endKnown) return { start, end, endKnown: true };
  return anyDailyInRun ? { start, end: start, endKnown: false } : null;
}

export interface DataCoverageReport {
  coverage: AnalysisDataCoverage;
  /** The notes that are run warnings: every problem note, never the whole-period sentence on its own. */
  warnings: string[];
}

/**
 * Measures per-report-class join coverage against the run's own merged daily
 * ad rows. Pure — exported for unit tests. `periodOf` names the rows that
 * come from whole-period exports; a class whose rows are all such rows is
 * `aggregate_shape`, and a class that mixes daily rows with the surviving
 * rows of a whole-period file (the overlap rule's outcome) is judged on its
 * daily rows and says how much whole-period spend it carries beside them.
 */
export function computeDataCoverageReport(args: {
  window: { start: string; end: string };
  scopedDemo: IapCsvRow[];
  scopedPlacement: IapCsvRow[];
  scopedSummary: IapCsvRow[];
  scopedConversionDevice: IapCsvRow[];
  adBuckets: Map<string, AggBucket & { adName: string; date: string; dateEnd?: string }>;
  /** The period a whole-period row covers; null (or absent) for a daily row. */
  periodOf?: (row: IapCsvRow) => { start: string; end: string } | null;
}): DataCoverageReport {
  const periodOf = args.periodOf ?? (() => null);
  let baselineSpend = 0;
  const baselineAds = new Set<string>();
  let dailyStart: string | null = null;
  let dailyEnd: string | null = null;
  for (const b of args.adBuckets.values()) {
    baselineSpend += b.spend ?? 0;
    baselineAds.add(b.adName);
    if (dailyStart === null || b.date < dailyStart) dailyStart = b.date;
    const end = b.dateEnd ?? b.date;
    if (dailyEnd === null || end > dailyEnd) dailyEnd = end;
  }
  baselineSpend = Math.round(baselineSpend * 100) / 100;
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  const span = (p: { start: string; end: string }) => `${p.start} to ${p.end}`;

  const classRows: [ReportClassCoverageKey, IapCsvRow[]][] = [
    ["demographic", args.scopedDemo],
    ["device_placement", args.scopedPlacement],
    ["ad_summary", args.scopedSummary],
    ["conversion_device", args.scopedConversionDevice],
  ];

  const classes: ReportClassCoverage[] = [];
  const warnings: string[] = [];
  for (const [key, rows] of classRows) {
    if (rows.length === 0) continue; // class not imported — absence is its own honest state
    let spend = 0;
    let anySpend = false;
    let periodSpend = 0;
    let periodRows = 0;
    let period: { start: string; end: string } | null = null;
    const ads = new Set<string>();
    const periodOnlyAds = new Set<string>();
    const dailyAds = new Set<string>();
    for (const r of rows) {
      const s = r.base["amount_spent"];
      const p = periodOf(r);
      if (typeof s === "number") {
        spend += s;
        anySpend = true;
        if (p) periodSpend += s;
      }
      const ad = r.breakdowns["Ad name"];
      if (ad) {
        ads.add(ad);
        (p ? periodOnlyAds : dailyAds).add(ad);
      }
      if (p) {
        periodRows += 1;
        period = widenPeriod(period, p);
      }
    }
    for (const ad of dailyAds) periodOnlyAds.delete(ad);
    spend = Math.round(spend * 100) / 100;
    periodSpend = Math.round(periodSpend * 100) / 100;
    const aggregateShape = periodRows > 0 && periodRows === rows.length;
    const mixed = periodRows > 0 && !aggregateShape;
    const spendCoverage = anySpend ? pctOfBaseline(spend, baselineSpend) : null;
    const adCoverage = ads.size > 0 ? pctOfBaseline(ads.size, baselineAds.size) : null;
    // Conversion-device exports carry no spend by design (tracking_basis
    // 'conversion') — coverage-of-spend does not apply to them. A
    // whole-period ad summary is a control, not a slice: its spend is
    // cross-checked against the baseline, never graded as coverage of it.
    const coverageApplies = key !== "conversion_device" && spendCoverage !== null && !(key === "ad_summary" && aggregateShape);
    const belowThreshold = coverageApplies && spendCoverage < COVERAGE_THRESHOLD_PCT;

    // Over-baseline reconciliation: a breakdown class can only ever slice the
    // daily-attributable total — spend EXCEEDING it means rows are being
    // counted more than once (the demographic double-ingestion shipped as
    // BUG-19 showed up as exactly 200% here). 101% allows rounding drift.
    // A whole-period pivot whose period reaches beyond the days the daily
    // rows cover legitimately exceeds them: that is days, not duplication.
    // In a mixed class the whole-period rows belong to ads the daily rows
    // do not carry (that is why the overlap rule kept them), so they are
    // outside the baseline and outside this check.
    const beyondDailySpan =
      aggregateShape && period !== null && dailyStart !== null && dailyEnd !== null && (period.start < dailyStart || period.end > dailyEnd);
    const comparableCoverage = mixed && baselineSpend > 0 ? pctOfBaseline(Math.round((spend - periodSpend) * 100) / 100, baselineSpend) : spendCoverage;
    const overBaseline = coverageApplies && comparableCoverage !== null && comparableCoverage > 101 && !beyondDailySpan;

    const problems: string[] = [];
    if (overBaseline) {
      problems.push(
        `Reconciliation check failed: ${iapCsvClassLabel(key)} rows carry ${money(mixed ? Math.round((spend - periodSpend) * 100) / 100 : spend)} of spend, ` +
          `${comparableCoverage}% of the ${money(baselineSpend)} daily-attributable total for this window. ` +
          `A breakdown can never exceed the total, so some rows are being counted more than once. ` +
          `Most likely the same export is staged twice in different formats or overlapping date windows. ` +
          `Remove the duplicate file(s) and re-run analysis.`,
      );
    } else if (beyondDailySpan && spendCoverage !== null && spendCoverage > 101) {
      problems.push(
        `${iapCsvClassLabel(key)} rows carry ${money(spend)}, more than the ${money(baselineSpend)} the daily rows sum to, ` +
          `because the export covers ${span(period!)} while the daily rows cover ${dailyStart} to ${dailyEnd}. ` +
          `Re-export the daily report for the full period to align them.`,
      );
    } else if (belowThreshold && key === "demographic") {
      // Context, not a warning (owner direction 2026-09-02): what the rows
      // carry, what that means for a segment read, and how to widen it.
      problems.push(
        `Demographic rows carry ${money(spend)} of the ${money(baselineSpend)} daily-attributable spend (${spendCoverage}%) ` +
          `across ${ads.size} of ${baselineAds.size} ads; segment reads describe that slice. ` +
          `To widen it, re-export Demographics for all ads over the full window.`,
      );
    } else if (belowThreshold) {
      problems.push(
        `${iapCsvClassLabel(key)} rows carry ${spendCoverage}% of the daily-attributable spend for this window. Surfaces built from this class describe only that slice.`,
      );
    }
    if (mixed && period) {
      problems.push(
        `${money(periodSpend)} of the ${iapCsvClassLabel(key)} spend comes from whole-period rows (${span(period)}) for ${periodOnlyAds.size} ad(s) the daily rows do not carry; ` +
          `those rows are outside the daily baseline and the duplicate check.`,
      );
    }
    const context: string[] = [];
    if (aggregateShape && period && key === "ad_summary") {
      context.push(
        `This ad summary export is a whole-period per-ad report covering ${span(period)} (its date column is the report window start on every row), not a daily export. ` +
          `Its ${money(spend)} period total was used for creative metadata and total-spend cross-checking only, never added to daily totals. ` +
          `Re-export it with the "Day" breakdown to include ad-level daily spend.`,
      );
    } else if (aggregateShape && period) {
      const surface = key === "demographic" ? "Audience" : key === "conversion_device" ? "Devices" : "Placements";
      context.push(
        `This ${shortClassNoun(key)} export is a whole-period report covering ${span(period)} (its date column is the report window start on every row), not a daily export. ` +
          `Its ${money(spend)} feeds the ${surface} breakdowns and the reconciliation ledger at period grain; it never adds to the daily ad rows.`,
      );
    }
    // The run repeats a problem; the whole-period sentence on its own
    // duplicates the run's [Whole-period] warning and stays on the coverage.
    if (problems.length > 0) warnings.push(`[Coverage] ${problems.join(" ")}`);
    const notes = [...problems, ...context];

    classes.push({
      report_class: key,
      rows_scoped: rows.length,
      distinct_ads: ads.size,
      spend: anySpend ? spend : null,
      spend_coverage_pct: spendCoverage,
      ad_coverage_pct: adCoverage,
      aggregate_shape: aggregateShape,
      below_threshold: belowThreshold,
      note: notes.length > 0 ? notes.join(" ") : null,
    });
  }

  return {
    coverage: {
      window: args.window,
      baseline_spend: baselineSpend,
      baseline_distinct_ads: baselineAds.size,
      threshold_pct: COVERAGE_THRESHOLD_PCT,
      classes,
    },
    warnings,
  };
}

/** The coverage alone; see computeDataCoverageReport for the run warnings it carries. */
export function computeDataCoverage(args: Parameters<typeof computeDataCoverageReport>[0]): AnalysisDataCoverage {
  return computeDataCoverageReport(args).coverage;
}

/** The union of two periods. */
function widenPeriod(cur: { start: string; end: string } | null, p: { start: string; end: string }): { start: string; end: string } {
  if (!cur) return { start: p.start, end: p.end };
  return { start: p.start < cur.start ? p.start : cur.start, end: p.end > cur.end ? p.end : cur.end };
}

/** The short noun a coverage note calls a class by ("placements", not the spec's full label). */
function shortClassNoun(key: ReportClassCoverageKey): string {
  switch (key) {
    case "demographic":
      return "demographics";
    case "device_placement":
      return "placements";
    case "ad_summary":
      return "ad summary";
    case "conversion_device":
      return "conversion device";
  }
}

/**
 * The run's note for one file that lost rows to another (reportOverlap.ts):
 * which two files, how many ads, why the winner won, what was not counted.
 * Pure; exported for unit tests.
 */
export function overlapWarning(
  files: readonly { importId: string; label: string; filename: string; grain: Pick<ReportGrain, "dimensions" | "period"> }[],
  s: OverlapSupersession,
): string {
  const loser = files.find((f) => f.importId === s.loser);
  const winner = files.find((f) => f.importId === s.winner);
  const label = loser?.label ?? winner?.label ?? "Report";
  const l = `"${loser?.filename ?? s.loser}"`;
  const w = `"${winner?.filename ?? s.winner}"`;
  const ads = `${s.groups.toLocaleString("en-US")} ad(s)`;
  const lost = `${l}'s ${s.rows.toLocaleString("en-US")} row(s) ($${s.spend.toLocaleString("en-US")}) are not counted again`;
  if (s.reason === "daily_over_period") {
    return `[Overlap] ${label} ${l} and ${w} both cover ${ads}. ${w} carries them by day and ${l} as one period, so the daily rows are used and ${lost}.`;
  }
  if (s.reason === "finer_breakdown") {
    const dims = winner?.grain.dimensions.join(" · ") ?? "more dimensions";
    return `[Overlap] ${label} ${l} and ${w} both cover ${ads} over the same days. ${w} carries the finer breakdown (${dims}), so its rows are used and ${lost}.`;
  }
  return `[Overlap] ${label} ${l} and ${w} both cover ${ads} over the same days. ${w} was staged later, so its rows are used and ${lost}. If both are the same export, remove one of them.`;
}

/**
 * The run's note for one whole-period file in scope: what its rows are,
 * what period they cover, and where their spend goes. Pure; exported for
 * unit tests.
 */
export function wholePeriodWarning(
  file: { cls: IapCsvClass; label: string; filename: string },
  period: ReportPeriod,
  spend: number,
  adGrain: "daily" | "period",
): string {
  const covering = period.endKnown
    ? `${period.start} to ${period.end}`
    : `${period.start} to ${period.end} (it states no reporting end; the run window end is assumed)`;
  const head =
    `[Whole-period] ${file.label} "${file.filename}": every row carries the report window start as its date, ` +
    `so this is a whole-period export covering ${covering}, not a daily export.`;
  const money = `$${spend.toLocaleString("en-US")}`;
  if (adGrain === "period") return `${head} No daily export is staged, so every ad row carries this period rather than a day.`;
  if (file.cls === "ad_summary") {
    return `${head} Its ${money} was used for creative metadata and total-spend cross-checking only, never added to daily totals. Re-export it with the "Day" breakdown to include ad-level daily spend.`;
  }
  const surface = file.cls === "demographic" ? "Audience" : file.cls === "asset" ? "Creative" : file.cls === "conversion_device" ? "Devices" : "Placements";
  return `${head} Its ${money} feeds the ${surface} breakdowns and the reconciliation ledger at period grain; it never adds to the daily ad rows.`;
}

/**
 * Maps merged ad buckets to ad_performance insert rows, enforcing two
 * invariants BEFORE any DB write happens (so a violation aborts the run with
 * an actionable message instead of a raw Postgres "duplicate key value
 * violates unique constraint" — the August 2026 AAFE failure mode):
 *
 *   1. Every bucket date is a normalized YYYY-MM-DD string. The parser's
 *      normalizeDayValues() guarantees this for CSV-sourced rows; this
 *      assertion is defense-in-depth for any future non-parser data path,
 *      because an unnormalized date silently corrupts the analysis window
 *      math and the DB's date-typed unique key.
 *   2. No two buckets resolve to the same (ad_name, campaign_name,
 *      result_type, day) tuple — the account-scoped unique key on
 *      ad_performance. Bucket keys are (campaign, ad, date) strings, so this
 *      can only happen when two staged files date the same real-world day
 *      differently; with dates normalized it should be impossible, and if it
 *      ever fires the message says which row collided.
 *
 * Exported for unit testing (same rationale as mergeAdPerformanceBuckets).
 */
export function buildAdPerformanceRows(
  accountId: string,
  runId: string,
  adBuckets: Map<string, AdDayBucket>,
  adCreativeMetadata: Map<string, Record<string, string>>,
): Record<string, any>[] {
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const seenTuples = new Set<string>();
  return Array.from(adBuckets.values()).map((b) => {
    if (!ISO_DAY.test(b.date) || (b.dateEnd !== undefined && !ISO_DAY.test(b.dateEnd))) {
      throw new AnalysisError(
        `Internal consistency check failed: an aggregated ad row for "${b.adName}" carries the non-normalized date "${b.date}". ` +
          `This should have been normalized at parse time — re-export the file as CSV directly from Meta and re-upload.`,
        422,
      );
    }
    const tuple = [b.metaAdId || b.adName, b.campaign, b.resultType, b.date, b.dateEnd ?? b.date].join("\u0001");
    if (seenTuples.has(tuple)) {
      throw new AnalysisError(
        `Internal consistency check failed: two aggregated rows resolved to the same ad/day — ` +
          `ad "${b.adName}", campaign "${b.campaign}", result type "${b.resultType}", day ${b.date}. ` +
          `This usually means two staged files represent the same day in different date formats. ` +
          `Re-export both files as CSV directly from Meta and re-upload.`,
        422,
      );
    }
    seenTuples.add(tuple);
    const creativeMeta = adCreativeMetadata.get(b.metaAdId || b.adName);
    return {
      account_id: accountId,
      campaign_name: b.campaign,
      ad_set_name: b.adSet || null,
      ad_name: b.adName,
      meta_ad_id: b.metaAdId || null,
      image_name: b.imageName || null,
      video_name: b.videoName || null,
      result_type: b.resultType,
      date_start: b.date,
      date_end: b.dateEnd ?? b.date,
      spend: b.spend,
      impressions: b.impressions,
      reach: b.reach,
      clicks_all: b.clicksAll,
      link_clicks: b.linkClicks,
      results: b.results,
      ...derivedRates(b.spend, b.impressions, b.linkClicks, b.results),
      manual_analysis_run_id: runId,
      extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      ad_creative_metadata: creativeMeta && Object.keys(creativeMeta).length > 0 ? creativeMeta : null,
    };
  });
}

// ─── Result-event grain builders (pure, tested) ─────────────────────────
// Owner direction (2026-09-03): awareness campaigns and purchase-intent
// events are never weighted against each other. These builders replace the
// inline concept / variable rollups that keyed on (book, concept) and
// (token) alone — summing purchases + leads + ThruPlays into one `results`
// and judging a concept against a book baseline diluted by other events.
// Now every row is one event, every baseline is the same event, and an
// awareness row's lift reads click-through, not cost per result.

export interface AdPerformanceLikeRow {
  ad_name?: unknown;
  meta_ad_id?: unknown;
  result_type?: unknown;
  spend?: unknown;
  results?: unknown;
  link_clicks?: unknown;
  impressions?: unknown;
  ad_creative_metadata?: unknown;
}

const rowType = (row: AdPerformanceLikeRow): string => {
  const rt = row.result_type;
  return typeof rt === "string" && rt.trim() !== "" ? rt.trim() : "unknown";
};

/** Tier thresholds on lift vs the same-event baseline. */
function tierForLift(lift: number | null, results: number, scale: "cost_per_result" | "communication" | null): string | null {
  if (lift !== null) {
    if (lift >= 0.1) return "1 - Scale Winners";
    if (lift >= 0) return "2 - Optimize";
    if (lift >= -0.2) return "3 - Hold";
    return "4 - Eliminate";
  }
  // Zero results is "no signal" only on a cost-per-result scale; an
  // awareness row with no link clicks has no click-through read, not a verdict.
  if (results === 0 && scale === "cost_per_result") return "4 - Eliminate";
  return null;
}

export interface ConceptRowsOptions {
  accountId: string;
  runId: string;
  dateStart: string;
  dateEnd: string;
  libraryConcepts: ReadonlySet<string>;
  extractConcept: (adName: string) => string | null;
  extractBook: (adName: string) => string | null;
  hasCopyForAd: (row: AdPerformanceLikeRow) => boolean;
}

/**
 * concept_performance rows at (book, concept, result_type) grain.
 *
 * Lift and tier compare a concept with the SAME event's book baseline:
 * cost-per-result classes on CPA (cheaper is lift), awareness on link CTR
 * (higher is lift) — the communication scale. buying_intent_score is null
 * for awareness rows: a ThruPlay is not a purchase-intent signal.
 */
export function buildConceptPerformanceRows(adRows: readonly AdPerformanceLikeRow[], o: ConceptRowsOptions): Record<string, any>[] {
  type Agg = { book: string | null; concept: string; resultType: string; spend: number; results: number; linkClicks: number; impressions: number; spendWithCopy: number };
  const conceptMap = new Map<string, Agg>();
  for (const row of adRows) {
    const concept = o.extractConcept(String(row.ad_name ?? ""));
    if (!concept) continue;
    const book = o.extractBook(String(row.ad_name ?? ""));
    const resultType = rowType(row);
    const cKey = [book ?? "", concept, resultType].join("\u0001");
    if (!conceptMap.has(cKey)) {
      conceptMap.set(cKey, { book, concept, resultType, spend: 0, results: 0, linkClicks: 0, impressions: 0, spendWithCopy: 0 });
    }
    const c = conceptMap.get(cKey)!;
    const rowSpend = Number(row.spend ?? 0);
    c.spend += rowSpend;
    c.results += Number(row.results ?? 0);
    c.linkClicks += Number(row.link_clicks ?? 0);
    c.impressions += Number(row.impressions ?? 0);
    if (o.hasCopyForAd(row)) c.spendWithCopy += rowSpend;
  }
  if (conceptMap.size === 0) return [];

  // Book baseline PER EVENT: total spend / results (cost scale) and
  // link clicks / impressions (communication scale) for the same result type.
  const bookTotals = new Map<string, { spend: number; results: number; linkClicks: number; impressions: number }>();
  for (const c of conceptMap.values()) {
    const bk = [c.book ?? "", c.resultType].join("\u0001");
    const t = bookTotals.get(bk) ?? { spend: 0, results: 0, linkClicks: 0, impressions: 0 };
    t.spend += c.spend; t.results += c.results; t.linkClicks += c.linkClicks; t.impressions += c.impressions;
    bookTotals.set(bk, t);
  }

  return Array.from(conceptMap.values()).map((c) => {
    const classification = classifyResultEvent(c.resultType);
    const scale = classification.scale;
    const spend = c.spend > 0 ? c.spend : null;
    const results = c.results > 0 ? c.results : null;
    const cpa = spend !== null && results !== null ? spend / results : null;
    const cvrLinkPct = c.linkClicks > 0 && results !== null ? (results / c.linkClicks) * 100 : null;
    const ctr = c.impressions > 0 ? (c.linkClicks / c.impressions) * 100 : null;
    const base = bookTotals.get([c.book ?? "", c.resultType].join("\u0001"))!;

    let liftVsBaseline: number | null = null;
    let liftBasis: "cpa" | "link_ctr" = "cpa";
    if (scale === "communication") {
      liftBasis = "link_ctr";
      const baseCtr = base.impressions > 0 ? (base.linkClicks / base.impressions) * 100 : null;
      liftVsBaseline = ctr !== null && baseCtr !== null && baseCtr > 0 ? (ctr - baseCtr) / baseCtr : null;
    } else {
      const baseCpa = base.results > 0 ? base.spend / base.results : null;
      liftVsBaseline = cpa !== null && baseCpa !== null && baseCpa > 0 ? (baseCpa - cpa) / baseCpa : null;
    }
    const performanceTier = tierForLift(liftVsBaseline, c.results, scale);
    // buying_intent_score: result volume with an engagement signal — only
    // meaningful for an event that IS intent. Awareness rows get null.
    const buyingIntentScore = scale === "communication" ? null : c.results * 10 + c.linkClicks;
    const confidenceLevel = volumeConfidence(c.spend, c.results);
    const creativeCoverage = c.spend > 0 ? c.spendWithCopy / c.spend : 0;
    return {
      account_id: o.accountId,
      manual_analysis_run_id: o.runId,
      book: c.book,
      concept: c.concept,
      result_type: c.resultType,
      intent_class: classification.intent,
      lift_basis: liftBasis,
      date_start: o.dateStart,
      date_end: o.dateEnd,
      spend,
      impressions: c.impressions > 0 ? c.impressions : null,
      link_clicks: c.linkClicks > 0 ? c.linkClicks : null,
      results,
      cpa,
      cvr_link_pct: cvrLinkPct,
      mapped_in_library: o.libraryConcepts.has(c.concept),
      buying_intent_score: buyingIntentScore !== null && buyingIntentScore > 0 ? buyingIntentScore : null,
      performance_lift_vs_baseline: liftVsBaseline !== null ? liftVsBaseline.toFixed(4) : null,
      performance_tier: performanceTier,
      confidence_level: confidenceLevel,
      creative_coverage_pct: Math.round(creativeCoverage * 10000) / 100,
      evidence_grade: evidenceGrade(creativeCoverage),
      confidence_score: confidenceScore(confidenceLevel, creativeCoverage),
    };
  });
}

const isSkippedAdToken = (t: string): boolean =>
  /^[A-Za-z]\d+[A-Za-z]*$/.test(t) || // cell/concept codes: C2, C2E, C2EA
  /^BOOK\d+$/i.test(t) ||              // BOOK0, BOOK2
  /^T\d+$/i.test(t) ||                 // T1, T2 (test round)
  /^\d+$/.test(t);                     // purely numeric tokens

/**
 * variable_performance rows at (token, result_type) grain. Raw variable
 * tokens are the underscore-delimited parts of an ad name that are not the
 * cell/concept code, BOOK label or test-round suffix ("C2E_STC_QF_BOOK2_T1"
 * → STC, QF). `unique_ads` counts DISTINCT ads (Meta ad id, else name) —
 * the previous count was ad-day rows, which read "30 unique ads" for a
 * token two ads carried across fifteen days.
 */
export function buildVariablePerformanceRows(
  adRows: readonly AdPerformanceLikeRow[],
  o: { accountId: string; runId: string; dateStart: string; dateEnd: string },
): Record<string, any>[] {
  type Agg = { token: string; resultType: string; spend: number; results: number; linkClicks: number; ads: Set<string> };
  const map = new Map<string, Agg>();
  for (const row of adRows) {
    const adName = String(row.ad_name ?? "");
    const adKey = (typeof row.meta_ad_id === "string" && row.meta_ad_id.trim() !== "" ? row.meta_ad_id.trim() : adName) || adName;
    const resultType = rowType(row);
    const tokens = adName.split("_").map((t) => t.trim().toUpperCase()).filter((t) => t.length > 0 && !isSkippedAdToken(t));
    for (const token of new Set(tokens)) {
      const k = [token, resultType].join("\u0001");
      const v = map.get(k) ?? { token, resultType, spend: 0, results: 0, linkClicks: 0, ads: new Set<string>() };
      v.spend += Number(row.spend ?? 0);
      v.results += Number(row.results ?? 0);
      v.linkClicks += Number(row.link_clicks ?? 0);
      if (adKey) v.ads.add(adKey);
      map.set(k, v);
    }
  }
  return Array.from(map.values()).map((v) => ({
    account_id: o.accountId,
    manual_analysis_run_id: o.runId,
    variable_family: "raw_token",
    variable_id: v.token,
    result_type: v.resultType,
    intent_class: classifyResultEvent(v.resultType).intent,
    date_start: o.dateStart,
    date_end: o.dateEnd,
    payload: variablePerformancePayload(v.token, { spend: v.spend, results: v.results, linkClicks: v.linkClicks, adCount: v.ads.size }, v.resultType),
  }));
}

/**
 * Builds one variable_performance row's `payload` for a single raw-token
 * aggregate (variable_family: "raw_token" — see the Stage 2 variable-level
 * comment at its call site in startManualAnalysis). Extracted out of the
 * varRows .map() there so the CTR/CVR field mapping below can be unit
 * tested without a live Supabase connection.
 *
 * Impressions is hardcoded to 0 above because true CTR (link clicks /
 * impressions) is not computable at the token level — tokens are derived
 * from ad_name substrings, not tied to a single ad's impression count. The
 * only ratio actually computable here is results-per-link-click (CVR), so
 * CTR_link_pct must NOT receive that CVR value — it must reflect "not
 * computable", matching how every other writer of this exact field name
 * behaves on a zero/absent denominator: `derivedRates()` in this file
 * returns `ctr_link_pct: null` when impressions is null/0, and
 * `pctOf()` in scripts/src/metrix-supabase/import.ts returns null on a
 * zero denominator. Result_per_link_click_pct is the correct, dedicated
 * home for the CVR value — it must not be dropped, just not duplicated
 * onto the CTR field.
 */
export function variablePerformancePayload(
  token: string,
  v: { spend: number; results: number; linkClicks: number; adCount: number },
  resultType: string,
): Record<string, unknown> {
  const cpa = v.results > 0 ? v.spend / v.results : null;
  const cvrLinkPct = v.linkClicks > 0 && v.results > 0 ? (v.results / v.linkClicks) * 100 : null;
  return {
    // Payload must match VariablePerformanceRow (client seedTypes) so
    // report export, top-checkout rollups, and other consumers can read
    // these rows without a transform.
    variable_family: "raw_token",
    variable_id: token,
    "Result type": resultType,
    "Amount spent (USD)": v.spend,
    // Reach / Impressions / Clicks (all) are not available at the token
    // level — set to 0 so numeric consumers don't receive undefined.
    Reach: 0,
    Impressions: 0,
    "Clicks (all)": 0,
    "Link clicks": v.linkClicks,
    Results: v.results,
    unique_ads: v.adCount,
    CPA_result: cpa,
    CTR_link_pct: null,
    Result_per_link_click_pct: cvrLinkPct ?? 0,
  };
}

/**
 * Syncs all staged creative asset imports for an account to their mapped
 * ad names. For each creative_asset import with a non-empty ad_names list,
 * issues an UPDATE against the ads table so the file URL lands on the matched
 * row. Returns a summary of how many ad names were linked vs still unmatched.
 *
 * This is non-fatal by design — callers should catch and log errors without
 * surfacing them to users as blocking failures.
 */
export async function syncAllCreativeLinksForAccount(
  accountId: string,
): Promise<CreativeLinkageSummary> {
  const supabase = getSupabase();
  // Files uploaded before this run had no registry to match against; now
  // there is one. Mapping is the server's job (creativeAutoMap.ts), not
  // the upload dialog's — non-fatal, a file with no credible match simply
  // stays unmapped and visible.
  try {
    await autoMapUnmappedCreatives(accountId);
  } catch (err) {
    logger.warn({ accountId, err }, "syncAllCreativeLinksForAccount: auto-map step failed; continuing with existing mappings");
  }
  const { data: creativeImports, error } = await supabase
    .from("manual_imports")
    .select("id, filename, ad_names")
    .eq("account_id", accountId)
    .eq("kind", "creative_asset");
  if (error) throw new Error(error.message);

  let totalLinked = 0;
  let totalMappings = 0;
  const unlinkedNames: string[] = [];

  for (const imp of creativeImports ?? []) {
    const adNames = (imp["ad_names"] as string[] | null) ?? [];
    if (adNames.length === 0) continue;
    totalMappings += adNames.length;
    const fileUrl = `/api/metrix/accounts/${accountId}/manual-imports/${imp["id"]}/file`;
    const sync = await supabase
      .from("ads")
      .update({ creative_asset_url: fileUrl, asset_filename: imp["filename"], asset_servable: true })
      .eq("account_id", accountId)
      .in("ad_name", adNames)
      .select("ad_name");
    if (sync.error) {
      logger.warn(
        { accountId, importId: imp["id"], err: sync.error },
        "syncAllCreativeLinksForAccount: partial failure on import",
      );
      unlinkedNames.push(...adNames);
      continue;
    }
    const linked = new Set((sync.data ?? []).map((r) => r["ad_name"] as string));
    totalLinked += linked.size;
    for (const name of adNames) {
      if (!linked.has(name)) unlinkedNames.push(name);
    }
  }

  // Stable Meta asset-name mappings are primary. The ad-name loop above is
  // retained as a compatibility fallback for historical manual mappings.
  const sticky = await syncStickyCreativeAssetMappings(accountId);
  totalLinked += sticky.linkedAdNames.filter((name) => !unlinkedNames.includes(name)).length;
  totalMappings += sticky.mappedAliases;
  const healed = new Set(sticky.linkedAdNames);
  for (let i = unlinkedNames.length - 1; i >= 0; i -= 1) {
    if (healed.has(unlinkedNames[i]!)) unlinkedNames.splice(i, 1);
  }

  return { linked: totalLinked, total: totalMappings, unlinked_names: unlinkedNames };
}

/**
 * Computes current creative linkage status for an account by querying
 * manual_imports and checking which ad names have a matching ads row with
 * a creative_asset_url set. Does NOT write to the database — read-only
 * diagnostic query.
 */
export async function computeCreativeLinkageSummary(accountId: string): Promise<CreativeLinkageSummary> {
  const supabase = getSupabase();

  const importsResult = await supabase
    .from("manual_imports")
    .select("id, ad_names")
    .eq("account_id", accountId)
    .eq("kind", "creative_asset");
  if (importsResult.error) throw new Error(importsResult.error.message);

  const allMappedNames: string[] = [];
  for (const imp of importsResult.data ?? []) {
    const adNames = (imp["ad_names"] as string[] | null) ?? [];
    allMappedNames.push(...adNames);
  }

  if (allMappedNames.length === 0) {
    return { linked: 0, total: 0, unlinked_names: [] };
  }

  const adsRows = await selectAllRows(
    "ads",
    (q) => q.eq("account_id", accountId).not("creative_asset_url", "is", null).in("ad_name", allMappedNames).order("id"),
    "ad_name",
  );
  const adsResult = { data: adsRows, error: null as { message: string } | null };

  const linkedSet = new Set((adsResult.data ?? []).map((r) => r["ad_name"] as string));
  const unlinkedNames = allMappedNames.filter((n) => !linkedSet.has(n));

  return {
    linked: linkedSet.size,
    total: allMappedNames.length,
    unlinked_names: unlinkedNames,
  };
}

/**
 * Validates prerequisites (a manual account with BOTH the demographic and
 * device/placement/platform CSVs staged) and starts an analysis run.
 * Returns the run id immediately; parsing continues in the background and
 * the run row records the outcome.
 */
export async function startManualAnalysis(
  accountId: string,
  dateRange: DateRangePreset,
  createdBy: string,
  confirmConversionExport = false,
): Promise<string> {
  const account = await accountExists(accountId);
  if (!account) throw new AnalysisError("Ad account not found.", 404);
  // The full-refresh deletes below assume this account's performance and
  // signal rows are owned exclusively by manual analysis. Imported accounts
  // (offline importer) and live Meta accounts own their rows elsewhere —
  // running a manual analysis against them would destroy that data.
  if (account["source_status"] !== "manual_reports") {
    throw new AnalysisError(
      "Manual analysis is only available for manual-report accounts. This account's data is managed by its own import pipeline.",
      422,
    );
  }

  const supabase = getSupabase();
  // status='staged' is load-bearing, not an optimization: a prior successful
  // run destages the CSVs it consumed to 'processed' (see markImportsProcessed)
  // specifically so the NEXT run starts from an empty staging area. Without
  // this filter, every subsequent run on an account would silently re-pull
  // every CSV ever uploaded — not just the newly staged batch — and merge
  // their rows together, double-counting spend/impressions/results for any
  // date that appears in more than one file (virtually certain for "all" and
  // for any overlapping weekly/monthly re-export).
  // Metadata only. The bytes of each file are read one at a time, on
  // demand, through loadImportContentBuffer — selecting `content` for every
  // staged file in one query is what wedged the database on 2026-09-02.
  // Staging order is load-bearing: when two files carry the same ad on the
  // same day at the same breakdown depth, the LATER-staged one supersedes
  // (reportOverlap.ts), so the rows must arrive oldest first.
  const { data: imports, error: importsErr } = await supabase
    .from("manual_imports")
    .select("id, filename, kind, size_bytes, created_at")
    .eq("account_id", accountId)
    .eq("status", "staged")
    .in("kind", ["performance_demo_csv", "performance_placement_csv", "performance_ad_summary_csv", "performance_conversion_device_csv", "performance_asset_csv"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (importsErr) throw new Error(importsErr.message);

  const demoImports = (imports ?? []).filter((i) => i["kind"] === "performance_demo_csv");
  const assetImports = (imports ?? []).filter((i) => i["kind"] === "performance_asset_csv");
  const placementImports = (imports ?? []).filter((i) => i["kind"] === "performance_placement_csv");
  const summaryImports = (imports ?? []).filter((i) => i["kind"] === "performance_ad_summary_csv");
  const conversionDeviceImports = (imports ?? []).filter((i) => i["kind"] === "performance_conversion_device_csv");
  // Adaptive contract (spec §2a): no report class is mandatory. A run needs
  // at least one DELIVERY report that carries spend per ad — a demographic
  // pivot, a placement pivot, or an Ad Summary — and every other staged
  // report only adds resolution. An asset-breakdown pivot alone cannot stand
  // in for those (it attributes to assets, not to ads and days).
  const deliveryImports = demoImports.length + placementImports.length + summaryImports.length;
  if (deliveryImports === 0) {
    const missingKinds = ["performance_demo_csv", "performance_placement_csv", "performance_ad_summary_csv"];
    const missing = ["Demographics export", "Placements export", "Ad Summary export"];

    // BUG-08: a run consumes the STAGED batch, so a successful run leaves its
    // files `processed` and the next run reports them missing. That is by
    // design — reading processed files back would double-count — but the
    // message never said the files still exist and can be re-staged from
    // Import History, so the documented workaround was a byte-identical
    // re-upload of a file already in the database.
    //
    // The offer is made ONLY when there is really something to re-stage.
    // Pointing a user at an empty Import History is the BUG-29 failure over
    // again: telling someone to import a file they already imported.
    //
    // Deliberately a SECOND query rather than widening the one above: that
    // one selects `content`, and pulling bytea for every processed file is
    // what hung production once already. This selects `kind` alone.
    //
    // A failure counting them degrades to omitting the hint, deliberately: the
    // caller's real answer is the 422 about the missing reports, and turning
    // that into a 502 because an optional sentence could not be assembled
    // would be worse than saying less. It is logged, not swallowed.
    const { data: processedRows, error: processedErr } = await supabase
      .from("manual_imports")
      .select("kind")
      .eq("account_id", accountId)
      .eq("status", "processed")
      .in("kind", missingKinds);
    if (processedErr) {
      logger.warn(
        { accountId, err: processedErr.message },
        "Could not count re-stageable imports; omitting the restage hint",
      );
    }
    const restagable = processedRows?.length ?? 0;

    throw new AnalysisError(
      missingReportsMessage(missing, restagable, missingKinds.length),
      422,
    );
  }

  // ── Per-run import reader (fetch once, decode once, parse once) ────────
  // Each staged file used to be fetched, decoded, and parsed up to three
  // times per run: class detection, the conversion-export gate, then the
  // real parse loop — triple the chunk fetches and, on a large workbook,
  // triple a ~15s convert+parse. One run-scoped cache instead: bytes are
  // fetched once, decoded text is cached per sheet-selection key, and the
  // parse result is cached per (import, class) so the gate's full parse is
  // the same object the main loop consumes. All three caches are cleared
  // after the parse loops, before the DB-heavy ingestion phase, so the
  // memory is released as early as possible.
  const importBuffers = new Map<string, Promise<Buffer>>();
  const getImportBuffer = (imp: { id?: unknown; content?: unknown }): Promise<Buffer> => {
    const id = String(imp["id"]);
    let p = importBuffers.get(id);
    if (!p) {
      p = loadImportContentBuffer(imp);
      importBuffers.set(id, p);
    }
    return p;
  };
  const importTexts = new Map<string, Promise<{ text: string; warnings: string[] }>>();
  const getImportText = (
    imp: { id?: unknown; content?: unknown; filename?: unknown },
    expectedColumns?: readonly string[],
  ): Promise<{ text: string; warnings: string[] }> => {
    const key = `${String(imp["id"])}|${expectedColumns ? expectedColumns.join(",") : ""}`;
    let p = importTexts.get(key);
    if (!p) {
      p = getImportBuffer(imp).then((buf) =>
        decodeStagedContentAsCsvText(buf, String(imp["filename"]), expectedColumns),
      );
      importTexts.set(key, p);
    }
    return p;
  };
  // Header-only fast path for class detection: reading the first row is all
  // detection needs, and fully decoding a large file there (a ~12s streaming
  // convert of a 2.3M-cell workbook, or a 100MB+ toString of a big CSV) was
  // pure waste before a single data row was required.
  const getImportHeaderCells = async (imp: {
    id?: unknown;
    content?: unknown;
    filename?: unknown;
  }): Promise<string[]> => {
    const buf = await getImportBuffer(imp);
    const filename = String(imp["filename"]);
    if (extensionOf(filename) === "xlsx" || looksLikeXlsxContent(buf)) {
      return readXlsxHeaderCells(buf);
    }
    // Only the first line matters — decode at most the first 256KB.
    const cap = Math.min(buf.length, 262144);
    let end = buf.indexOf(0x0a);
    if (end === -1 || end > cap) end = cap;
    return csvFirstLineHeaders(buf.toString("utf8", 0, end));
  };

  const importParses = new Map<string, { result: IapCsvParseResult; xlsxWarnings: string[] }>();
  const parseImportForClass = async (
    imp: { id?: unknown; content?: unknown; filename?: unknown },
    cls: IapCsvClass,
  ): Promise<{ result: IapCsvParseResult; xlsxWarnings: string[] }> => {
    const key = `${String(imp["id"])}|${cls}`;
    const hit = importParses.get(key);
    if (hit) return hit;
    const { text, warnings } = await getImportText(imp, IAP_CSV_CLASS_SPECS[cls].requiredBreakdownColumns);
    const entry = { result: parseIapCsv(text, cls), xlsxWarnings: warnings };
    importParses.set(key, entry);
    return entry;
  };
  const clearImportCaches = (): void => {
    importBuffers.clear();
    importTexts.clear();
    importParses.clear();
  };

  // ── Duplicate-class guard ──────────────────────────────────────────────
  // Detect the actual pivot class of each staged CSV and verify the two
  // slots cover DISTINCT classes (one demographic, one device_placement).
  // A user can upload two copies of the same class (e.g. two demographic
  // exports) without triggering the upload-time mismatch check when the
  // file lacks the opposing class's exclusive signature columns.
  // XLSX conversion errors on a genuinely corrupt file are deferred to the
  // real parse pass below (same philosophy as the conversion-export gate
  // just below this one) — an unreadable file just detects as "inconclusive"
  // here rather than surfacing a confusing error from a pre-check.
  const detectClassForImport = async (imp: { content?: unknown; filename?: unknown }): Promise<IapCsvClass | null> => {
    try {
      return detectCsvClassFromHeaders(await getImportHeaderCells(imp));
    } catch {
      return null;
    }
  };
  const demoDetected = await Promise.all(demoImports.map(detectClassForImport));
  const placementDetected = await Promise.all(placementImports.map(detectClassForImport));
  const dupCheck = checkDuplicateCsvClasses(demoDetected, placementDetected);
  if (dupCheck) {
    throw new AnalysisError(
      `Both staged CSVs are ${iapCsvClassLabel(dupCheck.duplicatedClass)} exports. ` +
        `The ${iapCsvClassLabel(dupCheck.missingClass)} pivot export is missing — ` +
        `upload the correct file in the other slot before running analysis.`,
      422,
    );
  }

  // ── Conversion-export confirmation gate ─────────────────────────────────
  // Delivery-class files (demographic/placement/ad-summary) with the
  // all-zero-impressions conversion-export signature would previously only
  // surface a post-hoc warning AFTER the run committed impossible CTR/CPM
  // numbers. Block here instead: require the caller to explicitly confirm
  // before those files are used, unless they already have.
  if (!confirmConversionExport) {
    const deliveryImports: { filename: string; row: { id?: unknown; content?: unknown }; csvClass: IapCsvClass }[] = [
      ...demoImports.map((i) => ({ filename: String(i["filename"]), row: i, csvClass: "demographic" as IapCsvClass })),
      ...placementImports.map((i) => ({ filename: String(i["filename"]), row: i, csvClass: "device_placement" as IapCsvClass })),
      ...summaryImports.map((i) => ({ filename: String(i["filename"]), row: i, csvClass: "ad_summary" as IapCsvClass })),
    ];
    const suspectFiles: string[] = [];
    for (const imp of deliveryImports) {
      try {
        const { result } = await parseImportForClass(imp.row, imp.csvClass);
        if (result.conversionExportSuspected) suspectFiles.push(imp.filename);
      } catch {
        // Malformed files (including unreadable XLSX) are reported by the real parse pass below — skip here.
      }
    }
    if (suspectFiles.length > 0) {
      throw new AnalysisError(
        `${suspectFiles.length === 1 ? "One of your staged files looks" : "Some of your staged files look"} like a Meta conversion-event export, not a delivery export: ${suspectFiles.join(", ")}. ` +
          "Delivery exports include impression counts — a conversion export will produce impossible CTR/CPM values. " +
          "Confirm to run anyway, or re-export from Ads Manager using the standard Delivery report type.",
        409,
        "conversion_export_confirmation_required",
        suspectFiles,
      );
    }
  }

  const runId = await startRun(accountId, dateRange, createdBy);
  // Signal liveness while the run works, so a long parse cannot be
  // mistaken for a dead process and have its partial rows deleted
  // out from under it.
  const stopHeartbeat = startRunHeartbeat("manual_analysis_runs", runId);

  void (async () => {
    try {
      await updateProgress(runId, 5, "Parsing demographics export");
      const allCsvWarnings: string[] = [];
      // Every parsed file with its grain and its rows after exact-duplicate
      // removal, in staging order (oldest first). The class arrays are built
      // from these below, AFTER the overlaps between files of one class are
      // resolved (reportOverlap.ts), and the reconciliation layer reads the
      // same per-file rows, so the engine and the ledger never disagree
      // about what a file contributed.
      type ParsedFile = {
        cls: IapCsvClass;
        label: string;
        importId: string;
        filename: string;
        order: number;
        grain: ReportGrain;
        rows: IapCsvRow[];
        totalsRow: IapCsvParseResult["totalsRow"];
      };
      const parsedFiles: ParsedFile[] = [];
      // Staging order across classes (the imports query orders by
      // created_at): "later staged" in the overlap rule and the ledger means
      // this, never the order the classes are parsed in.
      const stagingOrder = new Map<string, number>((imports ?? []).map((i, idx) => [String(i["id"]), idx]));
      // Objective column groups seen across ALL staged files this run —
      // compared against the account's configured objectives (Settings →
      // General) to decide what gets assessed vs flagged. Never blocks.
      const objectiveGroupsPresent = new Set<ObjectiveColumnGroup>();
      const parseClass = async (imps: typeof demoImports, cls: IapCsvClass, label: string): Promise<void> => {
        const seen = new Set<string>();
        for (const imp of imps) {
          try {
            const { result, xlsxWarnings } = await parseImportForClass(imp, cls);
            for (const w of xlsxWarnings) allCsvWarnings.push(`[${label} "${imp["filename"]}"] ${w}`);
            for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
            const rows: IapCsvRow[] = [];
            appendRowsCrossFileDeduped(rows, result.rows, seen, { filename: String(imp["filename"]), label, warnings: allCsvWarnings });
            for (const w of result.warnings) {
              allCsvWarnings.push(`[${label} "${imp["filename"]}"] ${w}`);
            }
            parsedFiles.push({
              cls,
              label,
              importId: String(imp["id"]),
              filename: String(imp["filename"]),
              order: stagingOrder.get(String(imp["id"])) ?? parsedFiles.length,
              grain: detectReportGrain(result, cls),
              rows,
              totalsRow: result.totalsRow,
            });
          } catch (err) {
            const detail = err instanceof IapCsvFormatError ? err.message : String(err);
            throw new AnalysisError(`${label} file "${imp["filename"]}": ${detail}`, 422);
          }
        }
      };
      await parseClass(demoImports, "demographic", "Demographics");
      await updateProgress(runId, 20, "Parsing placements export");
      await parseClass(placementImports, "device_placement", "Placements");
      // Optional: ad-level summary export (one row per ad per day, full spend).
      // When present it becomes the primary source for ad_performance spend,
      // overriding the privacy-limited spend from the demographic export.
      if (summaryImports.length > 0) await updateProgress(runId, 36, "Parsing ad summary export");
      await parseClass(summaryImports, "ad_summary", "Ad Summary");
      // Optional: asset-breakdown pivots (a report "by asset" — Text,
      // Headline, Image name …). They feed the reconciliation layer only:
      // delivered asset evidence, asset margins and joint cells (spec §10).
      if (assetImports.length > 0) await updateProgress(runId, 40, "Parsing asset breakdown export");
      await parseClass(assetImports, "asset", "Asset breakdown");
      // Optional: conversion device export (one row per ad/device per day, conversion-only metrics).
      // These rows carry only conversion data (no spend/impressions) and are stored in
      // device_performance with tracking_basis='conversion' and device_kind='conversion'.
      if (conversionDeviceImports.length > 0) await updateProgress(runId, 42, "Parsing conversion device export");
      await parseClass(conversionDeviceImports, "conversion_device", "Conversion Device");

      // ── Grain per file, overlaps per class ──────────────────────────────
      // A file is whole-period when every row carries the same reporting
      // start (wholePeriodOf); its rows then cover a period, not a day.
      // Files of one class that carry the same ad over the same day or
      // period are not summed: one wins per ad/day (daily over whole-period,
      // then the finer breakdown, then the later staged), the rest is
      // announced. The Pure Path account staged two placement pivots, two
      // Ad Summaries and two demographic pivots of one month and read
      // three times its spend (register §15).
      const anyDailyInRun = parsedFiles.some((f) => f.grain.distinct_days > 1);
      const filePeriod = new Map<string, ReportPeriod | null>(
        parsedFiles.map((f) => [f.importId, wholePeriodOf(f.grain, anyDailyInRun)]),
      );
      const rowsByClass = new Map<IapCsvClass, IapCsvRow[]>();
      const periodByRow = new Map<IapCsvRow, ReportPeriod>();
      const fileByRow = new Map<IapCsvRow, ParsedFile>();
      const filesWithRows = new Set<string>();
      for (const cls of ["demographic", "device_placement", "ad_summary", "asset", "conversion_device"] as const) {
        const files = parsedFiles.filter((f) => f.cls === cls);
        const resolution = resolveClassOverlaps(
          files.map((f) => ({
            source: { id: f.importId, order: f.order, depth: f.grain.dimensions.length, daily: filePeriod.get(f.importId) === null },
            rows: f.rows,
          })),
          // An asset pivot competes only with a pivot of the same asset
          // columns: a Text file and a Headline file of one period are two
          // measurements, not one twice (the ledger keys them by asset type).
          (row, source) => ({
            group: cls === "asset" ? [rowAdIdentity(row), ...Object.keys(row.assetBreakdowns ?? {}).sort()].join("\u0001") : rowAdIdentity(row),
            day: source.daily ? row.breakdowns["Day"]! : null,
          }),
          (row) => num(row.base["amount_spent"]) ?? 0,
        );
        const rows: IapCsvRow[] = [];
        for (const f of files) {
          const period = filePeriod.get(f.importId) ?? null;
          for (const r of resolution.kept.get(f.importId) ?? []) {
            rows.push(r);
            fileByRow.set(r, f);
            filesWithRows.add(f.importId);
            if (period) periodByRow.set(r, period);
          }
        }
        rowsByClass.set(cls, rows);
        for (const s of resolution.superseded) allCsvWarnings.push(overlapWarning(files, s));
      }
      const demoRows = rowsByClass.get("demographic")!;
      const placementRows = rowsByClass.get("device_placement")!;
      const summaryRows = rowsByClass.get("ad_summary")!;
      const assetRows = rowsByClass.get("asset")!;
      const conversionDeviceRows = rowsByClass.get("conversion_device")!;

      // Free the raw file bytes/text/parses before the DB-heavy ingestion
      // phase — the parsed rows arrays above are all ingestion needs.
      clearImportCaches();

      // ── Derive the objectives, then apply their coverage to ingestion ──
      // OWNER DECISION (2026-09-01): the objective is DERIVED FROM THE DATA,
      // not declared by an operator. Meta already states it per ad in the
      // "Result type" column, which the demographic export reliably carries
      // and the parser lands in base.result_type. Every row class is folded
      // in so an ad appearing in only one export still gets its vote;
      // inferObjectives collapses them to one vote per ad.
      //
      // Only the DERIVED objectives get assessed: optional-metric columns
      // belonging to an objective this account does not run are dropped
      // here, BEFORE any aggregation or persistence, so they can never flow
      // into analysis tables, reports, or exports. Their presence still
      // produces a non-blocking flag via computeObjectiveCoverage (groups
      // were recorded at parse time).
      const objectiveInference = inferObjectives(
        [demoRows, placementRows, summaryRows, conversionDeviceRows, assetRows].flatMap((rows) =>
          rows.map((r) => ({
            adKey: r.breakdowns["Ad ID"]?.trim() || r.breakdowns["Ad name"]?.trim() || "",
            resultType: typeof r.base["result_type"] === "string" ? r.base["result_type"] : null,
          })),
        ),
      );
      const derivedObjectives = objectiveInference.objectives;
      logger.info(
        {
          accountId,
          runId,
          objectives: derivedObjectives,
          classifiedAds: objectiveInference.classifiedAds,
          unclassifiedAds: objectiveInference.unclassifiedAds,
          unclassifiedResultTypes: objectiveInference.unclassifiedResultTypes.slice(0, 12),
        },
        derivedObjectives.length === 0
          ? "Objective undetermined from data — no ad carried a result type naming a business outcome"
          : "Derived account objectives from ad result types",
      );
      const allowedOptionalSlugs = optionalMetricSlugsForGroups(
        derivedObjectives.map((k) => OBJECTIVE_GROUP_FOR_KEY[k]),
      );
      for (const rows of [demoRows, placementRows, summaryRows, conversionDeviceRows, assetRows]) {
        for (const row of rows) {
          for (const key of Object.keys(row.extra)) {
            if (!allowedOptionalSlugs.has(key)) delete row.extra[key];
          }
        }
      }

      await updateProgress(runId, 50, "Building performance aggregates");
      // The latest date the data reaches: the latest Day, or the latest
      // stated reporting end of a whole-period file that still contributes
      // rows (its Day is its start; a file that lost every row to a daily
      // one no longer says where the data reaches).
      const allDates = [
        ...demoRows.map((r) => r.breakdowns["Day"]!),
        ...placementRows.map((r) => r.breakdowns["Day"]!),
        ...summaryRows.map((r) => r.breakdowns["Day"]!),
        ...conversionDeviceRows.map((r) => r.breakdowns["Day"]!),
        ...assetRows.map((r) => r.breakdowns["Day"]!),
        ...[...filePeriod.entries()].filter(([id, p]) => p !== null && p.endKnown && filesWithRows.has(id)).map(([, p]) => p!.end),
      ];
      const maxDate = allDates.reduce((max, d) => (d > max ? d : max), allDates[0]!);

      const scopedDemo = demoRows.filter((r) => withinRange(r.breakdowns["Day"]!, dateRange, maxDate));
      const scopedPlacement = placementRows.filter((r) => withinRange(r.breakdowns["Day"]!, dateRange, maxDate));
      const scopedSummary = summaryRows.filter((r) => withinRange(r.breakdowns["Day"]!, dateRange, maxDate));
      if (scopedDemo.length === 0 && scopedPlacement.length === 0 && scopedSummary.length === 0) {
        throw new AnalysisError(
          `No rows fall within the selected "${dateRange}" window (latest data is ${maxDate}). Try "all" or a wider range.`,
          422,
        );
      }

      const scopedConversionDevice = conversionDeviceRows.filter((r) => withinRange(r.breakdowns["Day"]!, dateRange, maxDate));
      const scopedRows = [...scopedDemo, ...scopedPlacement, ...scopedSummary, ...scopedConversionDevice];
      const scopedDates = scopedRows.map((r) => r.breakdowns["Day"]!);
      const dateStart = scopedDates.reduce((min, d) => (d < min ? d : min), scopedDates[0]!);
      // The window end reaches the latest stated reporting end of a
      // whole-period file in scope: its rows cover to there, not to their Day.
      const dateEnd = scopedRows.reduce((max, r) => {
        const p = periodByRow.get(r);
        const end = p && p.endKnown ? p.end : r.breakdowns["Day"]!;
        return end > max ? end : max;
      }, scopedDates[0]!);
      // A whole-period row that states no reporting end covers to the window
      // end as far as this run can tell, and the run says so below.
      const periodOf = (row: IapCsvRow): ReportPeriod | null => {
        const p = periodByRow.get(row);
        if (!p) return null;
        return p.endKnown ? p : { ...p, end: dateEnd };
      };
      const wholePeriodFilesInScope = new Map<string, { file: ParsedFile; spend: number; period: ReportPeriod }>();
      for (const r of scopedRows) {
        const p = periodOf(r);
        if (!p) continue;
        const f = fileByRow.get(r)!;
        const cur = wholePeriodFilesInScope.get(f.importId) ?? { file: f, spend: 0, period: p };
        cur.spend += num(r.base["amount_spent"]) ?? 0;
        wholePeriodFilesInScope.set(f.importId, cur);
      }

      // Merge the three ad-level sources into one bucket per (campaign, ad,
      // date) — see mergeAdPerformanceBuckets for the full priority/dedupe
      // rules, including the blank-Campaign-name ad_summary handling and
      // what a whole-period row contributes.
      // Creative metadata comes from every Ad Summary file's rows as parsed,
      // not from the class array: a whole-period export that lost its rows
      // to a daily one may still be the only file carrying the copy columns.
      const creativeMetadataRows = parsedFiles.filter((f) => f.cls === "ad_summary").flatMap((f) => f.rows);
      const { adBuckets, adCreativeMetadata, unknownResultTypeRows, grain: adGrain, periodOnlyAds } = mergeAdPerformanceBuckets(
        scopedDemo,
        scopedPlacement,
        scopedSummary,
        { periodOf, creativeMetadataRows },
      );
      for (const { file, spend, period } of wholePeriodFilesInScope.values()) {
        allCsvWarnings.push(wholePeriodWarning(file, period, Math.round(spend * 100) / 100, adGrain));
      }
      if (periodOnlyAds.count > 0) {
        allCsvWarnings.push(
          `[Coverage] ${periodOnlyAds.count} ad(s) appear only in whole-period exports ($${periodOnlyAds.spend.toLocaleString("en-US")}); ` +
            `the daily ad rows and the account totals do not carry them. Re-export the daily report for the full period to include them.`,
        );
      }

      // ── Join coverage (degraded-data honesty layer) ────────────────────
      // Measured per report class against this run's own daily-attributable
      // baseline; persisted with the run and served to every aggregating
      // surface via the analysis-summary API. See computeDataCoverage.
      const { coverage: dataCoverage, warnings: coverageRunWarnings } = computeDataCoverageReport({
        window: { start: dateStart, end: dateEnd },
        scopedDemo,
        scopedPlacement,
        scopedSummary,
        scopedConversionDevice,
        adBuckets,
        periodOf,
      });
      allCsvWarnings.push(...coverageRunWarnings);
      const summaryCls = dataCoverage.classes.find((c) => c.report_class === "ad_summary");
      if (summaryCls?.aggregate_shape && adGrain === "daily") {
        const summarySpend = summaryCls.spend ?? null;
        if (summarySpend !== null && dataCoverage.baseline_spend > 0) {
          const diffPct = Math.abs(summarySpend - dataCoverage.baseline_spend) / dataCoverage.baseline_spend;
          if (diffPct > 0.01) {
            allCsvWarnings.push(
              `[Totals] Meta's whole-period total from the ad summary export is $${summarySpend.toLocaleString("en-US")}; ` +
                `the daily-attributable rows sum to $${dataCoverage.baseline_spend.toLocaleString("en-US")}. Daily views show the latter; ` +
                `the gap is spend on days or ads the daily exports don't cover.`,
            );
          }
        }
      }
      if (unknownResultTypeRows > 0) {
        allCsvWarnings.push(
          `[Result type] ${unknownResultTypeRows} ad/day row(s) had no result type in any export — recorded as "unknown" rather than a real conversion event.`,
        );
      }
      // Spend/impressions can still be genuinely absent after the summary/demo
      // fallback chain above (e.g. an ad/day present only in a device-breakdown
      // placement row with no matching summary or demo row). Every downstream
      // total (buildTotals, buildDailySeries, the summary-by-preset/date-range
      // aggregators) coalesces a null value to 0 when summing, which is correct
      // arithmetic but indistinguishable from "measured $0" unless the gap is
      // surfaced here — so it's counted and warned about explicitly rather than
      // silently understating headline spend/impressions totals.
      let unknownSpendRows = 0;
      let unknownImpressionRows = 0;
      for (const b of adBuckets.values()) {
        if (b.spend === null) unknownSpendRows += 1;
        if (b.impressions === null) unknownImpressionRows += 1;
      }
      if (unknownSpendRows > 0) {
        allCsvWarnings.push(
          `[Spend] ${unknownSpendRows} ad/day row(s) had no spend in any export — treated as 0 in totals, which may understate Total Spend.`,
        );
      }
      if (unknownImpressionRows > 0) {
        allCsvWarnings.push(
          `[Impressions] ${unknownImpressionRows} ad/day row(s) had no impressions in any export — treated as 0 in totals, which may understate Total Impressions.`,
        );
      }

      // ── Demographic rows: aggregate demo export by gender/age/day.
      // A whole-period row keeps its period: the bucket is dated at the
      // period start and ends at the period end, never a single day, and
      // the period is part of the key so a period row and a day row never
      // fold into one.
      const stampOf = (row: IapCsvRow): { date: string; dateEnd: string } => {
        const p = periodOf(row);
        const date = row.breakdowns["Day"]!;
        return p ? { date: p.start, dateEnd: p.end } : { date, dateEnd: date };
      };
      const demoBuckets = new Map<string, AggBucket & { gender: string; age: string; date: string; dateEnd: string; resultType: string }>();
      for (const row of scopedDemo) {
        const gender = row.breakdowns["Gender"]!;
        const age = row.breakdowns["Age"]!;
        const { date, dateEnd: bucketEnd } = stampOf(row);
        const resultType = rowResultType(row);
        const key = [gender, age, date, bucketEnd, resultType].join("\u0001");
        if (!demoBuckets.has(key)) demoBuckets.set(key, { ...emptyBucket(), gender, age, date, dateEnd: bucketEnd, resultType });
        accumulate(demoBuckets.get(key)!, row);
      }

      // ── Device/placement/platform rows: aggregate placement export by
      // each dimension independently, across ads, per day.
      //
      // "Impression device" is no longer a required column (see iapCsvSpec.ts):
      // Meta's own export UI can omit or blank this breakdown for some
      // date ranges/accounts even though Placement/Platform/spend still export
      // fine. Rows with a blank/missing device value are excluded from the
      // device dimension only — they still feed placement/platform aggregation
      // below, so a missing device breakdown never blocks the rest of the run.
      const deviceBuckets = new Map<string, AggBucket & { device: string; date: string; dateEnd: string; resultType: string }>();
      const placementBuckets = new Map<string, AggBucket & { placement: string; date: string; dateEnd: string; resultType: string }>();
      const platformBuckets = new Map<string, AggBucket & { platform: string; date: string; dateEnd: string; resultType: string }>();
      let deviceEligibleRows = 0;
      let deviceCoveredRows = 0;
      for (const row of scopedPlacement) {
        const { date, dateEnd: bucketEnd } = stampOf(row);
        const device = row.breakdowns["Impression device"];
        const placement = row.breakdowns["Placement"]!;
        const platform = row.breakdowns["Platform"]!;
        const resultType = rowResultType(row);

        deviceEligibleRows += 1;
        if (device != null && device.trim() !== "") {
          deviceCoveredRows += 1;
          const dKey = [device, date, bucketEnd, resultType].join("\u0001");
          if (!deviceBuckets.has(dKey)) deviceBuckets.set(dKey, { ...emptyBucket(), device, date, dateEnd: bucketEnd, resultType });
          accumulate(deviceBuckets.get(dKey)!, row);
        }

        const pKey = [placement, date, bucketEnd, resultType].join("\u0001");
        if (!placementBuckets.has(pKey)) placementBuckets.set(pKey, { ...emptyBucket(), placement, date, dateEnd: bucketEnd, resultType });
        accumulate(placementBuckets.get(pKey)!, row);

        const plKey = [platform, date, bucketEnd, resultType].join("\u0001");
        if (!platformBuckets.has(plKey)) platformBuckets.set(plKey, { ...emptyBucket(), platform, date, dateEnd: bucketEnd, resultType });
        accumulate(platformBuckets.get(plKey)!, row);
      }
      // Surface the gap honestly instead of silently emitting an empty/partial
      // device breakdown: 0% coverage means Meta's export carried no device
      // data at all for this window (its own export-eligibility limitation,
      // not an error on our side); partial coverage means only some rows had
      // it. Either way the run still succeeds — only the device dimension is
      // degraded, and conversion-attributed device data (from a separate
      // "Conversion device" upload, if staged) remains a fallback signal.
      const deviceCoveragePct = deviceEligibleRows > 0 ? deviceCoveredRows / deviceEligibleRows : null;
      if (deviceEligibleRows > 0 && deviceCoveredRows === 0) {
        allCsvWarnings.push(
          `[Impression device] This export carried no per-device breakdown for the "${dateRange}" window — Meta didn't include device data for these dates/account. ` +
            `Device-level delivery metrics won't be shown for this window; conversion-attributed device data (if a "Conversion device" file is staged) is shown instead where available.`,
        );
      } else if (deviceCoveragePct !== null && deviceCoveragePct < 0.98 && deviceCoveredRows > 0) {
        allCsvWarnings.push(
          `[Impression device] Only ${Math.round(deviceCoveragePct * 100)}% of rows in this export carried a device breakdown — the remaining rows are excluded from device-level metrics but still count toward placement/platform/spend totals.`,
        );
      }

      // ── Window-level signal buckets (whole selected window, no daily
      // grain): these feed the importer-shaped signal tables the Analysis
      // UI (Audience / Placements) and the strategy evidence pack read.
      // Without them a manual account's analysis would populate totals but
      // leave those surfaces permanently empty (see demographic_signal /
      // placement_signal writes below).
      const demoWindowBuckets = new Map<string, AggBucket & { gender: string; age: string; windowResultType: string }>();
      for (const row of scopedDemo) {
        const gender = row.breakdowns["Gender"]!;
        const age = row.breakdowns["Age"]!;
        const windowResultType = rowResultType(row);
        const key = [gender, age, windowResultType].join("\u0001");
        if (!demoWindowBuckets.has(key)) demoWindowBuckets.set(key, { ...emptyBucket(), gender, age, windowResultType });
        accumulate(demoWindowBuckets.get(key)!, row);
      }
      const placementWindowBuckets = new Map<string, AggBucket & { placement: string; platform: string; windowResultType: string }>();
      for (const row of scopedPlacement) {
        const placement = row.breakdowns["Placement"]!;
        const platform = row.breakdowns["Platform"]!;
        const windowResultType = rowResultType(row);
        const key = [placement, platform, windowResultType].join("\u0001");
        if (!placementWindowBuckets.has(key)) {
          placementWindowBuckets.set(key, { ...emptyBucket(), placement, platform, windowResultType });
        }
        accumulate(placementWindowBuckets.get(key)!, row);
      }

      // Full refresh of this manual account's output rows within the
      // selected window — safe because manual accounts are never written
      // to by the offline importer.
      //
      // Idempotent-rebuild contract (see replit.md "Architecture decisions"):
      // each date-scoped rollup table is cleared for [dateStart, dateEnd]
      // immediately BEFORE its own insert (not all tables up front), so a
      // failure part-way through leaves not-yet-reached tables' previous
      // rows intact, and every insert batch is validated (see
      // buildAdPerformanceRows) before the first destructive delete runs.
      // Replaced-row counts are collected and surfaced as a run warning so a
      // re-run that supersedes earlier rows says so instead of silently
      // overwriting.
      await updateProgress(runId, 62, "Clearing previous data window");
      const replacedByTable = new Map<string, number>();
      const clearWindow = async (table: string): Promise<void> => {
        const del = await supabase
          .from(table)
          .delete({ count: "exact" })
          .eq("account_id", accountId)
          .gte("date_start", dateStart)
          .lte("date_end", dateEnd);
        if (del.error) throw new Error(del.error.message);
        if ((del.count ?? 0) > 0) replacedByTable.set(table, del.count!);
      };

      // One statement per batch, and a batch that loses its connection is
      // recovered rather than failing the run (chunkedInsert.ts: on
      // 2026-09-04 PostgREST killed the 140th of 178 breakdown batches and
      // thirteen minutes of a correct run were thrown away). The evidence
      // tables carry wide rows, so they go in smaller batches.
      const CHUNK = 500;
      const WIDE_TABLES = new Set(["ad_breakdown_performance", "reconciliation_ledger", "variable_segment_performance", "variable_evidence"]);
      // The signal tables carry no run id; every row is unique per account
      // instead, which is what their recovery relies on.
      const UNSCOPED_TABLES = new Set(["demographic_signal", "placement_signal"]);
      const chunkedInsertClient: ChunkedInsertClient = {
        insert: async (table, batch) => {
          const ins = await supabase.from(table).insert(batch as Record<string, any>[]);
          // The HTTP status rides along: a 5xx or a status of 0 (no answer at
          // all) is a transport failure whatever the body says, e.g. an HTML
          // 522 page from the edge, which carries no SQLSTATE.
          return { error: ins.error ? { message: ins.error.message, code: ins.error.code ?? null, status: ins.status ?? null } : null };
        },
        countForRun: async (table, run) => {
          // The account leads every output table's index; a count on the run
          // id alone scans the whole table (the largest holds ~89k rows per
          // run) at the moment the server is already slow.
          const res = await supabase
            .from(table)
            .select("*", { count: "exact", head: true })
            .eq("account_id", accountId)
            .eq("manual_analysis_run_id", run);
          if (res.error) throw new Error(res.error.message);
          return res.count ?? 0;
        },
      };
      const insertChunked = async (table: string, rows: Record<string, any>[]) => {
        const result = await insertChunkedWithRecovery(chunkedInsertClient, table, rows, {
          runId,
          chunk: WIDE_TABLES.has(table) ? 250 : 500,
          runScoped: !UNSCOPED_TABLES.has(table),
          log: (message, meta) => logger.warn({ accountId, runId, ...meta }, message),
        });
        if (result.retried > 0 || result.recovered > 0) {
          logger.warn({ accountId, runId, table, ...result }, "Chunked insert recovered from a lost connection");
        }
      };

      await updateProgress(runId, 68, "Writing ad performance rows");
      // Build (and validate) the batch BEFORE deleting anything, so a
      // consistency failure aborts with the previous run's rows untouched.
      const adRows = buildAdPerformanceRows(accountId, runId, adBuckets, adCreativeMetadata);
      await clearWindow("ad_performance");
      await insertChunked("ad_performance", adRows);

      await updateProgress(runId, 78, "Writing concept performance");
      // ── Concept-level aggregates (concept_performance) ──────────────────
      // Derive concept code from ad_name: "C2E_STC_QF_BOOK2_T1" → "C2".
      // Also extract the book label ("BOOK2") for grouping.
      // Full-replace all concept_performance for this account so the grid
      // always reflects the latest analysis run.
      const extractConcept = (adName: string): string | null => {
        const m = adName.match(/^([A-Za-z]\d+)(?=[A-Za-z_])/);
        return m ? m[1]!.toUpperCase() : null;
      };
      const extractBook = (adName: string): string | null => {
        const m = adName.match(/BOOK\d+/i);
        return m ? m[0]!.toUpperCase() : null;
      };
      // spendWithCopy: the share of the concept's spend that ran on ads
      // whose creative components (headline, primary text, description,
      // CTA) the export carried. It feeds evidence_grade and
      // confidence_score below — the "presence of granular breakdown data"
      // the confidence adjustment reads. Copy known for 0% of spend is
      // recorded as 0, never as a fabricated full coverage.
      // Concept- and variable-level aggregates are built by pure, tested
      // builders at RESULT-EVENT grain: one row per (concept, event) and per
      // (token, event), a same-event baseline for every lift, awareness rows
      // judged on click-through rather than cost per result (owner direction
      // 2026-09-03). The library lookup is the only I/O and stays here.
      const libraryConceptsSet = new Set<string>();
      try {
        const libResp = await supabase
          .from("library_cells")
          .select("cell_id, concept_id")
          .eq("account_id", accountId);
        if (!libResp.error && libResp.data) {
          for (const row of libResp.data) {
            // cell_id like "C2E" → concept "C2"; concept_id like "C2" is used directly
            const fromCell = extractConcept(String(row.cell_id ?? ""));
            if (fromCell) libraryConceptsSet.add(fromCell);
            const fromConceptId = String(row.concept_id ?? "").trim().toUpperCase();
            if (fromConceptId) libraryConceptsSet.add(fromConceptId);
          }
        }
      } catch (_) {
        // non-fatal: mapped_in_library will be false for all concepts
      }
      const conceptRows = buildConceptPerformanceRows(adRows, {
        accountId,
        runId,
        dateStart,
        dateEnd,
        libraryConcepts: libraryConceptsSet,
        extractConcept,
        extractBook,
        hasCopyForAd: (row) =>
          hasCopy(
            creativeInputFromMetadata(
              String(row.ad_name ?? ""),
              typeof row.meta_ad_id === "string" ? row.meta_ad_id : null,
              row.ad_creative_metadata as Parameters<typeof creativeInputFromMetadata>[2],
            ),
          ),
      });
      // No delete here: concept_performance is run-tagged (manual_analysis_run_id)
      // and retains full history across runs — deleting-then-inserting the whole
      // account on every run used to destroy every prior run's rollup. A failed
      // run's rows are cleaned up by deleteRunOutputs, not here.
      if (conceptRows.length > 0) await insertChunked("concept_performance", conceptRows);

      // ── Stage 2: Variable-level performance ─────────────────────────────
      await updateProgress(runId, 82, "Computing variable performance");
      const varRows = buildVariablePerformanceRows(adRows, { accountId, runId, dateStart, dateEnd });
      if (varRows.length > 0) await insertChunked("variable_performance", varRows);

      await updateProgress(runId, 84, "Linking creative assets");
      // Upsert each unique ad_name into the ads registry so that
      // syncCreativeAssetLinks can later UPDATE creative_asset_url on them.
      // ignoreDuplicates preserves any existing meta_ad_id / creative_asset_url.
      // Also derive cell / concept / book from the ad_name so the seed's ads
      // registry can link performance rows to library cells without a separate
      // copy_performance import.
      const extractCell = (adName: string): string | null => {
        const m = adName.match(/^([A-Z]\d+[A-Z]+)(?=[_\s]|$)/);
        return m ? m[1]! : null;
      };
      const uniqueAdNames = Array.from(new Set(adRows.map((r) => r.ad_name)));
      if (uniqueAdNames.length > 0) {
        const adRegistryRows = uniqueAdNames.map((adName) => {
          const source = adRows.find((row) => row.ad_name === adName)!;
          return {
            account_id: accountId,
            ad_name: adName,
            cell: extractCell(adName),
            concept: extractConcept(adName),
            book: extractBook(adName),
            meta_ad_id: source.meta_ad_id,
            image_name: source.image_name,
            video_name: source.video_name,
          };
        });
        // The row intentionally omits creative_asset_url / asset_filename, so
        // updating newly observed external IDs and asset names cannot wipe a
        // previously linked creative.
        const adsUpsert = await supabase
          .from("ads")
          .upsert(adRegistryRows, { onConflict: "account_id,ad_name", ignoreDuplicates: false });
        if (adsUpsert.error) throw new Error(adsUpsert.error.message);

        const adInstanceRows = [
          ...new Map(
            adRows
              .filter((row) => Boolean(row.meta_ad_id))
              .map((row) => [String(row.meta_ad_id), row]),
          ).values(),
        ].map((row) => ({
            account_id: accountId,
            meta_ad_id: row.meta_ad_id,
            ad_name: row.ad_name,
            image_name: row.image_name,
            video_name: row.video_name,
            last_seen_at: new Date().toISOString(),
        }));
        if (adInstanceRows.length > 0) {
          const instancesUpsert = await supabase
            .from("ad_instances")
            .upsert(adInstanceRows, { onConflict: "account_id,meta_ad_id", ignoreDuplicates: false });
          if (instancesUpsert.error) throw new Error(instancesUpsert.error.message);
        }

        // Re-sync creative asset links — creatives uploaded BEFORE analysis
        // had no ads rows to link against at upload time. Now that the ads
        // rows exist we back-fill them. Non-fatal: a sync failure must not
        // roll back a successful analysis.
        try {
          await syncAllCreativeLinksForAccount(accountId);
        } catch (syncErr) {
          logger.warn({ accountId, err: syncErr }, "post-analysis creative sync failed (non-fatal)");
        }
      }

      // ── Reconciliation-first evidence layer ───────────────────────────
      // docs/specs/iap-multi-report-reconciliation.md. Every staged report is
      // reduced to ad × segment × period observations, the strongest
      // compatible control becomes truth per ad / per account, and the ledger
      // records a signed residual per additive metric. Ad identity is Account
      // ID + Ad ID; a name-keyed row joins Ad-ID data only through a
      // registry-proven unique name. Residuals never become rows.
      await updateProgress(runId, 86, "Reconciling reports against the control source");
      const { data: instanceRows, error: instancesErr } = await supabase
        .from("ad_instances")
        .select("meta_ad_id, ad_name")
        .eq("account_id", accountId);
      if (instancesErr) throw new Error(instancesErr.message);
      const instancesByName = new Map<string, string[]>();
      for (const r of instanceRows ?? []) {
        const name = String(r["ad_name"] ?? "");
        const id = String(r["meta_ad_id"] ?? "");
        if (!name || !id) continue;
        const list = instancesByName.get(name) ?? [];
        if (!list.includes(id)) list.push(id);
        instancesByName.set(name, list);
      }
      // The per-file rows after exact-duplicate removal, scoped to the
      // window. Not the class arrays: the ledger resolves overlaps per
      // BREAKDOWN (a joint Gender × Age × Text file loses its demographic
      // margin to a plain Gender × Age file and keeps its asset margins),
      // where the class arrays resolve per file.
      const reconReports: ReportInput[] = [...parsedFiles]
        .sort((a, b) => a.order - b.order)
        .filter((f) => f.cls !== "conversion_device")
        .map((f) => ({
          import_id: f.importId,
          grain: f.grain,
          rows: f.rows.filter((row) => withinRange(row.breakdowns["Day"]!, dateRange, maxDate)),
          totals_row: f.totalsRow,
        }))
        .filter((r) => r.rows.length > 0);
      // Three synchronous builds. Each progress write between them turns the
      // event loop (the heartbeat interval gets to fire) and attests liveness
      // itself, so a long build is never mistaken for a dead process.
      const observed = buildObservations(reconReports, { instancesByName });
      await updateProgress(runId, 87, "Reconciling: the control per ad");
      const truth = buildTruth(reconReports, { instancesByName, window: { start: dateStart, end: dateEnd } });
      await updateProgress(runId, 87, "Reconciling: the ledger");
      const ledger = buildLedger({ observations: observed.observations, truth, reports: reconReports, instancesByName });
      allCsvWarnings.push(...observed.warnings, ...ledger.summary.notes);
      logger.info(
        {
          accountId,
          runId,
          truthSource: truth.source,
          truthPrecedence: truth.precedence,
          truthConflicts: truth.conflicts.length,
          truthIdentity: truth.identity_kind,
          breakdowns: ledger.summary.breakdowns.map((b) => ({
            report_class: b.report_class,
            spend: b.by_metric.find((m) => m.metric === "amount_spent") ?? null,
            ads: { total: b.ads_total, reconciled: b.ads_reconciled, partial: b.ads_partial, unreconciled: b.ads_unreconciled, missing: b.ads_missing_from_breakdown },
          })),
        },
        "Reconciliation ledger built",
      );

      const configuredAssets = extractConfiguredAssets(reconReports, instancesByName);
      const deliveredAssets = extractDeliveredAssets(reconReports, instancesByName);

      // Deconstructed variables reach ads through their mapped names.
      const { data: deconstructionRows, error: deconstructionErr } = await supabase
        .from("creative_deconstructions")
        .select("id, manual_import_id, filename, ad_names, status, variables")
        .eq("account_id", accountId);
      if (deconstructionErr) throw new Error(deconstructionErr.message);
      const deconstructions: DeconstructionInput[] = (deconstructionRows ?? []).map((r) => ({
        id: String(r["id"]),
        manual_import_id: String(r["manual_import_id"]),
        filename: String(r["filename"] ?? ""),
        status: String(r["status"] ?? ""),
        ad_names: Array.isArray(r["ad_names"]) ? (r["ad_names"] as unknown[]).map(String) : [],
        variables: Array.isArray(r["variables"])
          ? (r["variables"] as { family?: unknown; code?: unknown; confidence?: unknown }[])
              .filter((v) => typeof v.family === "string" && typeof v.code === "string")
              .map((v) => ({ family: String(v.family), code: String(v.code), confidence: typeof v.confidence === "number" ? v.confidence : null }))
          : [],
      }));

      // Ad-level totals per identity (from this run's own ad rows) with the
      // demographic breakdown's per-ad spend coverage, plus ad-name tokens.
      const demoCoverageByAd = new Map<string, number | null>();
      for (const row of ledger.rows) {
        if (row.scope === "ad" && row.report_class === "demographic" && row.metric === "amount_spent") {
          demoCoverageByAd.set(`${row.ad_identity_kind}:${row.ad_identity}`, row.coverage_pct);
        }
      }
      const adTotals = new Map<string, AdTotals>();
      const adNameTokens: { identity: AdIdentity; tokens: { family: string; id: string }[] }[] = [];
      for (const row of adRows) {
        const identity: AdIdentity = row.meta_ad_id
          ? { kind: "ad_id", key: String(row.meta_ad_id), ad_name: row.ad_name, meta_ad_id: String(row.meta_ad_id) }
          : { kind: "ad_name", key: row.ad_name, ad_name: row.ad_name, meta_ad_id: null };
        const k = identityKey(identity);
        const cur = adTotals.get(k) ?? {
          identity,
          metrics: {},
          result_type: String(row.result_type ?? ""),
          coverage_pct: demoCoverageByAd.get(k) ?? null,
        };
        const add = (slug: string, v: unknown): void => {
          if (typeof v === "number" && Number.isFinite(v)) cur.metrics[slug] = (cur.metrics[slug] ?? 0) + v;
        };
        add("amount_spent", row.spend);
        add("impressions", row.impressions);
        add("clicks_all", row.clicks_all);
        add("link_clicks", row.link_clicks);
        add("results", row.results);
        for (const [slug, v] of Object.entries(row.extra_metrics ?? {})) add(slug, v);
        if (!adTotals.has(k)) {
          adTotals.set(k, cur);
          const tokens = String(row.ad_name ?? "")
            .split("_")
            .map((t) => t.trim().toUpperCase())
            .filter((t) => t.length > 0 && !isSkippedAdToken(t))
            .map((t) => ({ family: "raw_token", id: t }));
          if (tokens.length > 0) adNameTokens.push({ identity, tokens });
        }
      }
      const evidence = buildVariableEvidence({ deconstructions, instancesByName, adNameTokens, deliveredAssets });
      const variableSegments = buildVariableSegmentPerformance({ evidence, observations: ledger.observations, adTotals });

      await updateProgress(runId, 88, "Writing reconciliation ledger and evidence");
      const breakdownRows = ledger.observations.map((o: Observation) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        breakdown: o.breakdown,
        ad_identity_kind: o.identity.kind,
        ad_identity: o.identity.key,
        meta_ad_id: o.identity.meta_ad_id,
        ad_name: o.identity.ad_name || null,
        attribution: o.attribution,
        segment: o.segment,
        segment_key: o.segment_key,
        result_type: o.result_type,
        date_start: dateStart,
        date_end: dateEnd,
        spend: o.metrics["amount_spent"] ?? null,
        impressions: o.metrics["impressions"] ?? null,
        reach: o.reach,
        reach_basis: o.reach_basis,
        clicks_all: o.metrics["clicks_all"] ?? null,
        link_clicks: o.metrics["link_clicks"] ?? null,
        results: o.metrics["results"] ?? null,
        metrics: o.metrics,
        row_count: o.row_count,
        source_import_ids: o.source_import_ids,
        evidence_state: o.evidence_state,
        coverage_pct: o.coverage_pct,
      }));
      await insertChunked("ad_breakdown_performance", breakdownRows);
      const ledgerRows = ledger.rows.map((r: LedgerRow) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        scope: r.scope,
        ad_identity_kind: r.ad_identity_kind,
        ad_identity: r.ad_identity,
        ad_name: r.ad_name,
        meta_ad_id: r.meta_ad_id,
        report_class: r.report_class,
        metric: r.metric,
        grain: r.grain,
        truth_source: r.truth_source,
        truth_value: r.truth_value,
        observed_value: r.observed_value,
        coverage_pct: r.coverage_pct,
        residual: r.residual,
        overcoverage: r.overcoverage,
        direct_share: r.direct_share,
        modelled_share: r.modelled_share,
        evidence_state: r.evidence_state,
        compatibility_failures: r.compatibility_failures,
        truth_import_ids: r.truth_import_ids,
        observed_import_ids: r.observed_import_ids,
      }));
      await insertChunked("reconciliation_ledger", ledgerRows);
      const assetRowsOut = [...configuredAssets, ...deliveredAssets].map((a) => ({
        account_id: accountId,
        ad_identity_kind: a.ad_identity_kind,
        ad_identity: a.ad_identity,
        meta_ad_id: a.meta_ad_id,
        ad_name: a.ad_name,
        asset_type: a.asset_type,
        raw_value: a.raw_value,
        normalized_value: a.normalized_value,
        content_hash: a.content_hash,
        provenance: a.provenance,
        source_column: a.source_column,
        source_import_id: a.source_import_id,
        date_start: a.date_start,
        date_end: a.date_end,
        last_seen_run_id: runId,
        last_seen_at: new Date().toISOString(),
      }));
      for (let i = 0; i < assetRowsOut.length; i += CHUNK) {
        const slice = assetRowsOut.slice(i, i + CHUNK);
        // An upsert is idempotent, so a transport failure is simply sent
        // again (the batch-insert recovery is not needed here); a database
        // error is an answer and stops the run.
        for (let attempt = 1; ; attempt++) {
          let failure: unknown = null;
          try {
            const up = await supabase
              .from("creative_assets")
              .upsert(slice, { onConflict: "account_id,ad_identity_kind,ad_identity,asset_type,provenance,content_hash", ignoreDuplicates: false });
            if (!up.error) break;
            const err = { message: up.error.message, code: up.error.code ?? null, status: up.status ?? null };
            if (!isRetryableInsertFailure(err)) throw new Error(up.error.message);
            failure = err;
          } catch (err) {
            if (failure === null) {
              if (!isRetryableInsertFailure(err)) throw err;
              failure = err;
            }
          }
          const message = failure instanceof Error ? failure.message : String((failure as { message?: unknown })?.message ?? failure);
          if (attempt >= 4) throw new Error(`Upsert into creative_assets failed after ${attempt} attempt(s): ${message}`);
          logger.warn({ accountId, runId, attempt, message }, "creative_assets upsert: retrying after a transport failure");
          await new Promise((resolve) => setTimeout(resolve, defaultBackoffMs(attempt)));
        }
      }
      await insertChunked(
        "variable_evidence",
        evidence.map((e) => ({
          account_id: accountId,
          manual_analysis_run_id: runId,
          variable_family: e.variable_family,
          variable_id: e.variable_id,
          source_kind: e.source_kind,
          source_ref: e.source_ref,
          asset_key: e.asset_key,
          ad_identity_kind: e.ad_identity_kind,
          ad_identity: e.ad_identity,
          meta_ad_id: e.meta_ad_id,
          ad_name: e.ad_name,
          relationship: e.relationship,
          confidence: e.confidence,
        })),
      );
      await insertChunked(
        "variable_segment_performance",
        variableSegments.map((v) => ({
          account_id: accountId,
          manual_analysis_run_id: runId,
          variable_family: v.variable_family,
          variable_id: v.variable_id,
          breakdown: v.breakdown,
          segment: v.segment,
          segment_key: v.segment_key,
          result_type: v.result_type,
          contributing_ad_ids: v.contributing_ad_ids,
          contributing_asset_keys: v.contributing_asset_keys,
          direct_totals: v.direct_totals,
          contextual_totals: v.contextual_totals,
          observed_coverage_pct: v.observed_coverage_pct,
          modelled_share: v.modelled_share,
          result_volume: v.result_volume,
          cost_per_result: v.cost_per_result,
          raw_rate: v.raw_rate,
          adjusted_rate: v.adjusted_rate,
          interaction_index: v.interaction_index,
          contributing_ads: v.contributing_ads,
          evidence_state: v.evidence_state,
          confidence: v.confidence,
        })),
      );
      const reconciliationSummary: ReconciliationSummary = ledger.summary;

      await updateProgress(runId, 90, "Writing demographic & placement data");
      const demographicRows = Array.from(demoBuckets.values()).map((b) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        gender: b.gender,
        age: b.age,
        result_type: b.resultType,
        intent_class: intentClassOf(b.resultType),
        date_start: b.date,
        date_end: b.dateEnd,
        spend: b.spend,
        // Persisted, not just consumed. derivedRates below has always read
        // b.impressions to compute this row's cpa/cvr — the value was here
        // all along and simply never written, so demographic CTR and CPM
        // were computable from data the engine threw away.
        impressions: b.impressions,
        link_clicks: b.linkClicks,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        cvr_link_pct: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cvr_link_pct,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        adds_to_cart_value: b.addsToCartValue,
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await clearWindow("demographic_performance");
      await insertChunked("demographic_performance", demographicRows);

      const trackingBasis = (b: { addsToCart: number | null; checkoutsInitiated: number | null; purchases: number | null; spend: number | null; impressions: number | null }) =>
        b.spend === null && b.impressions === null && (b.addsToCart !== null || b.checkoutsInitiated !== null || b.purchases !== null)
          ? "conversion"
          : "delivery";

      const placementRowsOut = Array.from(placementBuckets.values()).map((b) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        placement: b.placement,
        result_type: b.resultType,
        intent_class: intentClassOf(b.resultType),
        date_start: b.date,
        date_end: b.dateEnd,
        spend: b.spend,
        impressions: b.impressions,
        link_clicks: b.linkClicks,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        cvr_link_pct: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cvr_link_pct,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        tracking_basis: trackingBasis(b),
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await clearWindow("placement_performance");
      await insertChunked("placement_performance", placementRowsOut);

      const platformRowsOut = Array.from(platformBuckets.values()).map((b) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        platform: b.platform,
        result_type: b.resultType,
        intent_class: intentClassOf(b.resultType),
        date_start: b.date,
        date_end: b.dateEnd,
        spend: b.spend,
        impressions: b.impressions,
        link_clicks: b.linkClicks,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        tracking_basis: trackingBasis(b),
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));
      await clearWindow("platform_performance");
      await insertChunked("platform_performance", platformRowsOut);

      const deviceRowsOut = Array.from(deviceBuckets.values()).map((b) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        device: b.device,
        result_type: b.resultType,
        intent_class: intentClassOf(b.resultType),
        date_start: b.date,
        date_end: b.dateEnd,
        spend: b.spend,
        impressions: b.impressions,
        results: b.results,
        cpa: derivedRates(b.spend, b.impressions, b.linkClicks, b.results).cpa,
        link_clicks: b.linkClicks,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        tracking_basis: trackingBasis(b),
        device_kind: "impression",
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));

      // ── Conversion-device rows: aggregate by device per day ───────────────
      // These rows have no spend/impressions — they carry only conversion counts.
      // Stored with tracking_basis='conversion' and device_kind='conversion' so
      // they are distinguishable from impression-device rows.
      const convDeviceBuckets = new Map<string, AggBucket & { device: string; date: string; dateEnd: string; resultType: string }>();
      for (const row of scopedConversionDevice) {
        const { date, dateEnd: bucketEnd } = stampOf(row);
        const device = row.breakdowns["Conversion device"]!;
        const resultType = rowResultType(row);
        const dKey = [device, date, bucketEnd, resultType].join("\u0001");
        if (!convDeviceBuckets.has(dKey)) convDeviceBuckets.set(dKey, { ...emptyBucket(), device, date, dateEnd: bucketEnd, resultType });
        accumulate(convDeviceBuckets.get(dKey)!, row);
      }
      const convDeviceRowsOut = Array.from(convDeviceBuckets.values()).map((b) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        device: b.device,
        result_type: b.resultType,
        intent_class: intentClassOf(b.resultType),
        date_start: b.date,
        date_end: b.dateEnd,
        spend: null,
        impressions: null,
        results: b.results,
        cpa: null,
        link_clicks: b.linkClicks,
        adds_to_cart: b.addsToCart,
        checkouts_initiated: b.checkoutsInitiated,
        purchases: b.purchases,
        tracking_basis: "conversion",
        device_kind: "conversion",
        extra_metrics: Object.keys(b.extra).length > 0 ? b.extra : null,
      }));

      await clearWindow("device_performance");
      await insertChunked("device_performance", [...deviceRowsOut, ...convDeviceRowsOut]);

      // Surface superseded rows honestly: a re-run over an already-analyzed
      // window replaces those rows by design (idempotent rebuild), and the
      // user is told how many, rather than the replacement happening
      // silently.
      if (replacedByTable.size > 0) {
        const totalReplaced = [...replacedByTable.values()].reduce((s, n) => s + n, 0);
        const detail = [...replacedByTable.entries()].map(([t, n]) => `${t}: ${n}`).join(", ");
        allCsvWarnings.push(
          `[Re-run] Replaced ${totalReplaced} previously ingested row(s) from an earlier analysis run in the ` +
            `${dateStart} – ${dateEnd} window (${detail}). The newly staged files fully supersede the earlier data for this window.`,
        );
      }

      // ── Signal tables (what the Analysis UI + strategy evidence read) ──
      // Full per-account refresh: the source guard above ensures this
      // account's signal rows are owned exclusively by manual analysis, and
      // a full replace keeps row_index unique-constraint collisions with a
      // previous run impossible (demographic_signal/placement_signal are
      // ACCOUNT-grain window buckets, not date-scoped like the *_performance
      // tables above). Payload shapes mirror the offline importer
      // (DemographicRow / PlacementRow in seedTypes.ts) so every existing
      // render path and the strategy evidence pack work unchanged.
      await updateProgress(runId, 92, "Writing audience/placement signal");
      const pctOr = (numerator: number | null, denominator: number | null): number | null =>
        numerator !== null && denominator !== null && denominator > 0
          ? (numerator / denominator) * 100
          : null;
      const cpaOr = (spend: number | null, results: number | null): number | null =>
        spend !== null && results !== null && results > 0 ? spend / results : null;

      const delDemoSignal = await supabase.from("demographic_signal").delete().eq("account_id", accountId);
      if (delDemoSignal.error) throw new Error(delDemoSignal.error.message);
      const delPlacementSignal = await supabase
        .from("placement_signal")
        .delete()
        .eq("account_id", accountId)
        .eq("signal_scope", "v3");
      if (delPlacementSignal.error) throw new Error(delPlacementSignal.error.message);

      const MANUAL_DEMO_AD_NAME = "All ads (manual demographic upload)";
      const demoSignalRows = Array.from(demoWindowBuckets.values())
        .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
        .map((b, i) => ({
          account_id: accountId,
          cell_id: "ACCOUNT",
          ad_name: MANUAL_DEMO_AD_NAME,
          age: b.age,
          gender: b.gender,
          result_type: b.windowResultType,
          date_start: dateStart,
          date_end: dateEnd,
          row_index: i,
          payload: {
            cell_id: "ACCOUNT",
            "Ad name": MANUAL_DEMO_AD_NAME,
            Age: b.age,
            Gender: b.gender,
            "Result type": b.windowResultType,
            "Amount spent (USD)": b.spend,
            Reach: b.reach,
            Impressions: b.impressions,
            Results: b.results,
            "Clicks (all)": b.clicksAll,
            "Link clicks": b.linkClicks,
            CPA_result: cpaOr(b.spend, b.results),
            CTR_link_pct: pctOr(b.linkClicks, b.impressions),
            Result_per_link_click_pct: pctOr(b.results, b.linkClicks),
          },
        }));
      await insertChunked("demographic_signal", demoSignalRows);

      const placementSignalRows = Array.from(placementWindowBuckets.values())
        .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
        .map((b, i) => ({
          account_id: accountId,
          signal_scope: "v3",
          placement: b.placement,
          platform: b.platform,
          result_type: b.windowResultType,
          date_start: dateStart,
          date_end: dateEnd,
          row_index: i,
          payload: {
            Placement: b.placement,
            Platform: b.platform,
            "Result type": b.windowResultType,
            "Amount spent (USD)": b.spend,
            Impressions: b.impressions,
            "Link clicks": b.linkClicks,
            Results: b.results,
            CPA: cpaOr(b.spend, b.results),
            CTR_link_pct: pctOr(b.linkClicks, b.impressions),
          },
        }));
      await insertChunked("placement_signal", placementSignalRows);

      // Register the loop stage so the account's IAP loop status reflects
      // that its Analysis Core equivalent has really run.
      const loopUpsert = await supabase.from("iap_runs").upsert(
        {
          account_id: accountId,
          stage: "analysis_core",
          status: "complete",
          window_start: dateStart,
          window_end: dateEnd,
          generated_at: new Date().toISOString(),
          note: `Manual analysis run ${runId}.`,
        },
        { onConflict: "account_id,stage" },
      );
      if (loopUpsert.error) throw new Error(loopUpsert.error.message);

      const totalRows = adRows.length + demographicRows.length + placementRowsOut.length + platformRowsOut.length + deviceRowsOut.length + convDeviceRowsOut.length;

      await updateProgress(runId, 97, "Finalizing");
      await supabase
        .from("ad_accounts")
        .update({
          status: "configured",
          // The objective is derived per run, so it is written by the run
          // rather than configured. `cohort` is the legacy scalar column,
          // kept in step with the set's first member for pre-migration
          // readers. An undetermined result writes [] / null honestly.
          objectives: derivedObjectives,
          cohort: derivedObjectives[0] ?? null,
          overview_state: {
            title: "Analysis complete",
            description: `Manual analysis processed ${totalRows} row(s) from ${imports!.length} file(s), covering ${dateStart} to ${dateEnd} (${dateRange === "all" ? "all uploaded dates" : dateRange} window). Re-run analysis after uploading new reports.`,
          },
        })
        .eq("id", accountId);

      // ── Objective coverage (data-aware, never blocking) ────────────
      // Configured objectives whose column groups are present get assessed
      // as before; configured-but-absent ones are skipped with a flag;
      // present-but-unconfigured groups produce an enable-suggestion flag
      // (never auto-enabled — their columns were already dropped from
      // ingestion above). Unmatched optional columns stay ignored.
      const coverage = computeObjectiveCoverage(derivedObjectives, objectiveGroupsPresent);

      await finishRun(runId, "success", {
        dateStart,
        dateEnd,
        rowsIngested: totalRows,
        importsUsed: imports!.length,
        csvWarnings: allCsvWarnings.length > 0 ? allCsvWarnings : undefined,
        objectivesAssessed: coverage.assessed,
        objectiveFlags: coverage.flags.length > 0 ? coverage.flags : undefined,
        coverage: dataCoverage,
        reconciliationSummary,
      });
      try {
        await markImportsProcessed(imports!.map((i) => String(i["id"])), runId);
      } catch (err) {
        // Non-fatal: the run itself succeeded and its data is committed —
        // a failure to destage only means the consumed files linger in the
        // staging area rather than moving to history. Never re-fail a
        // successful run over this.
        logger.error({ err, accountId, runId }, "Failed to destage consumed manual imports");
      }
      invalidateMetrixSeedCache();
      logger.info({ accountId, runId, rows: totalRows, dateStart, dateEnd }, "Manual analysis run succeeded");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, accountId, runId }, "Manual analysis run failed");
      try {
        await deleteRunOutputs(runId);
      } catch (cleanupErr) {
        logger.error({ err: cleanupErr, runId }, "Failed to clean up partial analysis output");
      }
      await finishRun(runId, "error", { errorMessage: message });
      invalidateMetrixSeedCache();
    } finally {
      stopHeartbeat();
    }
  })();

  return runId;
}

// ─── View-level date preset summary ────────────────────────────────────
// Re-aggregates ad_performance, demographic_performance, and
// placement_performance rows for any ViewPreset window, anchored to the
// latest date_start stored for the account (not wall-clock time).
// Returns aggregated totals + demographic + placement + concept breakdowns.

function viewPresetDays(preset: ViewPreset): number | null {
  if (preset === "all") return null;
  if (preset === "7d") return 7;
  if (preset === "14d") return 14;
  if (preset === "28d") return 28;
  return 90; // "90d"
}

function withinViewPreset(date: string, preset: ViewPreset, maxDate: string): boolean {
  if (preset === "all") return true;
  const days = viewPresetDays(preset)!;
  const max = new Date(`${maxDate}T00:00:00Z`).getTime();
  const cutoff = max - (days - 1) * 24 * 60 * 60 * 1000;
  const d = new Date(`${date}T00:00:00Z`).getTime();
  return d >= cutoff && d <= max;
}

function extractConceptCode(adName: string): string | null {
  const m = String(adName).match(/^([A-Za-z]\d+)(?=[A-Za-z_])/);
  return m ? m[1]!.toUpperCase() : null;
}

function extractBookCode(adName: string): string | null {
  const m = String(adName).match(/BOOK\d+/i);
  return m ? m[0]!.toUpperCase() : null;
}

function roundN(v: number, digits = 4): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/** Group ad_performance rows into ascending per-day additive totals. */
function buildDailySeries(rows: any[]): AnalysisSummaryDayRow[] {
  const byDate = new Map<string, AnalysisSummaryDayRow>();
  for (const r of rows) {
    const date = String((r as any).date_start ?? "");
    if (!date) continue;
    const d = byDate.get(date) ?? { date, spend: 0, impressions: 0, link_clicks: 0, results: 0, results_by_event: {} };
    const results = Number((r as any).results ?? 0);
    const event = String((r as any).result_type ?? "unknown");
    d.spend       += Number((r as any).spend ?? 0);
    d.impressions += Number((r as any).impressions ?? 0);
    d.link_clicks += Number((r as any).link_clicks ?? 0);
    d.results     += results;
    d.results_by_event[event] = (d.results_by_event[event] ?? 0) + results;
    byDate.set(date, d);
  }
  return Array.from(byDate.values())
    .map((d) => ({ ...d, spend: roundN(d.spend) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Aggregate ad_performance rows into AnalysisSummaryTotals (no breakdowns). */
function buildTotals(rows: any[]): AnalysisSummaryTotals {
  let totalSpend = 0, totalImpressions = 0, totalLinkClicks = 0;
  const byEvent: Record<string, { spend: number; reach: number; impressions: number; results: number; clicks_all: number; link_clicks: number }> = {};
  for (const r of rows) {
    const spend       = Number((r as any).spend ?? 0);
    const impressions = Number((r as any).impressions ?? 0);
    const linkClicks  = Number((r as any).link_clicks ?? 0);
    const results     = Number((r as any).results ?? 0);
    const reach       = Number((r as any).reach ?? 0);
    const clicksAll   = Number((r as any).clicks_all ?? 0);
    const event       = String((r as any).result_type ?? "unknown");
    totalSpend       += spend;
    totalImpressions += impressions;
    totalLinkClicks  += linkClicks;
    byEvent[event] ??= { spend: 0, reach: 0, impressions: 0, results: 0, clicks_all: 0, link_clicks: 0 };
    byEvent[event]!.spend       += spend;
    byEvent[event]!.reach       += reach;
    byEvent[event]!.impressions += impressions;
    byEvent[event]!.results     += results;
    byEvent[event]!.clicks_all  += clicksAll;
    byEvent[event]!.link_clicks += linkClicks;
  }
  return {
    total_spend_usd:      roundN(totalSpend),
    total_impressions:    Math.round(totalImpressions),
    total_link_clicks:    Math.round(totalLinkClicks),
    overall_link_ctr_pct: totalImpressions > 0 ? roundN((totalLinkClicks / totalImpressions) * 100) : 0,
    bottom_line_totals:   byEvent,
  };
}

/** Shift a YYYY-MM-DD date by whole days (UTC-safe). */
function shiftDate(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`).getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The equal-length window immediately preceding [start, end]. */
export function priorWindowFor(start: string, end: string): AnalysisSummaryWindow {
  const lenDays = Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return { start: shiftDate(start, -lenDays), end: shiftDate(start, -1) };
}

/**
 * Coverage measured by the account's latest successful manual analysis run
 * (null for importer/live-Meta accounts and legacy pre-coverage runs).
 * Served with every analysis summary so aggregating surfaces share one
 * definition of "trustworthy enough to classify".
 */
async function fetchLatestRunCoverage(accountId: string): Promise<AnalysisDataCoverage | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_analysis_runs")
    .select("coverage")
    .eq("account_id", accountId)
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const cov = (data as Record<string, unknown>)["coverage"];
  return cov && typeof cov === "object" ? (cov as AnalysisDataCoverage) : null;
}

export async function getAnalysisSummaryByPreset(
  accountId: string,
  preset: ViewPreset,
): Promise<AnalysisSummaryResult> {
  const supabase = getSupabase();

  // ── Fetch ad_performance rows ─────────────────────────────────────
  const adRows = await selectAllRows(
    "ad_performance",
    (q) => q.eq("account_id", accountId),
    "date_start, spend, impressions, link_clicks, results, result_type, reach, clicks_all, ad_name",
  );

  if (!adRows || adRows.length === 0) {
    return {
      preset,
      available_window: null,
      active_window: null,
      totals: { total_spend_usd: 0, total_impressions: 0, total_link_clicks: 0, overall_link_ctr_pct: 0, bottom_line_totals: {} },
      daily: [],
      prior_totals: null,
      prior_window: null,
      demographic_rows: [],
      placement_rows: [],
      concept_rows: [],
      data_coverage: await fetchLatestRunCoverage(accountId),
    };
  }

  // Determine the available window (full extent of stored rows).
  const allDates = adRows.map((r: any) => String(r.date_start ?? "")).filter(Boolean);
  const maxDate = allDates.reduce((a, b) => (a > b ? a : b), allDates[0]!);
  const minDate = allDates.reduce((a, b) => (a < b ? a : b), allDates[0]!);
  const available_window: AnalysisSummaryWindow = { start: minDate, end: maxDate };

  // Anchor preset windows to today (wall-clock), not maxDate.
  // "Last 7 days" means the last 7 calendar days from now — if the account's
  // most recent data is older than 7 days, the 7d view correctly shows $0.
  const todayStr = new Date().toISOString().slice(0, 10);
  const anchor = preset === "all" ? maxDate : todayStr;

  // Filter rows to the preset window.
  const filtered = adRows.filter((r: any) => withinViewPreset(String(r.date_start ?? ""), preset, anchor));

  const filteredDates = filtered.map((r: any) => String(r.date_start ?? "")).filter(Boolean);
  const activeStart = filteredDates.length > 0
    ? filteredDates.reduce((a, b) => (a < b ? a : b))
    : null;
  const activeEnd = filteredDates.length > 0
    ? filteredDates.reduce((a, b) => (a > b ? a : b))
    : null;
  const active_window: AnalysisSummaryWindow | null = activeStart && activeEnd
    ? { start: activeStart, end: activeEnd }
    : null;

  // Aggregate totals.
  let totalSpend = 0, totalImpressions = 0, totalLinkClicks = 0;
  const byEvent: Record<string, { spend: number; reach: number; impressions: number; results: number; clicks_all: number; link_clicks: number }> = {};

  for (const r of filtered) {
    const spend       = Number((r as any).spend ?? 0);
    const impressions = Number((r as any).impressions ?? 0);
    const linkClicks  = Number((r as any).link_clicks ?? 0);
    const results     = Number((r as any).results ?? 0);
    const reach       = Number((r as any).reach ?? 0);
    const clicksAll   = Number((r as any).clicks_all ?? 0);
    const event       = String((r as any).result_type ?? "unknown");

    totalSpend       += spend;
    totalImpressions += impressions;
    totalLinkClicks  += linkClicks;

    byEvent[event] ??= { spend: 0, reach: 0, impressions: 0, results: 0, clicks_all: 0, link_clicks: 0 };
    byEvent[event]!.spend       += spend;
    byEvent[event]!.reach       += reach;
    byEvent[event]!.impressions += impressions;
    byEvent[event]!.results     += results;
    byEvent[event]!.clicks_all  += clicksAll;
    byEvent[event]!.link_clicks += linkClicks;
  }

  const linkCtrPct = totalImpressions > 0 ? roundN((totalLinkClicks / totalImpressions) * 100) : 0;

  // ── Concept rows (derived from ad_name) ────────────────────────────
  const conceptMap = new Map<string, { book: string | null; spend: number; results: number; link_clicks: number }>();
  for (const r of filtered) {
    const concept = extractConceptCode(String((r as any).ad_name ?? ""));
    if (!concept) continue;
    const book = extractBookCode(String((r as any).ad_name ?? ""));
    const resultType = String((r as any).result_type ?? "unknown");
    const key = `${book ?? ""}\x01${concept}\x01${resultType}`;
    const c = conceptMap.get(key) ?? { book, spend: 0, results: 0, link_clicks: 0 };
    c.spend       += Number((r as any).spend ?? 0);
    c.results     += Number((r as any).results ?? 0);
    c.link_clicks += Number((r as any).link_clicks ?? 0);
    conceptMap.set(key, c);
  }
  const concept_rows: AnalysisSummaryConceptRow[] = Array.from(conceptMap.entries()).map(([key, v]) => ({
    concept: key.split("\x01")[1]!,
    book:    v.book,
    result_type: key.split("\x01")[2] ?? "unknown",
    intent_class: intentClassOf(key.split("\x01")[2] ?? "unknown"),
    spend:   roundN(v.spend),
    results: v.results,
    link_clicks: v.link_clicks,
  }));

  // ── Demographic rows ───────────────────────────────────────────────
  const demoRows = await selectAllRows(
    "demographic_performance",
    (q) => q.eq("account_id", accountId),
    "date_start, age, gender, result_type, spend, impressions, results, link_clicks, adds_to_cart, checkouts_initiated, purchases, adds_to_cart_value",
  );

  const demoMap = new Map<string, { spend: number; impressions: number | null; results: number; link_clicks: number; adds_to_cart: number | null; checkouts_initiated: number | null; purchases: number | null; adds_to_cart_value: number | null }>();
  for (const r of demoRows ?? []) {
    if (!withinViewPreset(String((r as any).date_start ?? ""), preset, anchor)) continue;
    const key = `${String((r as any).age ?? "")}|${String((r as any).gender ?? "").toLowerCase()}|${String((r as any).result_type ?? "unknown")}`;
    const d = demoMap.get(key) ?? { spend: 0, impressions: null, results: 0, link_clicks: 0, adds_to_cart: null, checkouts_initiated: null, purchases: null, adds_to_cart_value: null };
    d.spend       += Number((r as any).spend ?? 0);
    d.results     += Number((r as any).results ?? 0);
    d.link_clicks += Number((r as any).link_clicks ?? 0);
    // sumOptional, not `?? 0`: a row predating the impressions column has
    // no measurement, and folding it as zero would understate the CTR and
    // CPM this exists to make computable.
    d.impressions = sumOptional(d.impressions, num((r as any).impressions));
    d.adds_to_cart = sumOptional(d.adds_to_cart, num((r as any).adds_to_cart));
    d.checkouts_initiated = sumOptional(d.checkouts_initiated, num((r as any).checkouts_initiated));
    d.purchases = sumOptional(d.purchases, num((r as any).purchases));
    d.adds_to_cart_value = sumOptional(d.adds_to_cart_value, num((r as any).adds_to_cart_value));
    demoMap.set(key, d);
  }
  const demographic_rows: AnalysisSummaryDemoRow[] = Array.from(demoMap.entries()).map(([key, v]) => {
    const [age, gender, resultType] = key.split("|");
    return {
      age:        age ?? "",
      gender:     gender ?? "",
      result_type: resultType ?? "unknown",
      intent_class: intentClassOf(resultType ?? "unknown"),
      spend:      v.spend,
      impressions: v.impressions,
      results:    v.results,
      link_clicks: v.link_clicks,
      adds_to_cart: v.adds_to_cart,
      checkouts_initiated: v.checkouts_initiated,
      purchases: v.purchases,
      adds_to_cart_value: v.adds_to_cart_value,
    };
  });

  // ── Placement rows (delivery-based only) ──────────────────────────
  const placRows = await selectAllRows(
    "placement_performance",
    (q) => q.eq("account_id", accountId),
    "date_start, placement, result_type, spend, impressions, link_clicks, results, tracking_basis",
  );

  const placMap = new Map<string, { spend: number; impressions: number; link_clicks: number; results: number }>();
  for (const r of placRows ?? []) {
    if ((r as any).tracking_basis === "conversion") continue; // delivery rows only
    if (!withinViewPreset(String((r as any).date_start ?? ""), preset, anchor)) continue;
    const key = `${String((r as any).placement ?? "")}|${String((r as any).result_type ?? "unknown")}`;
    const p = placMap.get(key) ?? { spend: 0, impressions: 0, link_clicks: 0, results: 0 };
    p.spend       += Number((r as any).spend ?? 0);
    p.impressions += Number((r as any).impressions ?? 0);
    p.link_clicks += Number((r as any).link_clicks ?? 0);
    p.results     += Number((r as any).results ?? 0);
    placMap.set(key, p);
  }
  const placement_rows: AnalysisSummaryPlacementRow[] = Array.from(placMap.entries()).map(([key, v]) => ({
    placement: key.split("|")[0] ?? "",
    result_type: key.split("|")[1] ?? "unknown",
    intent_class: intentClassOf(key.split("|")[1] ?? "unknown"),
    spend:       roundN(v.spend),
    impressions: v.impressions,
    link_clicks: v.link_clicks,
    results:     v.results,
  }));

  // ── Daily series + prior-window totals (real rows, already in memory) ──
  // The prior window is the equal-length span immediately preceding the
  // preset window (anchored the same way); null for "all" or when it holds
  // no rows — never an estimate.
  const daily = buildDailySeries(filtered);
  let prior_totals: AnalysisSummaryTotals | null = null;
  let prior_window: AnalysisSummaryWindow | null = null;
  if (preset !== "all") {
    const days = viewPresetDays(preset)!;
    const curStart = shiftDate(anchor, -(days - 1));
    const pw = priorWindowFor(curStart, anchor);
    const priorRows = adRows.filter((r: any) => {
      const d = String(r.date_start ?? "");
      return d >= pw.start && d <= pw.end;
    });
    if (priorRows.length > 0) {
      prior_totals = buildTotals(priorRows);
      prior_window = pw;
    }
  }

  return {
    preset,
    available_window,
    active_window,
    totals: {
      total_spend_usd:      roundN(totalSpend),
      total_impressions:    Math.round(totalImpressions),
      total_link_clicks:    Math.round(totalLinkClicks),
      overall_link_ctr_pct: linkCtrPct,
      bottom_line_totals:   byEvent,
    },
    daily,
    prior_totals,
    prior_window,
    demographic_rows,
    placement_rows,
    concept_rows,
    data_coverage: await fetchLatestRunCoverage(accountId),
  };
}

// ─── Date-range summary engine ────────────────────────────────────────────────
// Single shared implementation driving every date-scoped summary endpoint.
// Takes explicit start/end dates (YYYY-MM-DD) — callers supply them.
// Never reads manual_analysis_runs; those are just upload-event metadata.

async function _computeAnalysisSummaryForDateRange(
  accountId: string,
  start: string,
  end: string,
): Promise<AnalysisSummaryResult> {
  const supabase = getSupabase();

  const available_window: AnalysisSummaryWindow = { start, end };

  // ── ad_performance ────────────────────────────────────────────────
  const adRows = await selectAllRows(
    "ad_performance",
    (q) => q.eq("account_id", accountId).gte("date_start", start).lte("date_start", end),
    "date_start, spend, impressions, link_clicks, results, result_type, reach, clicks_all, ad_name",
  );

  if (!adRows || adRows.length === 0) {
    return {
      preset: "all" as ViewPreset,
      available_window,
      active_window: null,
      totals: { total_spend_usd: 0, total_impressions: 0, total_link_clicks: 0, overall_link_ctr_pct: 0, bottom_line_totals: {} },
      daily: [],
      prior_totals: null,
      prior_window: null,
      demographic_rows: [],
      placement_rows: [],
      concept_rows: [],
      data_coverage: await fetchLatestRunCoverage(accountId),
    };
  }

  let totalSpend = 0, totalImpressions = 0, totalLinkClicks = 0;
  const byEvent: Record<string, { spend: number; reach: number; impressions: number; results: number; clicks_all: number; link_clicks: number }> = {};

  for (const r of adRows) {
    const spend       = Number((r as any).spend ?? 0);
    const impressions = Number((r as any).impressions ?? 0);
    const linkClicks  = Number((r as any).link_clicks ?? 0);
    const results     = Number((r as any).results ?? 0);
    const reach       = Number((r as any).reach ?? 0);
    const clicksAll   = Number((r as any).clicks_all ?? 0);
    const event       = String((r as any).result_type ?? "unknown");
    totalSpend       += spend;
    totalImpressions += impressions;
    totalLinkClicks  += linkClicks;
    byEvent[event] ??= { spend: 0, reach: 0, impressions: 0, results: 0, clicks_all: 0, link_clicks: 0 };
    byEvent[event]!.spend       += spend;
    byEvent[event]!.reach       += reach;
    byEvent[event]!.impressions += impressions;
    byEvent[event]!.results     += results;
    byEvent[event]!.clicks_all  += clicksAll;
    byEvent[event]!.link_clicks += linkClicks;
  }

  const linkCtrPct = totalImpressions > 0 ? roundN((totalLinkClicks / totalImpressions) * 100) : 0;

  // ── Concept rows ──────────────────────────────────────────────────
  const conceptMap = new Map<string, { book: string | null; spend: number; results: number; link_clicks: number }>();
  for (const r of adRows) {
    const concept = extractConceptCode(String((r as any).ad_name ?? ""));
    if (!concept) continue;
    const book = extractBookCode(String((r as any).ad_name ?? ""));
    const resultType = String((r as any).result_type ?? "unknown");
    const key  = `${book ?? ""}\x01${concept}\x01${resultType}`;
    const c    = conceptMap.get(key) ?? { book, spend: 0, results: 0, link_clicks: 0 };
    c.spend       += Number((r as any).spend ?? 0);
    c.results     += Number((r as any).results ?? 0);
    c.link_clicks += Number((r as any).link_clicks ?? 0);
    conceptMap.set(key, c);
  }
  const concept_rows: AnalysisSummaryConceptRow[] = Array.from(conceptMap.entries()).map(([key, v]) => ({
    concept: key.split("\x01")[1]!,
    book:    v.book,
    result_type: key.split("\x01")[2] ?? "unknown",
    intent_class: intentClassOf(key.split("\x01")[2] ?? "unknown"),
    spend:   roundN(v.spend),
    results: v.results,
    link_clicks: v.link_clicks,
  }));

  // ── Demographic rows ──────────────────────────────────────────────
  const demoRows = await selectAllRows(
    "demographic_performance",
    (q) => q.eq("account_id", accountId).gte("date_start", start).lte("date_start", end),
    "date_start, age, gender, result_type, spend, impressions, results, link_clicks, adds_to_cart, checkouts_initiated, purchases, adds_to_cart_value",
  );

  const demoMap = new Map<string, { spend: number; impressions: number | null; results: number; link_clicks: number; adds_to_cart: number | null; checkouts_initiated: number | null; purchases: number | null; adds_to_cart_value: number | null }>();
  for (const r of demoRows ?? []) {
    const key = `${String((r as any).age ?? "")}|${String((r as any).gender ?? "").toLowerCase()}|${String((r as any).result_type ?? "unknown")}`;
    const d   = demoMap.get(key) ?? { spend: 0, impressions: null, results: 0, link_clicks: 0, adds_to_cart: null, checkouts_initiated: null, purchases: null, adds_to_cart_value: null };
    d.spend       += Number((r as any).spend ?? 0);
    d.results     += Number((r as any).results ?? 0);
    d.link_clicks += Number((r as any).link_clicks ?? 0);
    // sumOptional, not `?? 0`: a row predating the impressions column has
    // no measurement, and folding it as zero would understate the CTR and
    // CPM this exists to make computable.
    d.impressions = sumOptional(d.impressions, num((r as any).impressions));
    d.adds_to_cart = sumOptional(d.adds_to_cart, num((r as any).adds_to_cart));
    d.checkouts_initiated = sumOptional(d.checkouts_initiated, num((r as any).checkouts_initiated));
    d.purchases = sumOptional(d.purchases, num((r as any).purchases));
    d.adds_to_cart_value = sumOptional(d.adds_to_cart_value, num((r as any).adds_to_cart_value));
    demoMap.set(key, d);
  }
  const demographic_rows: AnalysisSummaryDemoRow[] = Array.from(demoMap.entries()).map(([key, v]) => {
    const [age, gender, resultType] = key.split("|");
    return {
      age: age ?? "",
      gender: gender ?? "",
      result_type: resultType ?? "unknown",
      intent_class: intentClassOf(resultType ?? "unknown"),
      spend: v.spend,
      impressions: v.impressions,
      results: v.results,
      link_clicks: v.link_clicks,
      adds_to_cart: v.adds_to_cart,
      checkouts_initiated: v.checkouts_initiated,
      purchases: v.purchases,
      adds_to_cart_value: v.adds_to_cart_value,
    };
  });

  // ── Placement rows ────────────────────────────────────────────────
  const placRows = await selectAllRows(
    "placement_performance",
    (q) => q.eq("account_id", accountId).gte("date_start", start).lte("date_start", end),
    "date_start, placement, result_type, spend, impressions, link_clicks, results, tracking_basis",
  );

  const placMap = new Map<string, { spend: number; impressions: number; link_clicks: number; results: number }>();
  for (const r of placRows ?? []) {
    if ((r as any).tracking_basis === "conversion") continue;
    const key = `${String((r as any).placement ?? "")}|${String((r as any).result_type ?? "unknown")}`;
    const p   = placMap.get(key) ?? { spend: 0, impressions: 0, link_clicks: 0, results: 0 };
    p.spend       += Number((r as any).spend ?? 0);
    p.impressions += Number((r as any).impressions ?? 0);
    p.link_clicks += Number((r as any).link_clicks ?? 0);
    p.results     += Number((r as any).results ?? 0);
    placMap.set(key, p);
  }
  const placement_rows: AnalysisSummaryPlacementRow[] = Array.from(placMap.entries()).map(([key, v]) => ({
    placement: key.split("|")[0] ?? "",
    result_type: key.split("|")[1] ?? "unknown",
    intent_class: intentClassOf(key.split("|")[1] ?? "unknown"),
    spend:       roundN(v.spend),
    impressions: v.impressions,
    link_clicks: v.link_clicks,
    results:     v.results,
  }));

  const adDates     = adRows.map((r: any) => String(r.date_start ?? "")).filter(Boolean);
  const activeStart = adDates.reduce((a, b) => (a < b ? a : b), start);
  const activeEnd   = adDates.reduce((a, b) => (a > b ? a : b), end);

  // ── Daily series + prior-window totals ────────────────────────────
  // Prior = equal-length window immediately preceding [start, end]; one
  // lightweight totals-only query, null when it holds no rows.
  const daily = buildDailySeries(adRows);
  const pw = priorWindowFor(start, end);
  let prior_totals: AnalysisSummaryTotals | null = null;
  let prior_window: AnalysisSummaryWindow | null = null;
  const priorRows = await selectAllRows(
    "ad_performance",
    (q) => q.eq("account_id", accountId).gte("date_start", pw.start).lte("date_start", pw.end),
    "date_start, spend, impressions, link_clicks, results, result_type, reach, clicks_all",
  );
  if (priorRows && priorRows.length > 0) {
    prior_totals = buildTotals(priorRows);
    prior_window = pw;
  }

  return {
    preset: "all" as ViewPreset,
    available_window,
    active_window: { start: activeStart, end: activeEnd },
    totals: {
      total_spend_usd:      roundN(totalSpend),
      total_impressions:    Math.round(totalImpressions),
      total_link_clicks:    Math.round(totalLinkClicks),
      overall_link_ctr_pct: linkCtrPct,
      bottom_line_totals:   byEvent,
    },
    daily,
    prior_totals,
    prior_window,
    demographic_rows,
    placement_rows,
    concept_rows,
    data_coverage: await fetchLatestRunCoverage(accountId),
  };
}

// ─── Public summary wrappers ──────────────────────────────────────────────────

/** Run-scoped: looks up the run's date window from manual_analysis_runs, then delegates. */
export async function getAnalysisSummaryByRunId(
  accountId: string,
  runId: string,
): Promise<AnalysisSummaryResult> {
  const supabase = getSupabase();
  const { data: runs, error } = await supabase
    .from("manual_analysis_runs")
    .select("date_start, date_end")
    .eq("account_id", accountId)
    .eq("id", runId)
    .limit(1);
  if (error) throw new AnalysisError(error.message, 500);
  if (!runs || runs.length === 0) throw new AnalysisError("Analysis run not found", 404);
  const start = String(runs[0]!["date_start"] ?? "");
  const end   = String(runs[0]!["date_end"]   ?? "");
  if (!start || !end) throw new AnalysisError("Run has no date range", 400);
  return _computeAnalysisSummaryForDateRange(accountId, start, end);
}

/** Date-range: caller supplies explicit start/end dates (YYYY-MM-DD). */
export async function getAnalysisSummaryByDateRange(
  accountId: string,
  start: string,
  end: string,
): Promise<AnalysisSummaryResult> {
  if (!start || !end) throw new AnalysisError("start and end date params are required", 400);
  return _computeAnalysisSummaryForDateRange(accountId, start, end);
}

// ─── Daily series ─────────────────────────────────────────────────────────────
// `ad_performance` is stored one row per ad per DAY (buildAdPerformanceRows
// writes date_start === date_end === the normalized Day cell, and the
// uniqueness tuple includes the day). That day grain never reaches the
// client: the seed aggregates it away into window totals, which is correct
// for the seed — it is a bootstrap payload for every account at once and
// already ~1.2 MB — but it means the product has daily data and no way to
// draw a trend from it.
//
// This is that read, on demand and account-scoped. Rates are recomputed from
// the summed numerator and denominator, never averaged across ads: the mean
// of per-ad CPAs is not the day's CPA, and quietly shipping one for the other
// is the kind of error a chart makes look authoritative.
//
// Reach is reported per day as measured. It is deliberately NOT summed
// anywhere downstream — reach is a deduplicated people count, so adding two
// days double-counts anyone present on both.

export type DailySeriesPoint = {
  day: string;              // YYYY-MM-DD
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks_all: number | null;
  link_clicks: number | null;
  results: number | null;
  cpa: number | null;              // spend / results
  ctr_link_pct: number | null;     // link_clicks / impressions
  cvr_link_pct: number | null;     // results / link_clicks
  ads: number;                     // ad rows contributing to this day
  /** Results per Meta result type for the day — scope before reading `results` as one thing. */
  results_by_event: Record<string, number>;
};

export type DailySeriesResult = {
  points: DailySeriesPoint[];
  date_start: string | null;
  date_end: string | null;
  /** Days inside the requested span with no rows at all — a real gap, not a zero. */
  missing_days: string[];
};

/** Sum that stays null when nothing measurable contributed. */
function sumOrNull(values: (number | null | undefined)[]): number | null {
  let seen = false;
  let total = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(Number(v))) continue;
    seen = true;
    total += Number(v);
  }
  return seen ? total : null;
}

const ratio = (num: number | null, den: number | null, scale = 1): number | null =>
  num != null && den != null && den > 0 ? (num / den) * scale : null;

export async function getAccountDailySeries(
  accountId: string,
  start: string,
  end: string,
): Promise<DailySeriesResult> {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO.test(start) || !ISO.test(end)) {
    throw new AnalysisError("start and end must be ISO dates (YYYY-MM-DD).", 400);
  }
  if (start > end) throw new AnalysisError("start must not be after end.", 400);

  const rows = await selectAllRows(
    "ad_performance",
    (q) =>
      q.eq("account_id", accountId)
        .gte("date_start", start)
        .lte("date_start", end)
        .order("date_start")
        .order("id"),
    "date_start, spend, impressions, reach, clicks_all, link_clicks, results, result_type",
  );
  return aggregateDailySeries(rows ?? []);
}

/**
 * The aggregation, separated from the query so the arithmetic can be tested
 * without a database. This is where the two easy mistakes live — averaging a
 * rate across ads instead of recomputing it from the day's sums, and turning
 * "not measured" into a zero — so it is the part that is worth pinning.
 */
export function aggregateDailySeries(rows: Record<string, unknown>[]): DailySeriesResult {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (rows.length === 0) {
    return { points: [], date_start: null, date_end: null, missing_days: [] };
  }

  const byDay = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const day = String(r["date_start"] ?? "").slice(0, 10);
    if (!ISO.test(day)) continue;
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(r);
  }

  const points: DailySeriesPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, dayRows]) => {
      const pick = (k: string) => dayRows.map((r) => r[k] as number | null);
      const spend = sumOrNull(pick("spend"));
      const impressions = sumOrNull(pick("impressions"));
      const linkClicks = sumOrNull(pick("link_clicks"));
      const results = sumOrNull(pick("results"));
      const resultsByEvent: Record<string, number> = {};
      for (const r of dayRows) {
        const v = r["results"];
        if (v == null || !Number.isFinite(Number(v))) continue;
        const event = typeof r["result_type"] === "string" && r["result_type"] !== "" ? (r["result_type"] as string) : "unknown";
        resultsByEvent[event] = (resultsByEvent[event] ?? 0) + Number(v);
      }
      return {
        day,
        spend,
        impressions,
        reach: sumOrNull(pick("reach")),
        clicks_all: sumOrNull(pick("clicks_all")),
        link_clicks: linkClicks,
        results,
        cpa: ratio(spend, results),
        ctr_link_pct: ratio(linkClicks, impressions, 100),
        cvr_link_pct: ratio(results, linkClicks, 100),
        ads: dayRows.length,
        results_by_event: resultsByEvent,
      };
    });

  // Name the gaps. A trend line that bridges a day with no data implies
  // continuity the data does not have, so the caller is told which days are
  // absent rather than being handed a line that quietly interpolates.
  const missing: string[] = [];
  const first = points[0]!.day;
  const last = points[points.length - 1]!.day;
  const present = new Set(points.map((p) => p.day));
  for (let t = Date.parse(first + "T00:00:00Z"); t <= Date.parse(last + "T00:00:00Z"); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!present.has(d)) missing.push(d);
  }

  return { points, date_start: first, date_end: last, missing_days: missing };
}

// ─── Data-window discovery ────────────────────────────────────────────────────
// Queries ad_performance DIRECTLY to return the actual available date windows
// for an account. Source of truth for DataWindowBar — does NOT depend on
// manual_analysis_runs (which can be duplicate, stale, or missing).
// Groups into monthly buckets when data spans > 60 days.

export type AccountAnalysisDataWindow = {
  label: string; // "March 2026" | "May 2 – Jun 18"
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  spend: number; // total spend in this window
  rows: number;  // number of ad_performance rows
};

export type AccountAnalysisDataWindowsResult = {
  windows: AccountAnalysisDataWindow[];
  total_span_days: number;
};

export async function getAccountAnalysisDataWindows(
  accountId: string,
): Promise<AccountAnalysisDataWindowsResult> {
  const supabase = getSupabase();

  // An account's ENTIRE history, so this is the read most certain to pass
  // 1000 rows — and the windows it derives are what the date picker offers,
  // so truncation here hides real data from the user before they can ask
  // for it. Ordered by (date_start, id) because offset pagination is only
  // stable under a deterministic sort.
  const data = await selectAllRows(
    "ad_performance",
    (q) => q.eq("account_id", accountId).order("date_start").order("id"),
    "date_start, spend",
  );
  if (!data || data.length === 0) return { windows: [], total_span_days: 0 };

  // Aggregate spend + row count per distinct date
  const byDate = new Map<string, { spend: number; rows: number }>();
  for (const r of data) {
    const d = String((r as any).date_start ?? "");
    if (!d) continue;
    const cur = byDate.get(d) ?? { spend: 0, rows: 0 };
    cur.spend += Number((r as any).spend ?? 0);
    cur.rows  += 1;
    byDate.set(d, cur);
  }

  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) return { windows: [], total_span_days: 0 };

  const earliest = dates[0]!;
  const latest   = dates[dates.length - 1]!;
  const spanDays =
    Math.round(
      (new Date(latest + "T00:00:00Z").getTime() - new Date(earliest + "T00:00:00Z").getTime()) /
        86_400_000,
    ) + 1;

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  // Single window when data span ≤ 60 days
  if (spanDays <= 60) {
    let totalSpend = 0;
    let totalRows  = 0;
    for (const v of byDate.values()) {
      totalSpend += v.spend;
      totalRows  += v.rows;
    }
    return {
      windows: [
        {
          label: `${fmtDate(earliest)} – ${fmtDate(latest)}`,
          start: earliest,
          end:   latest,
          spend: roundN(totalSpend),
          rows:  totalRows,
        },
      ],
      total_span_days: spanDays,
    };
  }

  // Monthly buckets when data spans > 60 days
  const monthMap = new Map<string, { spend: number; rows: number; start: string; end: string }>();
  for (const d of dates) {
    const month = d.substring(0, 7); // "YYYY-MM"
    const v     = byDate.get(d)!;
    const cur   = monthMap.get(month) ?? { spend: 0, rows: 0, start: d, end: d };
    cur.spend += v.spend;
    cur.rows  += v.rows;
    if (d < cur.start) cur.start = d;
    if (d > cur.end)   cur.end   = d;
    monthMap.set(month, cur);
  }

  const windows: AccountAnalysisDataWindow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      label: new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", {
        month:    "long",
        year:     "numeric",
        timeZone: "UTC",
      }),
      start: v.start,
      end:   v.end,
      spend: roundN(v.spend),
      rows:  v.rows,
    }));

  return { windows, total_span_days: spanDays };
}
