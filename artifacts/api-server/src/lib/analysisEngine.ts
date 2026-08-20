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

import { getSupabase } from "./supabase";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";
import { logger } from "./logger";
import { parseIapCsv, IapCsvFormatError, type IapCsvRow } from "./iapCsvParser";
import type { IapCsvClass } from "./iapCsvSpec";
import { detectCsvClassFromHeaders, checkDuplicateCsvClasses, iapCsvClassLabel, optionalMetricSlugsForGroups, type ObjectiveColumnGroup } from "./iapCsvSpec";
import { resolveAccountObjectives } from "./cohortConfig";
import { computeObjectiveCoverage, OBJECTIVE_GROUP_FOR_KEY } from "./objectiveCoverage";
import { convertXlsxToCsvText, looksLikeXlsxContent } from "./xlsxToCsv";
import { extensionOf } from "./creativeAssetType";


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
  /** Configured objectives whose column groups were present and assessed this run. Null on legacy/pre-objectives runs. */
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
  const { data, error } = await supabase.from("ad_accounts").select("id, name, cohort, objectives").eq("id", accountId).limit(1);
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

/** Latest run for an account, with dead 'running' rows honestly flipped to error.
 * Falls back to synthesizing a run from report_pulls when no manual run exists
 * (live-Meta accounts store their analysis results there instead). */
export async function listAnalysisRuns(accountId: string): Promise<ManualAnalysisRun[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("manual_analysis_runs")
    .select("*")
    .eq("account_id", accountId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map(runShape);
}

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
  if (row["status"] === "running" && Date.now() - new Date(row["started_at"]).getTime() > STALE_ANALYSIS_RUN_MS) {
    const { data: updated, error: updErr } = await supabase
      .from("manual_analysis_runs")
      .update({
        status: "error",
        error_message: "The analysis run did not finish (server restarted or timed out). Try again.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", row["id"])
      .eq("status", "running")
      .select("*");
    if (updErr) throw new Error(updErr.message);
    await deleteRunOutputs(String(row["id"]));
    return runShape(updated?.[0] ?? { ...row, status: "error" });
  }
  return runShape(row);
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
  const runId = latestRun ? String(latestRun["id"]) : null;
  const runStatus: AnalysisCompleteness["run_status"] = latestRun
    ? (latestRun["status"] as AnalysisCompleteness["run_status"])
    : "none";

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
  const complete = runId
    ? runStatus === "success" && requiredOk
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
 * Decodes a staged manual_imports row's content into canonical CSV text,
 * transparently converting XLSX workbooks (detected by filename extension or
 * ZIP magic bytes, same rule as the upload route) into the exact CSV text
 * shape parseIapCsv() expects — see xlsxToCsv.ts. Returns any XLSX
 * conversion-time warnings (e.g. the Ad/Ad set/Campaign ID precision-loss
 * guard) alongside the text so callers can fold them into csv_warnings the
 * same way parseIapCsv's own warnings already are.
 */
async function decodeStagedContentAsCsvText(
  hexOrRaw: string,
  filename: string,
): Promise<{ text: string; warnings: string[] }> {
  const buf = decodeStagedContentBuffer(hexOrRaw);
  if (extensionOf(filename) === "xlsx" || looksLikeXlsxContent(buf)) {
    const converted = await convertXlsxToCsvText(buf);
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

  const adsResult = await supabase
    .from("ads")
    .select("ad_name")
    .eq("account_id", accountId)
    .not("creative_asset_url", "is", null)
    .in("ad_name", allMappedNames);
  if (adsResult.error) throw new Error(adsResult.error.message);

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

  const supabase = getSupabase();
  // status='staged' is load-bearing, not an optimization: a prior successful
  // run destages the CSVs it consumed to 'processed' (see markImportsProcessed)
  // specifically so the NEXT run starts from an empty staging area. Without
  // this filter, every subsequent run on an account would silently re-pull
  // every CSV ever uploaded — not just the newly staged batch — and merge
  // their rows together, double-counting spend/impressions/results for any
  // date that appears in more than one file (virtually certain for "all" and
  // for any overlapping weekly/monthly re-export).
  const { data: imports, error: importsErr } = await supabase
    .from("manual_imports")
    .select("id, filename, content, kind")
    .eq("account_id", accountId)
    .eq("status", "staged")
    .in("kind", ["performance_demo_csv", "performance_placement_csv", "performance_ad_summary_csv", "performance_conversion_device_csv"]);
  if (importsErr) throw new Error(importsErr.message);

  const demoImports = (imports ?? []).filter((i) => i["kind"] === "performance_demo_csv");
  const placementImports = (imports ?? []).filter((i) => i["kind"] === "performance_placement_csv");
  const summaryImports = (imports ?? []).filter((i) => i["kind"] === "performance_ad_summary_csv");
  const conversionDeviceImports = (imports ?? []).filter((i) => i["kind"] === "performance_conversion_device_csv");
  if (demoImports.length === 0 || placementImports.length === 0) {
    const missing = [
      demoImports.length === 0 ? "Demographics export" : null,
      placementImports.length === 0 ? "Placements export" : null,
    ].filter(Boolean);
    throw new AnalysisError(
      `Both reports are required before running analysis. Missing: ${missing.join(" and ")}.`,
      422,
    );
  }

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
      const { text } = await decodeStagedContentAsCsvText(String(imp["content"]), String(imp["filename"]));
      return detectCsvClassFromHeaders(csvFirstLineHeaders(text));
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
    const deliveryImports: { filename: string; content: string; csvClass: IapCsvClass }[] = [
      ...demoImports.map((i) => ({ filename: String(i["filename"]), content: String(i["content"]), csvClass: "demographic" as IapCsvClass })),
      ...placementImports.map((i) => ({ filename: String(i["filename"]), content: String(i["content"]), csvClass: "device_placement" as IapCsvClass })),
      ...summaryImports.map((i) => ({ filename: String(i["filename"]), content: String(i["content"]), csvClass: "ad_summary" as IapCsvClass })),
    ];
    const suspectFiles: string[] = [];
    for (const imp of deliveryImports) {
      try {
        const { text } = await decodeStagedContentAsCsvText(imp.content, imp.filename);
        const result = parseIapCsv(text, imp.csvClass);
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

  void (async () => {
    try {
      await updateProgress(runId, 5, "Parsing demographics export");
      const allCsvWarnings: string[] = [];
      // Objective column groups seen across ALL staged files this run —
      // compared against the account's configured objectives (Settings →
      // General) to decide what gets assessed vs flagged. Never blocks.
      const objectiveGroupsPresent = new Set<ObjectiveColumnGroup>();
      const demoRows: IapCsvRow[] = [];
      for (const imp of demoImports) {
        try {
          const { text, warnings: xlsxWarnings } = await decodeStagedContentAsCsvText(String(imp["content"]), String(imp["filename"]));
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Demographics "${imp["filename"]}"] ${w}`);
          const result = parseIapCsv(text, "demographic");
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          demoRows.push(...result.rows);
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
      for (const imp of placementImports) {
        try {
          const { text, warnings: xlsxWarnings } = await decodeStagedContentAsCsvText(String(imp["content"]), String(imp["filename"]));
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Placements "${imp["filename"]}"] ${w}`);
          const result = parseIapCsv(text, "device_placement");
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          placementRows.push(...result.rows);
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
      for (const imp of summaryImports) {
        try {
          const { text, warnings: xlsxWarnings } = await decodeStagedContentAsCsvText(String(imp["content"]), String(imp["filename"]));
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Ad Summary "${imp["filename"]}"] ${w}`);
          const result = parseIapCsv(text, "ad_summary");
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          summaryRows.push(...result.rows);
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Ad Summary "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Ad Summary file "${imp["filename"]}": ${detail}`, 422);
        }
      }

      // Optional: conversion device export (one row per ad/device per day, conversion-only metrics).
      // These rows carry only conversion data (no spend/impressions) and are stored in
      // device_performance with tracking_basis='conversion' and device_kind='conversion'.
      if (conversionDeviceImports.length > 0) {
        await updateProgress(runId, 42, "Parsing conversion device export");
      }
      const conversionDeviceRows: IapCsvRow[] = [];
      for (const imp of conversionDeviceImports) {
        try {
          const { text, warnings: xlsxWarnings } = await decodeStagedContentAsCsvText(String(imp["content"]), String(imp["filename"]));
          for (const w of xlsxWarnings) allCsvWarnings.push(`[Conversion Device "${imp["filename"]}"] ${w}`);
          const result = parseIapCsv(text, "conversion_device");
          for (const g of result.objectiveColumnGroupsPresent) objectiveGroupsPresent.add(g);
          conversionDeviceRows.push(...result.rows);
          for (const w of result.warnings) {
            allCsvWarnings.push(`[Conversion Device "${imp["filename"]}"] ${w}`);
          }
        } catch (err) {
          const detail = err instanceof IapCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`Conversion Device file "${imp["filename"]}": ${detail}`, 422);
        }
      }

      // ── Apply objective coverage to ingestion ──────────────────────────
      // Only the account's CONFIGURED objectives (Settings → General) get
      // assessed: optional-metric columns belonging to an unconfigured
      // objective are dropped here, BEFORE any aggregation or persistence,
      // so they can never flow into analysis tables, reports, or exports.
      // Their presence still produces a non-blocking enable-suggestion flag
      // via computeObjectiveCoverage (groups were recorded at parse time).
      const configuredObjectives = resolveAccountObjectives(account);
      const allowedOptionalSlugs = optionalMetricSlugsForGroups(
        configuredObjectives.map((k) => OBJECTIVE_GROUP_FOR_KEY[k]),
      );
      for (const rows of [demoRows, placementRows, summaryRows, conversionDeviceRows]) {
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
      ];
      const maxDate = allDates.reduce((max, d) => (d > max ? d : max), allDates[0]!);

      const scopedDemo = demoRows.filter((r) => withinRange(r.breakdowns["Day"]!, dateRange, maxDate));
      const scopedPlacement = placementRows.filter((r) => withinRange(r.breakdowns["Day"]!, dateRange, maxDate));
      const scopedSummary = summaryRows.filter((r) => withinRange(r.breakdowns["Day"]!, dateRange, maxDate));
      if (scopedDemo.length === 0 || scopedPlacement.length === 0) {
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

      // ── Ad-level supplementary aggregation from demo export ────────────
      // The demographic export reliably carries spend/results/result_type per
      // ad; the device/placement export is often impression-only (especially
      // Meta's "Impression device" breakdown). Build a per-(campaign, ad, date)
      // roll-up from the demo CSV so we can fill in spend and result_type when
      // the placement export has no financial data.
      const demoAdBuckets = new Map<
        string,
        AggBucket & { campaign: string; adSet: string; adName: string; date: string }
      >();
      for (const row of scopedDemo) {
        const campaign = row.breakdowns["Campaign name"]!;
        const adSet = row.breakdowns["Ad set name"] ?? "";
        const adName = row.breakdowns["Ad name"]!;
        const date = row.breakdowns["Day"]!;
        const key = [campaign, adName, date].join("\u0001");
        if (!demoAdBuckets.has(key)) {
          demoAdBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, date });
        }
        accumulate(demoAdBuckets.get(key)!, row);
      }

      // ── Ad-level aggregation from ad_summary export (full spend) ────────
      // The ad_summary export has one row per ad per day and carries spend
      // unaffected by iOS privacy limits (unlike the demographic export which
      // only shows demographically-attributable spend). When present, it becomes
      // the primary spend source for ad_performance rows.
      const summaryAdBuckets = new Map<
        string,
        AggBucket & { campaign: string; adSet: string; adName: string; date: string }
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
        const key = [campaign, adName, date].join("\u0001");
        if (!summaryAdBuckets.has(key)) {
          summaryAdBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, date });
        }
        accumulate(summaryAdBuckets.get(key)!, row);
        // Collect creative metadata (merge, keeping first non-empty value per column)
        if (row.creativeMetadata && Object.keys(row.creativeMetadata).length > 0) {
          const existing = adCreativeMetadata.get(adName) ?? {};
          for (const [col, val] of Object.entries(row.creativeMetadata)) {
            if (!existing[col] && val) existing[col] = val;
          }
          adCreativeMetadata.set(adName, existing);
        }
      }

      // ── Ad-level rows (ad_performance): aggregate the placement export
      // across its device/platform/placement dimensions to a per-ad/day row.
      // Spend/results/resultType are filled from the demo aggregation when
      // the placement export is an impression-only device-breakdown export.
      const adBuckets = new Map<string, AggBucket & { campaign: string; adSet: string; adName: string; resultType: string; date: string }>();
      for (const row of scopedPlacement) {
        const campaign = row.breakdowns["Campaign name"]!;
        const adSet = row.breakdowns["Ad set name"] ?? "";
        const adName = row.breakdowns["Ad name"]!;
        const date = row.breakdowns["Day"]!;
        const key = [campaign, adName, date].join("\u0001");
        if (!adBuckets.has(key)) {
          adBuckets.set(key, { ...emptyBucket(), campaign, adSet, adName, resultType: "", date });
        }
        accumulate(adBuckets.get(key)!, row);
      }
      // Supplement from the ad_summary (preferred) then demo aggregation:
      // fill spend/results/resultType for any ad bucket the placement export
      // left financially empty. Priority: summary > demo > null.
      let unknownResultTypeRows = 0;
      for (const b of adBuckets.values()) {
        const adKey = [b.campaign, b.adName, b.date].join("\u0001");
        const summary = summaryAdBuckets.get(adKey);
        const demo = demoAdBuckets.get(adKey);
        const preferred = summary ?? demo;
        if (preferred) {
          if (b.spend === null) b.spend = preferred.spend;
          if (b.results === null) b.results = preferred.results;
          if (!b.resultType) b.resultType = preferred.resultType ?? "";
          if (b.linkClicks === null) b.linkClicks = preferred.linkClicks;
          if (b.clicksAll === null) b.clicksAll = preferred.clicksAll;
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
      for (const [key, sum] of summaryAdBuckets) {
        if (!adBuckets.has(key)) {
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
      if (unknownResultTypeRows > 0) {
        allCsvWarnings.push(
          `[Result type] ${unknownResultTypeRows} ad/day row(s) had no result type in any export — recorded as "unknown" rather than a real conversion event.`,
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

      // Full refresh of this manual account's output rows within the
      // selected window — safe because manual accounts are never written
      // to by the offline importer.
      await updateProgress(runId, 62, "Clearing previous data window");
      const del1 = await supabase
        .from("ad_performance")
        .delete()
        .eq("account_id", accountId)
        .gte("date_start", dateStart)
        .lte("date_end", dateEnd);
      if (del1.error) throw new Error(del1.error.message);
      for (const table of [
        "demographic_performance",
        "placement_performance",
        "platform_performance",
        "device_performance",
      ]) {
        const del = await supabase
          .from(table)
          .delete()
          .eq("account_id", accountId)
          .gte("date_start", dateStart)
          .lte("date_end", dateEnd);
        if (del.error) throw new Error(del.error.message);
      }

      const CHUNK = 500;
      const insertChunked = async (table: string, rows: Record<string, any>[]) => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const ins = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
          if (ins.error) throw new Error(ins.error.message);
        }
      };

      await updateProgress(runId, 68, "Writing ad performance rows");
      const adRows = Array.from(adBuckets.values()).map((b) => {
        const creativeMeta = adCreativeMetadata.get(b.adName);
        return {
          account_id: accountId,
          campaign_name: b.campaign,
          ad_set_name: b.adSet || null,
          ad_name: b.adName,
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
      const conceptMap = new Map<string, { book: string | null; concept: string; spend: number; results: number; linkClicks: number }>();
      for (const row of adRows) {
        const concept = extractConcept(String(row.ad_name ?? ""));
        if (!concept) continue;
        const book = extractBook(String(row.ad_name ?? ""));
        const cKey = [book ?? "", concept].join("\u0001");
        if (!conceptMap.has(cKey)) {
          conceptMap.set(cKey, { book, concept, spend: 0, results: 0, linkClicks: 0 });
        }
        const c = conceptMap.get(cKey)!;
        c.spend += Number(row.spend ?? 0);
        c.results += Number(row.results ?? 0);
        c.linkClicks += Number(row.link_clicks ?? 0);
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
          let confidenceLevel: string;
          if (c.spend >= 500 && c.results >= 30) confidenceLevel = "high";
          else if (c.spend >= 100 && c.results >= 5) confidenceLevel = "medium";
          else if (c.spend > 0 && c.results >= 1) confidenceLevel = "low";
          else confidenceLevel = "validation_required";

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

        const varRows = Array.from(varPerfMap.entries()).map(([token, v]) => {
          const cpa = v.results > 0 ? v.spend / v.results : null;
          const cvrLinkPct =
            v.linkClicks > 0 && v.results > 0 ? (v.results / v.linkClicks) * 100 : null;
          return {
            account_id: accountId,
            manual_analysis_run_id: runId,
            variable_family: "raw_token",
            variable_id: token,
            result_type: accountResultType,
            date_start: dateStart,
            date_end: dateEnd,
            payload: {
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
              CTR_link_pct: cvrLinkPct ?? 0,
              Result_per_link_click_pct: cvrLinkPct ?? 0,
            },
          };
        });
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
        const adRegistryRows = uniqueAdNames.map((adName) => ({
          account_id: accountId,
          ad_name: adName,
          cell: extractCell(adName),
          concept: extractConcept(adName),
          book: extractBook(adName),
        }));
        // IMPORTANT: ignoreDuplicates: true is critical here — it preserves
        // creative_asset_url and asset_filename on existing rows so any
        // previously synced creative links survive a re-import or re-analysis.
        // Never change this to ignoreDuplicates: false (or a merge-mode upsert
        // without explicit column selection), as it would wipe those URLs and
        // cause every library card to regress to the "No asset" placeholder.
        // If you must update other columns on conflict, add them explicitly to
        // an onConflictDoUpdate merge list and keep creative_asset_url OUT of it.
        const adsUpsert = await supabase
          .from("ads")
          .upsert(adRegistryRows, { onConflict: "account_id,ad_name", ignoreDuplicates: true });
        if (adsUpsert.error) throw new Error(adsUpsert.error.message);

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

      await updateProgress(runId, 90, "Writing demographic & placement data");
      const demographicRows = Array.from(demoBuckets.values()).map((b) => ({
        account_id: accountId,
        manual_analysis_run_id: runId,
        gender: b.gender,
        age: b.age,
        date_start: b.date,
        date_end: b.date,
        spend: b.spend,
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

      await insertChunked("device_performance", [...deviceRowsOut, ...convDeviceRowsOut]);

      const totalRows = adRows.length + demographicRows.length + placementRowsOut.length + platformRowsOut.length + deviceRowsOut.length + convDeviceRowsOut.length;

      await updateProgress(runId, 97, "Finalizing");
      await supabase
        .from("ad_accounts")
        .update({
          status: "configured",
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
      const coverage = computeObjectiveCoverage(configuredObjectives, objectiveGroupsPresent);

      await finishRun(runId, "success", {
        dateStart,
        dateEnd,
        rowsIngested: totalRows,
        importsUsed: imports!.length,
        csvWarnings: allCsvWarnings.length > 0 ? allCsvWarnings : undefined,
        objectivesAssessed: coverage.assessed,
        objectiveFlags: coverage.flags.length > 0 ? coverage.flags : undefined,
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

export async function getAnalysisSummaryByPreset(
  accountId: string,
  preset: ViewPreset,
): Promise<AnalysisSummaryResult> {
  const supabase = getSupabase();

  // ── Fetch ad_performance rows ─────────────────────────────────────
  const { data: adRows, error: adErr } = await supabase
    .from("ad_performance")
    .select("date_start, spend, impressions, link_clicks, results, result_type, reach, clicks_all, ad_name")
    .eq("account_id", accountId);
  if (adErr) throw new Error(adErr.message);

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
  const { data: demoRows, error: demoErr } = await supabase
    .from("demographic_performance")
    .select("date_start, age, gender, spend, results, link_clicks, adds_to_cart, checkouts_initiated, purchases, adds_to_cart_value")
    .eq("account_id", accountId);
  if (demoErr) throw new Error(demoErr.message);

  const demoMap = new Map<string, { spend: number; results: number; link_clicks: number; adds_to_cart: number | null; checkouts_initiated: number | null; purchases: number | null; adds_to_cart_value: number | null }>();
  for (const r of demoRows ?? []) {
    if (!withinViewPreset(String((r as any).date_start ?? ""), preset, anchor)) continue;
    const key = `${String((r as any).age ?? "")}|${String((r as any).gender ?? "").toLowerCase()}`;
    const d = demoMap.get(key) ?? { spend: 0, results: 0, link_clicks: 0, adds_to_cart: null, checkouts_initiated: null, purchases: null, adds_to_cart_value: null };
    d.spend       += Number((r as any).spend ?? 0);
    d.results     += Number((r as any).results ?? 0);
    d.link_clicks += Number((r as any).link_clicks ?? 0);
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
      results:    v.results,
      link_clicks: v.link_clicks,
      adds_to_cart: v.adds_to_cart,
      checkouts_initiated: v.checkouts_initiated,
      purchases: v.purchases,
      adds_to_cart_value: v.adds_to_cart_value,
    };
  });

  // ── Placement rows (delivery-based only) ──────────────────────────
  const { data: placRows, error: placErr } = await supabase
    .from("placement_performance")
    .select("date_start, placement, spend, impressions, link_clicks, results, tracking_basis")
    .eq("account_id", accountId);
  if (placErr) throw new Error(placErr.message);

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
  const { data: adRows, error: adErr } = await supabase
    .from("ad_performance")
    .select("date_start, spend, impressions, link_clicks, results, result_type, reach, clicks_all, ad_name")
    .eq("account_id", accountId)
    .gte("date_start", start)
    .lte("date_start", end);
  if (adErr) throw new Error(adErr.message);

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
  const { data: demoRows, error: demoErr } = await supabase
    .from("demographic_performance")
    .select("date_start, age, gender, spend, results, link_clicks, adds_to_cart, checkouts_initiated, purchases, adds_to_cart_value")
    .eq("account_id", accountId)
    .gte("date_start", start)
    .lte("date_start", end);
  if (demoErr) throw new Error(demoErr.message);

  const demoMap = new Map<string, { spend: number; results: number; link_clicks: number; adds_to_cart: number | null; checkouts_initiated: number | null; purchases: number | null; adds_to_cart_value: number | null }>();
  for (const r of demoRows ?? []) {
    const key = `${String((r as any).age ?? "")}|${String((r as any).gender ?? "").toLowerCase()}`;
    const d   = demoMap.get(key) ?? { spend: 0, results: 0, link_clicks: 0, adds_to_cart: null, checkouts_initiated: null, purchases: null, adds_to_cart_value: null };
    d.spend       += Number((r as any).spend ?? 0);
    d.results     += Number((r as any).results ?? 0);
    d.link_clicks += Number((r as any).link_clicks ?? 0);
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
      results: v.results,
      link_clicks: v.link_clicks,
      adds_to_cart: v.adds_to_cart,
      checkouts_initiated: v.checkouts_initiated,
      purchases: v.purchases,
      adds_to_cart_value: v.adds_to_cart_value,
    };
  });

  // ── Placement rows ────────────────────────────────────────────────
  const { data: placRows, error: placErr } = await supabase
    .from("placement_performance")
    .select("date_start, placement, spend, impressions, link_clicks, results, tracking_basis")
    .eq("account_id", accountId)
    .gte("date_start", start)
    .lte("date_start", end);
  if (placErr) throw new Error(placErr.message);

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
  const { data: priorRows, error: priorErr } = await supabase
    .from("ad_performance")
    .select("date_start, spend, impressions, link_clicks, results, result_type, reach, clicks_all")
    .eq("account_id", accountId)
    .gte("date_start", pw.start)
    .lte("date_start", pw.end);
  if (priorErr) throw new Error(priorErr.message);
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

  const { data, error } = await supabase
    .from("ad_performance")
    .select("date_start, spend")
    .eq("account_id", accountId)
    .order("date_start");
  if (error) throw new AnalysisError(error.message, 500);
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
