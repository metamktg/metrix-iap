// ─── Loop stage-status route ────────────────────────────────────────────
// Composes the account's existing analysis/strategy/briefs run records into
// one shape the frontend gates the loop on (hard prerequisite gating:
// Strategy needs a successful Analysis run, Creative needs a successful
// Strategy run, MST needs at least one brief). Adds no new run tables —
// this only reads getLatestAnalysisRun / getLatestGenerationRun.

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { userHasAccountAccess } from "./metrix";
import { getLatestAnalysisRun, verifyAnalysisRunCompleteness } from "../lib/analysisEngine";
import { getLatestGenerationRun } from "../lib/generationEngine";
import { getSupabase } from "../lib/supabase";

const router: IRouter = Router();

async function guardAccess(req: any, res: any, accountId: string): Promise<boolean> {
  const user = req.authUser!;
  if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
    res.status(403).json({ message: "You don't have access to this ad account." });
    return false;
  }
  return true;
}

router.get("/metrix/accounts/:accountId/stage-status", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  try {
    if (!(await guardAccess(req, res, accountId))) return;

    const [analysisRun, completeness, strategyRun, briefsRun, briefsCount] = await Promise.all([
      getLatestAnalysisRun(accountId),
      // "Validated" = every required analysis surface actually received rows
      // for the latest run. Non-fatal: a verification failure must not take
      // down the whole stage-status read — it just reports not-validated.
      verifyAnalysisRunCompleteness(accountId).catch((err) => {
        req.log.warn({ err, accountId }, "Analysis completeness check failed (reporting validated=false)");
        return null;
      }),
      getLatestGenerationRun(accountId, "strategy"),
      getLatestGenerationRun(accountId, "briefs"),
      getSupabase()
        .from("imported_creative_briefs")
        .select("brief_id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .then(({ count, error }) => {
          if (error) throw new Error(error.message);
          return count ?? 0;
        }),
    ]);

    res.json({
      analysis: {
        status: analysisRun?.status ?? "none",
        last_run_at: analysisRun?.finished_at ?? analysisRun?.started_at ?? null,
        date_range: analysisRun?.date_range ?? null,
        validated: completeness?.complete ?? false,
        progress_pct: analysisRun?.progress_pct ?? 0,
        progress_stage: analysisRun?.progress_stage ?? "",
      },
      strategy: {
        status: strategyRun?.status ?? "none",
        last_run_at: strategyRun?.finished_at ?? strategyRun?.started_at ?? null,
      },
      briefs: {
        status: briefsRun?.status ?? "none",
        last_run_at: briefsRun?.finished_at ?? briefsRun?.started_at ?? null,
        count: briefsCount,
      },
      mst: {
        unlocked: briefsCount > 0,
      },
    });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to read stage status");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not read stage status.",
    });
  }
});

export default router;
