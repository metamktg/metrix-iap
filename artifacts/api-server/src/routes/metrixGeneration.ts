// ─── Metrix in-app generation routes ──────────────────────────────────
// Strategy-from-analysis and Briefs-from-strategy generation, account-
// scoped like manual-imports: requires a session plus admin role or an
// explicit account grant. POST returns 202 + the run id; the client
// polls the latest-run endpoint until the run settles.

import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { userHasAccountAccess } from "./metrix";
import {
  GenerationError,
  getLatestGenerationRun,
  startBriefsGeneration,
  startStrategyGeneration,
  type GenerationKind,
} from "../lib/generationEngine";
import {
  listDeconstructions,
  reviewDeconstruction,
  startCreativeDeconstruction,
  type DetectedVariable,
} from "../lib/deconstructionEngine";

const router: IRouter = Router();

function sendGenerationError(res: any, err: unknown): void {
  if (err instanceof GenerationError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  res.status(502).json({
    message: err instanceof Error ? err.message : "Generation could not be started.",
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

router.post("/metrix/accounts/:accountId/generate/strategy", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const allTime = req.body?.["analysis_all_time"] === true;
  const rawIds = Array.isArray(req.body?.["analysis_run_ids"]) ? req.body["analysis_run_ids"] : [];
  const runIds: string[] | "all" = allTime ? "all" : rawIds.map(String);
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const runId = await startStrategyGeneration(accountId, req.authUser!.email, runIds);
    req.log.info({ accountId, runId, runIds }, "Strategy generation started");
    res.status(202).json({ run_id: runId });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to start strategy generation");
    sendGenerationError(res, err);
  }
});

router.post("/metrix/accounts/:accountId/generate/briefs", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const runId = await startBriefsGeneration(accountId, req.authUser!.email);
    req.log.info({ accountId, runId }, "Briefs generation started");
    res.status(202).json({ run_id: runId });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to start briefs generation");
    sendGenerationError(res, err);
  }
});

// ── creative deconstruction ────────────────────────────────────────────

router.post("/metrix/accounts/:accountId/deconstruct-creatives", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const importIds = Array.isArray(req.body?.["import_ids"]) ? req.body["import_ids"].map(String) : [];
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const runId = await startCreativeDeconstruction(accountId, req.authUser!.email, importIds);
    req.log.info({ accountId, runId, count: importIds.length }, "Creative deconstruction started");
    res.status(202).json({ run_id: runId });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to start creative deconstruction");
    sendGenerationError(res, err);
  }
});

router.get("/metrix/accounts/:accountId/creative-deconstructions", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const deconstructions = await listDeconstructions(accountId);
    res.json({ deconstructions });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to list creative deconstructions");
    sendGenerationError(res, err);
  }
});

router.patch(
  "/metrix/accounts/:accountId/creative-deconstructions/:deconstructionId",
  requireAuth,
  async (req, res) => {
    const accountId = String(req.params["accountId"]);
    const deconstructionId = String(req.params["deconstructionId"]);
    const action = String(req.body?.["action"] ?? "");
    if (action !== "update_variables" && action !== "bypass" && action !== "discard") {
      res.status(400).json({ message: "action must be 'update_variables', 'bypass', or 'discard'." });
      return;
    }
    const variables = Array.isArray(req.body?.["variables"])
      ? (req.body["variables"] as DetectedVariable[])
      : undefined;
    try {
      if (!(await guardAccess(req, res, accountId))) return;
      const deconstruction = await reviewDeconstruction(
        accountId,
        deconstructionId,
        action,
        req.authUser!.email,
        variables,
      );
      req.log.info({ accountId, deconstructionId, action }, "Creative deconstruction reviewed");
      res.json({ deconstruction });
    } catch (err) {
      req.log.error({ err, accountId, deconstructionId }, "Failed to review creative deconstruction");
      sendGenerationError(res, err);
    }
  },
);

router.get("/metrix/accounts/:accountId/generation-runs/:kind/latest", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const kind = String(req.params["kind"]);
  if (kind !== "strategy" && kind !== "briefs" && kind !== "deconstruct") {
    res.status(400).json({ message: "kind must be 'strategy', 'briefs', or 'deconstruct'." });
    return;
  }
  try {
    if (!(await guardAccess(req, res, accountId))) return;
    const run = await getLatestGenerationRun(accountId, kind as GenerationKind);
    res.json({ run });
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to read generation run");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not read the generation run.",
    });
  }
});

export default router;
