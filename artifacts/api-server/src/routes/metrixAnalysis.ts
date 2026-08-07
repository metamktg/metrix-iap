// ─── Manual-upload analysis routes ─────────────────────────────────────
// Lets a user manually trigger analysis of their staged performance CSVs
// for a chosen date window (7d/14d/30d/all). Analysis NEVER runs
// automatically on upload — only from this explicit POST.

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { userHasAccountAccess } from "./metrix";
import {
  AnalysisError,
  getLatestAnalysisRun,
  listAnalysisRuns,
  startManualAnalysis,
  syncAllCreativeLinksForAccount,
  computeCreativeLinkageSummary,
  getAnalysisSummaryByPreset,
  getAnalysisSummaryByRunId,
  getAnalysisSummaryByDateRange,
  getAccountAnalysisDataWindows,
  VIEW_PRESETS,
  type DateRangePreset,
  type ViewPreset,
} from "../lib/analysisEngine";
import { buildIapCsvClassFormat, COLUMN_ALIASES } from "../lib/iapCsvSpec";

import { getSupabase } from "../lib/supabase";
import { invalidateMetrixSeedCache } from "../lib/metrixSeedAssembly";

const router: IRouter = Router();

const DATE_RANGES: DateRangePreset[] = ["7d", "14d", "30d", "all"];

function sendAnalysisError(res: any, err: unknown): void {
  if (err instanceof AnalysisError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  res.status(502).json({
    message: err instanceof Error ? err.message : "Analysis could not be started.",
  });
}

async function guardAccess(req: any, res: any, accountId: string): Promise<boolean> {
  const user = req.authUser!;
  if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
    res.status(403).json({ message: "You don't have access to this ad account." });
    return false;
  }
  return true;
}

/**
 * The five canonical columns most commonly exported under wrong names from
 * Meta Ads Manager. Aliases are derived from COLUMN_ALIASES grouped by their
 * canonical target — no duplication; the parser logic stays in iapCsvSpec.ts.
 *
 * "Amount spent ({ACCOUNT_CURRENCY})" is presented without the currency
 * placeholder since that detail is already explained in the column list above.
 */
const ALIAS_GUIDE_CANONICALS: string[] = [
  "Day",
  "Amount spent ({ACCOUNT_CURRENCY})",
  "Link clicks",
  "ThruPlays",
  "Reach",
];

function buildColumnAliasGuide(): { canonical: string; aliases: string[] }[] {
  return ALIAS_GUIDE_CANONICALS.map((canonical) => {
    const aliases = Object.entries(COLUMN_ALIASES)
      .filter(([, target]) => target === canonical)
      .map(([alias]) => alias.charAt(0).toUpperCase() + alias.slice(1));
    return {
      canonical: canonical.replace(" ({ACCOUNT_CURRENCY})", ""),
      aliases,
    };
  }).filter((g) => g.aliases.length > 0);
}

router.get("/metrix/manual-performance-csv-format", requireAuth, (_req, res) => {
  res.json({
    demographic: buildIapCsvClassFormat("demographic"),
    device_placement: buildIapCsvClassFormat("device_placement"),
    ad_summary: buildIapCsvClassFormat("ad_summary"),
    conversion_device: buildIapCsvClassFormat("conversion_device"),
    column_aliases: buildColumnAliasGuide(),
  });
});

// ─── Run-scoped summary (IAP run picker) ─────────────────────────────────────
// Scopes the summary to the date window of a specific manual_analysis_run.
// Must be registered BEFORE the :preset route to prevent Express matching
// "run" as a preset value.
router.get("/metrix/accounts/:accountId/analysis-summary/run/:runId", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const runId     = String(req.params["runId"] ?? "");
  if (!runId) {
    res.status(400).json({ message: "runId is required." });
    return;
  }
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const result = await getAnalysisSummaryByRunId(accountId, runId);
    res.json(result);
  } catch (err) {
    if (err instanceof AnalysisError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    req.log.error({ err, accountId, runId }, "Failed to compute analysis summary by run");
    res.status(502).json({ message: err instanceof Error ? err.message : "Could not compute analysis summary." });
  }
});

// ─── Date-range summary ───────────────────────────────────────────────────────
// Caller passes explicit ?start=YYYY-MM-DD&end=YYYY-MM-DD query params.
// Used by DataWindowBar for both single-window and monthly-bucket selections.
// Must be registered BEFORE the :preset wildcard route.
router.get("/metrix/accounts/:accountId/analysis-summary/daterange/:start/:end", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const start     = String(req.params["start"] ?? "");
  const end       = String(req.params["end"]   ?? "");
  if (!start || !end) {
    res.status(400).json({ message: "start and end query params are required (YYYY-MM-DD)." });
    return;
  }
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const result = await getAnalysisSummaryByDateRange(accountId, start, end);
    res.json(result);
  } catch (err) {
    if (err instanceof AnalysisError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    req.log.error({ err, accountId, start, end }, "Failed to compute date-range analysis summary");
    res.status(502).json({ message: err instanceof Error ? err.message : "Could not compute analysis summary." });
  }
});

// ─── Data-window discovery ────────────────────────────────────────────────────
// Returns the actual available date windows for an account, derived from
// ad_performance data (not run metadata). Used by DataWindowBar on the
// Analysis Overview to populate filter options.
router.get("/metrix/accounts/:accountId/analysis-data-windows", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const result = await getAccountAnalysisDataWindows(accountId);
    res.json(result);
  } catch (err) {
    if (err instanceof AnalysisError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    req.log.error({ err, accountId }, "Failed to get analysis data windows");
    res.status(502).json({ message: err instanceof Error ? err.message : "Could not fetch data windows." });
  }
});

// ─── View-level date preset summary ──────────────────────────────────────────
// Re-aggregates from daily ad_performance / demographic_performance /
// placement_performance rows for the chosen preset window. Anchored to the
// latest date_start in stored rows — not wall-clock time.
router.get("/metrix/accounts/:accountId/analysis-summary/:preset", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const preset = String(req.params["preset"] ?? "") as ViewPreset;
  if (!VIEW_PRESETS.includes(preset)) {
    res.status(400).json({ message: `preset must be one of: ${VIEW_PRESETS.join(", ")}.` });
    return;
  }
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const result = await getAnalysisSummaryByPreset(accountId, preset);
    res.json(result);
  } catch (err) {
    req.log.error({ err, accountId, preset }, "Failed to compute analysis summary by preset");
    res.status(502).json({ message: err instanceof Error ? err.message : "Could not compute analysis summary." });
  }
});

router.get("/metrix/accounts/:accountId/analysis-runs", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const runs = await listAnalysisRuns(accountId);
    res.json({ runs });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to list analysis runs");
    res.status(502).json({ message: err instanceof Error ? err.message : "Could not list analysis runs." });
  }
});

router.post("/metrix/accounts/:accountId/analysis-runs", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const dateRange = req.body?.["date_range"];
  if (!DATE_RANGES.includes(dateRange)) {
    res.status(400).json({ message: "date_range must be one of: 7d, 14d, 30d, all." });
    return;
  }
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const runId = await startManualAnalysis(accountId, dateRange, req.authUser!.email);
    req.log.info({ accountId, runId, dateRange }, "Manual analysis run started");
    res.status(202).json({ run_id: runId });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to start manual analysis run");
    sendAnalysisError(res, err);
  }
});

router.get("/metrix/accounts/:accountId/analysis-runs/latest", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const run = await getLatestAnalysisRun(accountId);
    // Enrich a settled run with live creative linkage status so the UI can
    // show "X of Y creatives linked" without a separate roundtrip. Computed
    // from current DB state so it reflects any re-syncs that happened after
    // the run finished. Non-fatal: a linkage query failure must not prevent
    // the run status from being returned.
    if (run && (run.status === "success" || run.status === "error")) {
      try {
        const linkage = await computeCreativeLinkageSummary(accountId);
        run.creatives_linked = linkage.linked;
        run.creatives_total = linkage.total;
        run.creatives_unlinked_names = linkage.unlinked_names;
      } catch (linkageErr) {
        req.log.warn({ err: linkageErr, accountId }, "Creative linkage summary failed (non-fatal)");
      }
    }
    res.json({ run });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to read analysis run");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not read the analysis run.",
    });
  }
});

router.post("/metrix/accounts/:accountId/sync-creative-links", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const supabase = getSupabase();
    const account = await supabase.from("ad_accounts").select("id").eq("id", accountId).limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }
    const result = await syncAllCreativeLinksForAccount(accountId);
    invalidateMetrixSeedCache();
    req.log.info(
      { accountId, linked: result.linked, total: result.total, unlinked: result.unlinked_names.length },
      "Manual creative link re-sync complete",
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to sync creative links");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not sync creative links.",
    });
  }
});

// ─── Admin: one-shot backfill for all accounts ───────────────────────────────
// Iterates every account that has at least one creative_asset manual import
// with a non-empty ad_names mapping and syncs creative_asset_url on the ads
// rows. Safe to call repeatedly — idempotent overwrites.
router.post("/metrix/admin/sync-all-creative-links", requireAdmin, async (req, res) => {
  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("manual_imports")
    .select("account_id")
    .eq("kind", "creative_asset")
    .not("ad_names", "is", null);

  if (error) {
    req.log.error({ err: error }, "admin bulk creative sync: failed to list accounts");
    res.status(502).json({ message: error.message });
    return;
  }

  const accountIds = [...new Set((rows ?? []).map((r) => r["account_id"] as string))];
  req.log.info({ count: accountIds.length }, "admin bulk creative sync: starting");

  const results: Record<string, { linked: number; total: number; unlinked_names: string[] } | { error: string }> = {};
  for (const accountId of accountIds) {
    try {
      const summary = await syncAllCreativeLinksForAccount(accountId);
      results[accountId] = summary;
      req.log.info({ accountId, ...summary }, "admin bulk creative sync: account done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results[accountId] = { error: msg };
      req.log.warn({ accountId, err }, "admin bulk creative sync: account failed (continuing)");
    }
  }

  invalidateMetrixSeedCache();
  req.log.info({ accountIds }, "admin bulk creative sync: complete");
  res.json({ synced_accounts: accountIds.length, results });
});

export default router;
