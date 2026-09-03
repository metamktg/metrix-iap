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
import { detectReportGrain } from "./reportGrain";
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
  spend: number;
  impressions: number;
  link_clicks: number;
  results: number;
}

export interface AnalysisSummaryConceptRow {
  concept: string;
  book: string | null;
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
  results: number;
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
  try {
    const supabase = getSupabase();
    await supabase
      .from("manual_analysis_runs")
      .update({ progress_pct: pct, progress_stage: stage })
      .eq("id", runId);
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
        `(identical dates, breakdowns, and metric values) — counted once, never twice. ` +
        `If both files are the same export saved in different formats, remove one of them.`,
    );
  }
}

/**
 * Merges the three ad-level sources — the required demographic
 * (`scopedDemo`) and device/placement (`scopedPlacement`) exports plus the
 * optional ad_summary export (`scopedSummary`) — into one ad_performance
 * bucket per (campaign, ad, date). Priority for spend/results/resultType/
 * linkClicks/clicksAll: ad_summary > demo > null (ad_summary isn't
 * privacy-limited the way the demo export can be). Extracted out of
 * startManualAnalysis (rather than left inline) so this merge/dedupe logic
 * — especially the blank-Campaign-name ad_summary handling below — can be
 * unit tested without a live Supabase connection.
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
    /**
     * True when the ad_summary export is a whole-period aggregate (see
     * detectAggregateAdSummary): its rows still feed creative metadata, but
     * are excluded from daily bucket supplements and summary-only daily row
     * insertion — a whole-period total misdated as one day inflates every
     * daily surface (the AAFE +41% total-spend bug).
     */
    summaryMetadataOnly?: boolean;
  },
): {
  adBuckets: Map<string, AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; resultType: string; date: string }>;
  adCreativeMetadata: Map<string, Record<string, string>>;
  unknownResultTypeRows: number;
} {
  // ── Ad-level supplementary aggregation from demo export ────────────
  // The demographic export reliably carries spend/results/result_type per
  // ad; the device/placement export is often impression-only (especially
  // Meta's "Impression device" breakdown). Build a per-(campaign, ad, date)
  // roll-up from the demo CSV so we can fill in spend and result_type when
  // the placement export has no financial data.
  const demoAdBuckets = new Map<
    string,
    AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; date: string }
  >();
  for (const row of scopedDemo) {
    const campaign = row.breakdowns["Campaign name"]!;
    const adSet = row.breakdowns["Ad set name"] ?? "";
    const adName = row.breakdowns["Ad name"]!;
    const date = row.breakdowns["Day"]!;
    const key = [campaign, rowAdIdentity(row), date].join("\u0001");
    if (!demoAdBuckets.has(key)) {
      demoAdBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, date });
    }
    accumulate(demoAdBuckets.get(key)!, row);
    captureAdIdentity(demoAdBuckets.get(key)!, row);
  }

  // ── Ad-level aggregation from ad_summary export (full spend) ────────
  // The ad_summary export has one row per ad per day and carries spend
  // unaffected by iOS privacy limits (unlike the demographic export which
  // only shows demographically-attributable spend). When present, it becomes
  // the primary spend source for ad_performance rows.
  const summaryAdBuckets = new Map<
    string,
    AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; date: string }
  >();
  // Secondary index for blank-Campaign-name summary buckets only — see the
  // function-level comment above. Populated in lockstep with summaryAdBuckets
  // so both maps hold the SAME bucket object (accumulate() below still only
  // ever mutates the one object per ad/day, whichever map it's looked up from).
  const summaryAdBucketsByAdDate = new Map<
    string,
    AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; date: string }
  >();
  // Creative metadata: collect the most-recently-seen metadata per ad name.
  // Same ad can appear across multiple rows (different dates) — metadata should
  // be consistent, so we just take the first non-empty value per column.
  const adCreativeMetadata = new Map<string, Record<string, string>>();
  for (const row of scopedSummary) {
    const campaign = row.breakdowns["Campaign name"] ?? "";
    const adSet = row.breakdowns["Ad set name"] ?? "";
    const adName = row.breakdowns["Ad name"]!;
    const date = row.breakdowns["Day"]!;
    // A whole-period aggregate export contributes creative metadata only —
    // its "dates" are the report window start, not real days (see opts doc).
    if (!opts?.summaryMetadataOnly) {
      const key = [campaign, rowAdIdentity(row), date].join("\u0001");
      if (!summaryAdBuckets.has(key)) {
        const bucket = { ...emptyBucket(), campaign, adSet, adName, date };
        summaryAdBuckets.set(key, bucket);
        if (campaign === "") {
          summaryAdBucketsByAdDate.set([rowAdIdentity(row), date].join("\u0001"), bucket);
        }
      }
      accumulate(summaryAdBuckets.get(key)!, row);
      captureAdIdentity(summaryAdBuckets.get(key)!, row);
    }
    // Collect creative metadata (merge, keeping first non-empty value per column)
    if (row.creativeMetadata && Object.keys(row.creativeMetadata).length > 0) {
      const metadataKey = rowAdIdentity(row);
      const existing = adCreativeMetadata.get(metadataKey) ?? {};
      for (const [col, val] of Object.entries(row.creativeMetadata)) {
        if (!existing[col] && val) existing[col] = val;
      }
      adCreativeMetadata.set(metadataKey, existing);
    }
  }

  // ── Ad-level rows (ad_performance): aggregate the placement export
  // across its device/platform/placement dimensions to a per-ad/day row.
  // Spend/results/resultType are filled from the demo aggregation when
  // the placement export is an impression-only device-breakdown export.
  const adBuckets = new Map<string, AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; resultType: string; date: string }>();
  for (const row of scopedPlacement) {
    const campaign = row.breakdowns["Campaign name"]!;
    const adSet = row.breakdowns["Ad set name"] ?? "";
    const adName = row.breakdowns["Ad name"]!;
    const date = row.breakdowns["Day"]!;
    const key = [campaign, rowAdIdentity(row), date].join("\u0001");
    if (!adBuckets.has(key)) {
      adBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, resultType: "", date });
    }
    accumulate(adBuckets.get(key)!, row);
    captureAdIdentity(adBuckets.get(key)!, row);
  }
  // ad/date combos (regardless of campaign) already covered by the placement
  // export above — used below only for the blank-campaign summary fallback,
  // so a blank-Campaign-name ad_summary row for an ad/date already present
  // here is recognized as a supplement, not inserted as a second row.
  const placementAdDateKeys = new Set(
    Array.from(adBuckets.values()).map((b) => [b.metaAdId || b.adName, b.date].join("\u0001")),
  );
  // Supplement from the ad_summary (preferred) then demo aggregation:
  // fill spend/results/resultType for any ad bucket the placement export
  // left financially empty. Priority: summary > demo > null.
  let unknownResultTypeRows = 0;
  for (const b of adBuckets.values()) {
    const adIdentity = b.metaAdId || b.adName;
    const adKey = [b.campaign, adIdentity, b.date].join("\u0001");
    const adDateKey = [adIdentity, b.date].join("\u0001");
    // Exact [campaign, adName, date] match first; fall back to the
    // ad-date-only index for a blank-Campaign-name summary bucket that can
    // never carry the real campaign name to match adKey directly.
    const summary = summaryAdBuckets.get(adKey) ?? summaryAdBucketsByAdDate.get(adDateKey);
    const demo = demoAdBuckets.get(adKey);
    const preferred = summary ?? demo;
    if (preferred) {
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
      (sum.campaign === "" && placementAdDateKeys.has([sum.metaAdId || sum.adName, sum.date].join("\u0001")));
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
  return { adBuckets, adCreativeMetadata, unknownResultTypeRows };
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

/**
 * True when the staged ad_summary export is a whole-period per-ad aggregate
 * rather than a daily export: every row carries the SAME "Day" value (which
 * is really the aliased "Reporting starts" — the report window start) while
 * the companion daily exports span multiple days. Treating such a file as
 * daily data misdates its whole-period spend as a single day and inflates
 * totals (observed: +$21.8K / +41% on the AAFE account).
 */
export function detectAggregateAdSummary(summaryRows: IapCsvRow[], companionDays: string[]): boolean {
  if (summaryRows.length === 0) return false;
  const summaryDays = new Set(summaryRows.map((r) => r.breakdowns["Day"]!));
  if (summaryDays.size !== 1) return false;
  return new Set(companionDays).size > 1;
}

/**
 * Measures per-report-class join coverage against the run's own merged daily
 * ad rows. Pure — exported for unit tests.
 */
export function computeDataCoverage(args: {
  window: { start: string; end: string };
  scopedDemo: IapCsvRow[];
  scopedPlacement: IapCsvRow[];
  scopedSummary: IapCsvRow[];
  scopedConversionDevice: IapCsvRow[];
  adBuckets: Map<string, AggBucket & { adName: string }>;
  summaryAggregate: boolean;
}): AnalysisDataCoverage {
  let baselineSpend = 0;
  const baselineAds = new Set<string>();
  for (const b of args.adBuckets.values()) {
    baselineSpend += b.spend ?? 0;
    baselineAds.add(b.adName);
  }
  baselineSpend = Math.round(baselineSpend * 100) / 100;

  const classRows: [ReportClassCoverageKey, IapCsvRow[], boolean][] = [
    ["demographic", args.scopedDemo, false],
    ["device_placement", args.scopedPlacement, false],
    ["ad_summary", args.scopedSummary, args.summaryAggregate],
    ["conversion_device", args.scopedConversionDevice, false],
  ];

  const classes: ReportClassCoverage[] = [];
  for (const [key, rows, aggregateShape] of classRows) {
    if (rows.length === 0) continue; // class not imported — absence is its own honest state
    let spend = 0;
    let anySpend = false;
    const ads = new Set<string>();
    for (const r of rows) {
      const s = r.base["amount_spent"];
      if (typeof s === "number") {
        spend += s;
        anySpend = true;
      }
      const ad = r.breakdowns["Ad name"];
      if (ad) ads.add(ad);
    }
    spend = Math.round(spend * 100) / 100;
    const spendCoverage = anySpend ? pctOfBaseline(spend, baselineSpend) : null;
    const adCoverage = ads.size > 0 ? pctOfBaseline(ads.size, baselineAds.size) : null;
    // Conversion-device exports carry no spend by design (tracking_basis
    // 'conversion') — coverage-of-spend does not apply to them.
    const coverageApplies = key !== "conversion_device" && spendCoverage !== null;
    const belowThreshold = coverageApplies && spendCoverage < COVERAGE_THRESHOLD_PCT && !aggregateShape;

    // Over-baseline reconciliation: a breakdown class can only ever slice the
    // daily-attributable total — spend EXCEEDING it means rows are being
    // counted more than once (the demographic double-ingestion shipped as
    // BUG-19 showed up as exactly 200% here). 101% allows rounding drift.
    // (An aggregate-shape summary legitimately exceeds the daily baseline —
    // its whole-period total is excluded from daily buckets by design — so
    // the aggregate note takes precedence over this check.)
    const overBaseline = coverageApplies && spendCoverage > 101 && !aggregateShape;

    let note: string | null = null;
    if (overBaseline) {
      note =
        `Reconciliation check failed: ${iapCsvClassLabel(key)} rows carry $${spend.toLocaleString("en-US")} of spend — ` +
        `${spendCoverage}% of the $${baselineSpend.toLocaleString("en-US")} daily-attributable total for this window. ` +
        `A breakdown can never exceed the total, so some rows are being counted more than once. ` +
        `Most likely the same export is staged twice in different formats or overlapping date windows — ` +
        `remove the duplicate file(s) and re-run analysis.`;
    } else if (aggregateShape) {
      note =
        `This ad summary export is a whole-period per-ad report (its date column is the report window start on every row), not a daily export. ` +
        `Its $${spend.toLocaleString("en-US")} period total was used for creative metadata and total-spend cross-checking only — never added to daily totals. ` +
        `Re-export it with the "Day" breakdown to include ad-level daily spend.`;
    } else if (belowThreshold && key === "demographic") {
      // Context, not a warning (owner direction 2026-09-02): what the rows
      // carry, what that means for a segment read, and how to widen it.
      note =
        `Demographic rows carry $${spend.toLocaleString("en-US")} of the $${baselineSpend.toLocaleString("en-US")} daily-attributable spend (${spendCoverage}%) ` +
        `across ${ads.size} of ${baselineAds.size} ads; segment reads describe that slice. ` +
        `To widen it, re-export Demographics for all ads over the full window.`;
    } else if (belowThreshold) {
      note =
        `${iapCsvClassLabel(key)} rows carry ${spendCoverage}% of the daily-attributable spend for this window — surfaces built from this class describe only that slice.`;
    }

    classes.push({
      report_class: key,
      rows_scoped: rows.length,
      distinct_ads: ads.size,
      spend: anySpend ? spend : null,
      spend_coverage_pct: spendCoverage,
      ad_coverage_pct: adCoverage,
      aggregate_shape: aggregateShape,
      below_threshold: belowThreshold,
      note,
    });
  }

  return {
    window: args.window,
    baseline_spend: baselineSpend,
    baseline_distinct_ads: baselineAds.size,
    threshold_pct: COVERAGE_THRESHOLD_PCT,
    classes,
  };
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
  adBuckets: Map<string, AggBucket & AdIdentityFields & { campaign: string; adSet: string; adName: string; resultType: string; date: string }>,
  adCreativeMetadata: Map<string, Record<string, string>>,
): Record<string, any>[] {
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const seenTuples = new Set<string>();
  return Array.from(adBuckets.values()).map((b) => {
    if (!ISO_DAY.test(b.date)) {
      throw new AnalysisError(
        `Internal consistency check failed: an aggregated ad row for "${b.adName}" carries the non-normalized date "${b.date}". ` +
          `This should have been normalized at parse time — re-export the file as CSV directly from Meta and re-upload.`,
        422,
      );
    }
    const tuple = [b.metaAdId || b.adName, b.campaign, b.resultType, b.date].join("");
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
      date_end: b.date,
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
  accountResultType: string,
): Record<string, unknown> {
  const cpa = v.results > 0 ? v.spend / v.results : null;
  const cvrLinkPct = v.linkClicks > 0 && v.results > 0 ? (v.results / v.linkClicks) * 100 : null;
  return {
    // Payload must match VariablePerformanceRow (client seedTypes) so
    // report export, top-checkout rollups, and other consumers can read
    // these rows without a transform.
    variable_family: "raw_token",
    variable_id: token,
    "Result type": accountResultType,
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
  const { data: imports, error: importsErr } = await supabase
    .from("manual_imports")
    .select("id, filename, kind, size_bytes")
    .eq("account_id", accountId)
    .eq("status", "staged")
    .in("kind", ["performance_demo_csv", "performance_placement_csv", "performance_ad_summary_csv", "performance_conversion_device_csv", "performance_asset_csv"]);
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
      // Every parsed file, with its detected grain, for the reconciliation
      // layer (spec §3–§8). The same parse result the class loops consume,
      // so the grain the run reconciles against is the grain that was staged.
      const reportInputs: ReportInput[] = [];
      const recordReport = (imp: { id?: unknown }, result: IapCsvParseResult, cls: IapCsvClass): void => {
        reportInputs.push({
          import_id: String(imp["id"]),
          grain: detectReportGrain(result, cls),
          rows: result.rows,
          totals_row: result.totalsRow,
        });
      };
      // Objective column groups seen across ALL staged files this run —
      // compared against the account's configured objectives (Settings →
      // General) to decide what gets assessed vs flagged. Never blocks.
      const objectiveGroupsPresent = new Set<ObjectiveColumnGroup>();
      const demoRows: IapCsvRow[] = [];
      const demoRowsSeen = new Set<string>();
      for (const imp of demoImports) {
        try {
          const { result, xlsxWarnings } = await parseImportForClass(imp, "demographic");
          recordReport(imp, result, "demographic");
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Demographics "${imp["filename"]}"] ${w}`);
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          appendRowsCrossFileDeduped(demoRows, result.rows, demoRowsSeen, { filename: String(imp["filename"]), label: "Demographics", warnings: allCsvWarnings });
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Demographics "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Demographics file "${imp["filename"]}": ${detail}`, 422);
        }
      }
      await updateProgress(runId, 20, "Parsing placements export");
      const placementRows: IapCsvRow[] = [];
      const placementRowsSeen = new Set<string>();
      for (const imp of placementImports) {
        try {
          const { result, xlsxWarnings } = await parseImportForClass(imp, "device_placement");
          recordReport(imp, result, "device_placement");
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Placements "${imp["filename"]}"] ${w}`);
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          appendRowsCrossFileDeduped(placementRows, result.rows, placementRowsSeen, { filename: String(imp["filename"]), label: "Placements", warnings: allCsvWarnings });
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Placements "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Placements file "${imp["filename"]}": ${detail}`, 422);
        }
      }
      // Optional: ad-level summary export (one row per ad per day, full spend).
      // When present it becomes the primary source for ad_performance spend,
      // overriding the privacy-limited spend from the demographic export.
      if (summaryImports.length > 0) {
        await updateProgress(runId, 36, "Parsing ad summary export");
      }
      const summaryRows: IapCsvRow[] = [];
      const summaryRowsSeen = new Set<string>();
      for (const imp of summaryImports) {
        try {
          const { result, xlsxWarnings } = await parseImportForClass(imp, "ad_summary");
          recordReport(imp, result, "ad_summary");
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Ad Summary "${imp["filename"]}"] ${w}`);
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          appendRowsCrossFileDeduped(summaryRows, result.rows, summaryRowsSeen, { filename: String(imp["filename"]), label: "Ad Summary", warnings: allCsvWarnings });
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Ad Summary "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Ad Summary file "${imp["filename"]}": ${detail}`, 422);
        }
      }

      // Optional: asset-breakdown pivots (a report "by asset" — Text,
      // Headline, Image name …). They feed the reconciliation layer only:
      // delivered asset evidence, asset margins and joint cells (spec §10).
      if (assetImports.length > 0) {
        await updateProgress(runId, 40, "Parsing asset breakdown export");
      }
      const assetRows: IapCsvRow[] = [];
      const assetRowsSeen = new Set<string>();
      for (const imp of assetImports) {
        try {
          const { result, xlsxWarnings } = await parseImportForClass(imp, "asset");
          recordReport(imp, result, "asset");
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Asset breakdown "${imp["filename"]}"] ${w}`);
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          appendRowsCrossFileDeduped(assetRows, result.rows, assetRowsSeen, { filename: String(imp["filename"]), label: "Asset breakdown", warnings: allCsvWarnings });
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Asset breakdown "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Asset breakdown file "${imp["filename"]}": ${detail}`, 422);
        }
      }

      // Optional: conversion device export (one row per ad/device per day, conversion-only metrics).
      // These rows carry only conversion data (no spend/impressions) and are stored in
      // device_performance with tracking_basis='conversion' and device_kind='conversion'.
      if (conversionDeviceImports.length > 0) {
        await updateProgress(runId, 42, "Parsing conversion device export");
      }
      const conversionDeviceRows: IapCsvRow[] = [];
      const conversionDeviceRowsSeen = new Set<string>();
      for (const imp of conversionDeviceImports) {
        try {
          const { result, xlsxWarnings } = await parseImportForClass(imp, "conversion_device");
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Conversion Device "${imp["filename"]}"] ${w}`);
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          appendRowsCrossFileDeduped(conversionDeviceRows, result.rows, conversionDeviceRowsSeen, { filename: String(imp["filename"]), label: "Conversion Device", warnings: allCsvWarnings });
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Conversion Device "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Conversion Device file "${imp["filename"]}": ${detail}`, 422);
        }
      }

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
      const allDates = [
        ...demoRows.map((r) => r.breakdowns["Day"]!),
        ...placementRows.map((r) => r.breakdowns["Day"]!),
        ...summaryRows.map((r) => r.breakdowns["Day"]!),
        ...conversionDeviceRows.map((r) => r.breakdowns["Day"]!),
        ...assetRows.map((r) => r.breakdowns["Day"]!),
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
      const scopedDates = [
        ...scopedDemo.map((r) => r.breakdowns["Day"]!),
        ...scopedPlacement.map((r) => r.breakdowns["Day"]!),
        ...scopedSummary.map((r) => r.breakdowns["Day"]!),
        ...scopedConversionDevice.map((r) => r.breakdowns["Day"]!),
      ];
      const dateStart = scopedDates.reduce((min, d) => (d < min ? d : min), scopedDates[0]!);
      const dateEnd = scopedDates.reduce((max, d) => (d > max ? d : max), scopedDates[0]!);

      // A whole-period aggregate ad_summary (its "Day" is really the
      // aliased "Reporting starts" — identical on every row) must not feed
      // daily buckets: its full-period per-ad spend would be misdated as a
      // single day and inflate every daily total (observed +41% on AAFE).
      const summaryAggregate = detectAggregateAdSummary(scopedSummary, [
        ...scopedDemo.map((r) => r.breakdowns["Day"]!),
        ...scopedPlacement.map((r) => r.breakdowns["Day"]!),
      ]);
      if (summaryAggregate) {
        const names = summaryImports.map((i) => `"${i["filename"]}"`).join(", ");
        allCsvWarnings.push(
          `[Ad summary] ${names}: this is a whole-period per-ad export (every row carries the report window start as its date), not a daily export. ` +
            `Its spend was used for creative metadata and total-spend cross-checking only — never added to daily totals, which would misdate whole-period spend as a single day. ` +
            `Re-export it with the "Day" breakdown to include ad-level daily spend.`,
        );
      }

      // Merge the three ad-level sources into one bucket per (campaign, ad,
      // date) — see mergeAdPerformanceBuckets for the full priority/dedupe
      // rules, including the blank-Campaign-name ad_summary handling.
      const { adBuckets, adCreativeMetadata, unknownResultTypeRows } = mergeAdPerformanceBuckets(
        scopedDemo,
        scopedPlacement,
        scopedSummary,
        { summaryMetadataOnly: summaryAggregate },
      );

      // ── Join coverage (degraded-data honesty layer) ────────────────────
      // Measured per report class against this run's own daily-attributable
      // baseline; persisted with the run and served to every aggregating
      // surface via the analysis-summary API. See computeDataCoverage.
      const dataCoverage = computeDataCoverage({
        window: { start: dateStart, end: dateEnd },
        scopedDemo,
        scopedPlacement,
        scopedSummary,
        scopedConversionDevice,
        adBuckets,
        summaryAggregate,
      });
      for (const cls of dataCoverage.classes) {
        if (cls.note && !cls.aggregate_shape) {
          allCsvWarnings.push(`[Coverage] ${cls.note}`);
        }
      }
      if (summaryAggregate) {
        const summaryCls = dataCoverage.classes.find((c) => c.report_class === "ad_summary");
        const summarySpend = summaryCls?.spend ?? null;
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
      const demoBuckets = new Map<string, AggBucket & { gender: string; age: string; date: string }>();
      for (const row of scopedDemo) {
        const gender = row.breakdowns["Gender"]!;
        const age = row.breakdowns["Age"]!;
        const date = row.breakdowns["Day"]!;
        const key = [gender, age, date].join("\u0001");
        if (!demoBuckets.has(key)) demoBuckets.set(key, { ...emptyBucket(), gender, age, date });
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
      const deviceBuckets = new Map<string, AggBucket & { device: string; date: string }>();
      const placementBuckets = new Map<string, AggBucket & { placement: string; date: string }>();
      const platformBuckets = new Map<string, AggBucket & { platform: string; date: string }>();
      let deviceEligibleRows = 0;
      let deviceCoveredRows = 0;
      for (const row of scopedPlacement) {
        const date = row.breakdowns["Day"]!;
        const device = row.breakdowns["Impression device"];
        const placement = row.breakdowns["Placement"]!;
        const platform = row.breakdowns["Platform"]!;

        deviceEligibleRows += 1;
        if (device != null && device.trim() !== "") {
          deviceCoveredRows += 1;
          const dKey = [device, date].join("\u0001");
          if (!deviceBuckets.has(dKey)) deviceBuckets.set(dKey, { ...emptyBucket(), device, date });
          accumulate(deviceBuckets.get(dKey)!, row);
        }

        const pKey = [placement, date].join("\u0001");
        if (!placementBuckets.has(pKey)) placementBuckets.set(pKey, { ...emptyBucket(), placement, date });
        accumulate(placementBuckets.get(pKey)!, row);

        const plKey = [platform, date].join("\u0001");
        if (!platformBuckets.has(plKey)) platformBuckets.set(plKey, { ...emptyBucket(), platform, date });
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
      const demoWindowBuckets = new Map<string, AggBucket & { gender: string; age: string }>();
      for (const row of scopedDemo) {
        const gender = row.breakdowns["Gender"]!;
        const age = row.breakdowns["Age"]!;
        const key = [gender, age].join("");
        if (!demoWindowBuckets.has(key)) demoWindowBuckets.set(key, { ...emptyBucket(), gender, age });
        accumulate(demoWindowBuckets.get(key)!, row);
      }
      const placementWindowBuckets = new Map<string, AggBucket & { placement: string; platform: string }>();
      for (const row of scopedPlacement) {
        const placement = row.breakdowns["Placement"]!;
        const platform = row.breakdowns["Platform"]!;
        const key = [placement, platform].join("");
        if (!placementWindowBuckets.has(key)) {
          placementWindowBuckets.set(key, { ...emptyBucket(), placement, platform });
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

      const CHUNK = 500;
      const insertChunked = async (table: string, rows: Record<string, any>[]) => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const ins = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
          if (ins.error) throw new Error(ins.error.message);
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
      const conceptMap = new Map<string, { book: string | null; concept: string; spend: number; results: number; linkClicks: number; spendWithCopy: number }>();
      for (const row of adRows) {
        const concept = extractConcept(String(row.ad_name ?? ""));
        if (!concept) continue;
        const book = extractBook(String(row.ad_name ?? ""));
        const cKey = [book ?? "", concept].join("\u0001");
        if (!conceptMap.has(cKey)) {
          conceptMap.set(cKey, { book, concept, spend: 0, results: 0, linkClicks: 0, spendWithCopy: 0 });
        }
        const c = conceptMap.get(cKey)!;
        const rowSpend = Number(row.spend ?? 0);
        c.spend += rowSpend;
        c.results += Number(row.results ?? 0);
        c.linkClicks += Number(row.link_clicks ?? 0);
        if (hasCopy(creativeInputFromMetadata(String(row.ad_name ?? ""), row.meta_ad_id ?? null, row.ad_creative_metadata))) {
          c.spendWithCopy += rowSpend;
        }
      }
      if (conceptMap.size > 0) {
        // ── Stage 2 Analysis Core: pre-compute intelligence fields ──────────
        // These are deterministic formulas applied to the aggregated concept data.

        // 1. mapped_in_library: resolve concept codes against the client library.
        //    Non-fatal — if the query fails, all concepts stay unmapped (false).
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

        // 2. Book-level blended CPA (baseline): total spend / total results per book.
        //    Used to compute lift vs. baseline for each concept.
        const bookTotalSpend = new Map<string, number>();
        const bookTotalResults = new Map<string, number>();
        for (const c of conceptMap.values()) {
          const bk = c.book ?? "";
          bookTotalSpend.set(bk, (bookTotalSpend.get(bk) ?? 0) + c.spend);
          bookTotalResults.set(bk, (bookTotalResults.get(bk) ?? 0) + c.results);
        }
        const getBlendedCpa = (book: string | null): number | null => {
          const bk = book ?? "";
          const s = bookTotalSpend.get(bk) ?? 0;
          const r = bookTotalResults.get(bk) ?? 0;
          return r > 0 ? s / r : null;
        };

        // No delete here: concept_performance is run-tagged (manual_analysis_run_id)
        // and retains full history across runs — deleting-then-inserting the whole
        // account on every run used to destroy every prior run's rollup. A failed
        // run's rows are cleaned up by deleteRunOutputs (see below), not here.
        const conceptRows = Array.from(conceptMap.values()).map((c) => {
          const spend = c.spend > 0 ? c.spend : null;
          const results = c.results > 0 ? c.results : null;
          const cpa = spend !== null && results !== null && results > 0 ? spend / results : null;
          const cvrLinkPct = c.linkClicks > 0 && results !== null ? (results / c.linkClicks) * 100 : null;

          // buying_intent_score: combines result volume with engagement signal
          const buyingIntentScore = c.results * 10 + c.linkClicks;

          // performance_lift_vs_baseline: positive = concept is cheaper than book average
          const blendedCpa = getBlendedCpa(c.book);
          const liftVsBaseline =
            cpa !== null && blendedCpa !== null && blendedCpa > 0
              ? (blendedCpa - cpa) / blendedCpa
              : null;

          // performance_tier: 1-4 bucketed by lift threshold
          //   Tier 1 (Scale):    lift ≥ +10%  — concept CPA at least 10% below account baseline
          //   Tier 2 (Optimize): lift in [0%, +10%)  — on or slightly below baseline
          //   Tier 3 (Hold):     lift in [-20%, 0%)  — up to 20% above baseline, still viable
          //   Tier 4 (Eliminate):lift < -20%  — concept CPA more than 20% worse than baseline
          let performanceTier: string | null = null;
          if (liftVsBaseline !== null) {
            if (liftVsBaseline >= 0.10) performanceTier = "1 - Scale Winners";
            else if (liftVsBaseline >= 0) performanceTier = "2 - Optimize";
            else if (liftVsBaseline >= -0.20) performanceTier = "3 - Hold";
            else performanceTier = "4 - Eliminate";
          } else if (c.results === 0) {
            performanceTier = "4 - Eliminate"; // zero results = no signal
          }

          // confidence_level: based on spend volume and result sample size
          //   high:                 spend ≥ $500 AND results ≥ 30
          //   medium:               spend ≥ $100 AND results ≥ 5
          //   low:                  any spend with at least 1 result
          //   validation_required:  no results yet
          // The tier lives in creativeComponents.volumeConfidence so the
          // component weighting grades on the same thresholds.
          const confidenceLevel = volumeConfidence(c.spend, c.results);
          // Evidence: how much of this concept's spend the engine can explain
          // at the copy level. The tier is not relabelled by it (sample size
          // is sample size); the numeric score and the grade carry it.
          const creativeCoverage = c.spend > 0 ? c.spendWithCopy / c.spend : 0;

          return {
            account_id: accountId,
            manual_analysis_run_id: runId,
            book: c.book,
            concept: c.concept,
            date_start: dateStart,
            date_end: dateEnd,
            spend,
            link_clicks: c.linkClicks > 0 ? c.linkClicks : null,
            results,
            cpa,
            cvr_link_pct: cvrLinkPct,
            mapped_in_library: libraryConceptsSet.has(c.concept),
            buying_intent_score: buyingIntentScore > 0 ? buyingIntentScore : null,
            performance_lift_vs_baseline:
              liftVsBaseline !== null ? liftVsBaseline.toFixed(4) : null,
            performance_tier: performanceTier,
            confidence_level: confidenceLevel,
            creative_coverage_pct: Math.round(creativeCoverage * 10000) / 100,
            evidence_grade: evidenceGrade(creativeCoverage),
            confidence_score: confidenceScore(confidenceLevel, creativeCoverage),
          };
        });
        await insertChunked("concept_performance", conceptRows);
      }

      // ── Stage 2: Variable-level performance ─────────────────────────────
      // Extract raw variable tokens from ad names (all underscore-delimited tokens
      // that are not the cell/concept code, BOOK label, or test-round suffix).
      // Example: "C2E_STC_QF_BOOK2_T1" → tokens ["STC", "QF"]
      // Tokens are written to variable_performance so the generation engine has
      // real variable-level evidence when building strategy and briefs.
      await updateProgress(runId, 82, "Computing variable performance");
      const isSkippedAdToken = (t: string): boolean =>
        /^[A-Za-z]\d+[A-Za-z]*$/.test(t) || // cell/concept codes: C2, C2E, C2EA
        /^BOOK\d+$/i.test(t) ||              // BOOK0, BOOK2
        /^T\d+$/i.test(t) ||                 // T1, T2 (test round)
        /^\d+$/.test(t);                     // purely numeric tokens

      const varPerfMap = new Map<
        string,
        { spend: number; results: number; linkClicks: number; adCount: number }
      >();
      for (const row of adRows) {
        const tokens = String(row.ad_name ?? "")
          .split("_")
          .map((t) => t.trim().toUpperCase())
          .filter((t) => t.length > 0 && !isSkippedAdToken(t));
        for (const token of tokens) {
          if (!varPerfMap.has(token)) {
            varPerfMap.set(token, { spend: 0, results: 0, linkClicks: 0, adCount: 0 });
          }
          const v = varPerfMap.get(token)!;
          v.spend += Number(row.spend ?? 0);
          v.results += Number(row.results ?? 0);
          v.linkClicks += Number(row.link_clicks ?? 0);
          v.adCount += 1;
        }
      }
      if (varPerfMap.size > 0) {
        // Derive the most common result_type for this account's ad rows
        const rtCounts = new Map<string, number>();
        for (const row of adRows) {
          const rt = String(row.result_type ?? "unknown");
          rtCounts.set(rt, (rtCounts.get(rt) ?? 0) + 1);
        }
        const accountResultType =
          [...rtCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

        // No delete here: variable_performance is run-tagged (manual_analysis_run_id)
        // and retains full history across runs, same reasoning as concept_performance
        // above — a full account wipe here used to destroy every prior run's rollup.

        const varRows = Array.from(varPerfMap.entries()).map(([token, v]) => ({
          account_id: accountId,
          manual_analysis_run_id: runId,
          variable_family: "raw_token",
          variable_id: token,
          result_type: accountResultType,
          date_start: dateStart,
          date_end: dateEnd,
          payload: variablePerformancePayload(token, v, accountResultType),
        }));
        await insertChunked("variable_performance", varRows);
      }

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
      const reconReports: ReportInput[] = reportInputs
        .map((r) => ({ ...r, rows: r.rows.filter((row) => withinRange(row.breakdowns["Day"]!, dateRange, maxDate)) }))
        .filter((r) => r.rows.length > 0);
      const observed = buildObservations(reconReports, { instancesByName });
      const truth = buildTruth(reconReports, { instancesByName, window: { start: dateStart, end: dateEnd } });
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
        const up = await supabase
          .from("creative_assets")
          .upsert(assetRowsOut.slice(i, i + CHUNK), { onConflict: "account_id,ad_identity_kind,ad_identity,asset_type,provenance,content_hash", ignoreDuplicates: false });
        if (up.error) throw new Error(up.error.message);
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
        date_start: b.date,
        date_end: b.date,
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
        date_start: b.date,
        date_end: b.date,
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
        date_start: b.date,
        date_end: b.date,
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
        date_start: b.date,
        date_end: b.date,
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
      const convDeviceBuckets = new Map<string, AggBucket & { device: string; date: string }>();
      for (const row of scopedConversionDevice) {
        const date = row.breakdowns["Day"]!;
        const device = row.breakdowns["Conversion device"]!;
        const dKey = [device, date].join("\u0001");
        if (!convDeviceBuckets.has(dKey)) convDeviceBuckets.set(dKey, { ...emptyBucket(), device, date });
        accumulate(convDeviceBuckets.get(dKey)!, row);
      }
      const convDeviceRowsOut = Array.from(convDeviceBuckets.values()).map((b) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        device: b.device,
        date_start: b.date,
        date_end: b.date,
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
          date_start: dateStart,
          date_end: dateEnd,
          row_index: i,
          payload: {
            cell_id: "ACCOUNT",
            "Ad name": MANUAL_DEMO_AD_NAME,
            Age: b.age,
            Gender: b.gender,
            "Result type": b.resultType,
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
          date_start: dateStart,
          date_end: dateEnd,
          row_index: i,
          payload: {
            Placement: b.placement,
            Platform: b.platform,
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
    const d = byDate.get(date) ?? { date, spend: 0, impressions: 0, link_clicks: 0, results: 0 };
    d.spend       += Number((r as any).spend ?? 0);
    d.impressions += Number((r as any).impressions ?? 0);
    d.link_clicks += Number((r as any).link_clicks ?? 0);
    d.results     += Number((r as any).results ?? 0);
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
    const key = `${book ?? ""}\x01${concept}`;
    const c = conceptMap.get(key) ?? { book, spend: 0, results: 0, link_clicks: 0 };
    c.spend       += Number((r as any).spend ?? 0);
    c.results     += Number((r as any).results ?? 0);
    c.link_clicks += Number((r as any).link_clicks ?? 0);
    conceptMap.set(key, c);
  }
  const concept_rows: AnalysisSummaryConceptRow[] = Array.from(conceptMap.entries()).map(([key, v]) => ({
    concept: key.split("\x01")[1]!,
    book:    v.book,
    spend:   roundN(v.spend),
    results: v.results,
    link_clicks: v.link_clicks,
  }));

  // ── Demographic rows ───────────────────────────────────────────────
  const demoRows = await selectAllRows(
    "demographic_performance",
    (q) => q.eq("account_id", accountId),
    "date_start, age, gender, spend, impressions, results, link_clicks, adds_to_cart, checkouts_initiated, purchases, adds_to_cart_value",
  );

  const demoMap = new Map<string, { spend: number; impressions: number | null; results: number; link_clicks: number; adds_to_cart: number | null; checkouts_initiated: number | null; purchases: number | null; adds_to_cart_value: number | null }>();
  for (const r of demoRows ?? []) {
    if (!withinViewPreset(String((r as any).date_start ?? ""), preset, anchor)) continue;
    const key = `${String((r as any).age ?? "")}|${String((r as any).gender ?? "").toLowerCase()}`;
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
    const [age, gender] = key.split("|");
    return {
      age:        age ?? "",
      gender:     gender ?? "",
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
    "date_start, placement, spend, impressions, link_clicks, results, tracking_basis",
  );

  const placMap = new Map<string, { spend: number; impressions: number; link_clicks: number; results: number }>();
  for (const r of placRows ?? []) {
    if ((r as any).tracking_basis === "conversion") continue; // delivery rows only
    if (!withinViewPreset(String((r as any).date_start ?? ""), preset, anchor)) continue;
    const key = String((r as any).placement ?? "");
    const p = placMap.get(key) ?? { spend: 0, impressions: 0, link_clicks: 0, results: 0 };
    p.spend       += Number((r as any).spend ?? 0);
    p.impressions += Number((r as any).impressions ?? 0);
    p.link_clicks += Number((r as any).link_clicks ?? 0);
    p.results     += Number((r as any).results ?? 0);
    placMap.set(key, p);
  }
  const placement_rows: AnalysisSummaryPlacementRow[] = Array.from(placMap.entries()).map(([placement, v]) => ({
    placement,
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
    const key  = `${book ?? ""}\x01${concept}`;
    const c    = conceptMap.get(key) ?? { book, spend: 0, results: 0, link_clicks: 0 };
    c.spend       += Number((r as any).spend ?? 0);
    c.results     += Number((r as any).results ?? 0);
    c.link_clicks += Number((r as any).link_clicks ?? 0);
    conceptMap.set(key, c);
  }
  const concept_rows: AnalysisSummaryConceptRow[] = Array.from(conceptMap.entries()).map(([key, v]) => ({
    concept: key.split("\x01")[1]!,
    book:    v.book,
    spend:   roundN(v.spend),
    results: v.results,
    link_clicks: v.link_clicks,
  }));

  // ── Demographic rows ──────────────────────────────────────────────
  const demoRows = await selectAllRows(
    "demographic_performance",
    (q) => q.eq("account_id", accountId).gte("date_start", start).lte("date_start", end),
    "date_start, age, gender, spend, impressions, results, link_clicks, adds_to_cart, checkouts_initiated, purchases, adds_to_cart_value",
  );

  const demoMap = new Map<string, { spend: number; impressions: number | null; results: number; link_clicks: number; adds_to_cart: number | null; checkouts_initiated: number | null; purchases: number | null; adds_to_cart_value: number | null }>();
  for (const r of demoRows ?? []) {
    const key = `${String((r as any).age ?? "")}|${String((r as any).gender ?? "").toLowerCase()}`;
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
    const [age, gender] = key.split("|");
    return {
      age: age ?? "",
      gender: gender ?? "",
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
    "date_start, placement, spend, impressions, link_clicks, results, tracking_basis",
  );

  const placMap = new Map<string, { spend: number; impressions: number; link_clicks: number; results: number }>();
  for (const r of placRows ?? []) {
    if ((r as any).tracking_basis === "conversion") continue;
    const key = String((r as any).placement ?? "");
    const p   = placMap.get(key) ?? { spend: 0, impressions: 0, link_clicks: 0, results: 0 };
    p.spend       += Number((r as any).spend ?? 0);
    p.impressions += Number((r as any).impressions ?? 0);
    p.link_clicks += Number((r as any).link_clicks ?? 0);
    p.results     += Number((r as any).results ?? 0);
    placMap.set(key, p);
  }
  const placement_rows: AnalysisSummaryPlacementRow[] = Array.from(placMap.entries()).map(([placement, v]) => ({
    placement,
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
    "date_start, spend, impressions, reach, clicks_all, link_clicks, results",
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
