// ─── Manual-upload analysis routes ─────────────────────────────────────
// Lets a user manually trigger analysis of their staged performance CSVs
// for a chosen date window (7d/14d/30d/all). Analysis NEVER runs
// automatically on upload — only from this explicit POST.

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { userHasAccountAccess } from "./metrix";
import {
  AnalysisError,
  getLatestAnalysisRun,
  startManualAnalysis,
  type DateRangePreset,
} from "../lib/analysisEngine";
import { buildIapCsvClassFormat } from "../lib/iapCsvSpec";

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

router.get("/metrix/manual-performance-csv-format", requireAuth, (_req, res) => {
  res.json({
    demographic: buildIapCsvClassFormat("demographic"),
    device_placement: buildIapCsvClassFormat("device_placement"),
  });
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
    res.json({ run });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to read analysis run");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not read the analysis run.",
    });
  }
});

export default router;
