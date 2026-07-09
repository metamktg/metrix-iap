// ─── Manual-upload analysis engine ─────────────────────────────────────
// Turns staged manual_imports (performance_csv) rows into ad_performance
// rows for a MANUALLY selected date window. Never runs automatically on
// upload — only via an explicit POST from the user (see routes/metrixAnalysis.ts).
//
// Honesty rules (mirror the generation_runs pattern):
//   - A manual_analysis_runs row is inserted as 'running' and flips to
//     'success' only after every ad_performance row has committed.
//   - On any failure, partial ad_performance rows this run wrote are
//     deleted and the run is marked 'error' — no dishonest success states.
//   - Re-running replaces this manual account's ad_performance rows within
//     the selected window (full refresh, not merge) — manual accounts are
//     never touched by the offline importer, so this is always safe.
//   - The resolved date_start/date_end (from the data itself, not "today")
//     are recorded on the run so the report states exactly which dates
//     were analyzed.

import { getSupabase } from "./supabase";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";
import { logger } from "./logger";
import {
  parseManualPerformanceCsv,
  ManualCsvFormatError,
  type ManualPerformanceRow,
} from "./manualPerformanceCsv";

export const STALE_ANALYSIS_RUN_MS = 10 * 60 * 1000;

export type DateRangePreset = "7d" | "14d" | "30d" | "all";

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
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
};

type Row = Record<string, any>;

const runShape = (r: Row): ManualAnalysisRun => ({
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
});

async function accountExists(accountId: string): Promise<Row | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("ad_accounts").select("id, name").eq("id", accountId).limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0]! : null;
}

/** Latest run for an account, with dead 'running' rows honestly flipped to error. */
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
  if (!row) return null;
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
  fields: { errorMessage?: string; dateStart?: string; dateEnd?: string; rowsIngested?: number; importsUsed?: number },
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("manual_analysis_runs")
    .update({
      status,
      error_message: fields.errorMessage ?? null,
      date_start: fields.dateStart ?? null,
      date_end: fields.dateEnd ?? null,
      rows_ingested: fields.rowsIngested ?? null,
      imports_used: fields.importsUsed ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

/** Deletes ad_performance rows this specific run wrote (partial-output cleanup on failure/staleness). */
async function deleteRunOutputs(runId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("ad_performance").delete().eq("manual_analysis_run_id", runId);
  if (error) throw new Error(error.message);
}

function withinRange(date: string, dateRange: DateRangePreset, maxDate: string): boolean {
  if (dateRange === "all") return true;
  const days = dateRange === "7d" ? 7 : dateRange === "14d" ? 14 : 30;
  const max = new Date(`${maxDate}T00:00:00Z`).getTime();
  const cutoff = max - (days - 1) * 24 * 60 * 60 * 1000;
  const d = new Date(`${date}T00:00:00Z`).getTime();
  return d >= cutoff && d <= max;
}

/**
 * Validates prerequisites (a manual account with at least one staged
 * performance_csv import) and starts an analysis run. Returns the run id
 * immediately; parsing continues in the background and the run row
 * records the outcome.
 */
export async function startManualAnalysis(
  accountId: string,
  dateRange: DateRangePreset,
  createdBy: string,
): Promise<string> {
  const account = await accountExists(accountId);
  if (!account) throw new AnalysisError("Ad account not found.", 404);

  const supabase = getSupabase();
  const { data: imports, error: importsErr } = await supabase
    .from("manual_imports")
    .select("id, filename, content, kind")
    .eq("account_id", accountId)
    .eq("kind", "performance_csv");
  if (importsErr) throw new Error(importsErr.message);
  if (!imports || imports.length === 0) {
    throw new AnalysisError(
      "No performance CSV has been staged for this account yet. Upload one before running analysis.",
      422,
    );
  }

  const runId = await startRun(accountId, dateRange, createdBy);

  void (async () => {
    try {
      // Parse every staged performance CSV; a single malformed file fails
      // the whole run with an actionable message naming the file.
      const allRows: ManualPerformanceRow[] = [];
      for (const imp of imports) {
        const hex = String(imp["content"]).replace(/^\\x/, "");
        const text = Buffer.from(hex, "hex").toString("utf8");
        try {
          allRows.push(...parseManualPerformanceCsv(text));
        } catch (err) {
          const detail = err instanceof ManualCsvFormatError ? err.message : String(err);
          throw new AnalysisError(`"${imp["filename"]}": ${detail}`, 422);
        }
      }

      const maxDate = allRows.reduce((max, r) => (r.date > max ? r.date : max), allRows[0]!.date);
      const scoped = allRows.filter((r) => withinRange(r.date, dateRange, maxDate));
      if (scoped.length === 0) {
        throw new AnalysisError(
          `No rows fall within the selected "${dateRange}" window (latest data is ${maxDate}). Try "all" or a wider range.`,
          422,
        );
      }
      const dateStart = scoped.reduce((min, r) => (r.date < min ? r.date : min), scoped[0]!.date);
      const dateEnd = scoped.reduce((max, r) => (r.date > max ? r.date : max), scoped[0]!.date);

      // Full refresh of this manual account's ad_performance within the
      // selected window — safe because manual accounts are never written
      // to by the offline importer.
      const del = await supabase
        .from("ad_performance")
        .delete()
        .eq("account_id", accountId)
        .gte("date_start", dateStart)
        .lte("date_end", dateEnd);
      if (del.error) throw new Error(del.error.message);

      const insertRows = scoped.map((r) => ({
        account_id: accountId,
        campaign_name: r.campaign_name,
        ad_set_name: r.ad_set_name,
        ad_name: r.ad_name,
        result_type: r.result_type,
        date_start: r.date,
        date_end: r.date,
        spend: r.spend,
        impressions: r.impressions,
        reach: r.reach,
        clicks_all: r.clicks_all,
        link_clicks: r.link_clicks,
        results: r.results,
        cpa: r.cpa,
        ctr_link_pct: r.ctr_link_pct,
        cvr_link_pct: r.cvr_link_pct,
        cpm: r.cpm,
        manual_analysis_run_id: runId,
      }));

      // Chunk inserts to stay well under request size limits.
      const CHUNK = 500;
      for (let i = 0; i < insertRows.length; i += CHUNK) {
        const ins = await supabase.from("ad_performance").insert(insertRows.slice(i, i + CHUNK));
        if (ins.error) throw new Error(ins.error.message);
      }

      await supabase
        .from("ad_accounts")
        .update({
          status: "configured",
          overview_state: {
            title: "Analysis complete",
            description: `Manual analysis processed ${scoped.length} row(s) from ${imports.length} file(s), covering ${dateStart} to ${dateEnd} (${dateRange === "all" ? "all uploaded dates" : dateRange} window). Re-run analysis after uploading new reports.`,
          },
        })
        .eq("id", accountId);

      await finishRun(runId, "success", {
        dateStart,
        dateEnd,
        rowsIngested: scoped.length,
        importsUsed: imports.length,
      });
      invalidateMetrixSeedCache();
      logger.info({ accountId, runId, rows: scoped.length, dateStart, dateEnd }, "Manual analysis run succeeded");
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
