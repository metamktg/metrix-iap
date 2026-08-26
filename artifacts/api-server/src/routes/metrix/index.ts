// ─── /metrix router (split) ────────────────────────────────────────────
// Was one 3,636-line routes/metrix.ts. Split per E5 with no behaviour change:
// each module holds a contiguous run of the original file and is mounted here
// in the original order, so route matching order — which several paths depend
// on (…/manual-imports/uploads must still be tried before …/:importId) — is
// preserved exactly.

import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import seedRouter from "./seed";
import accountsRouter from "./accounts";
import uploadsRouter from "./uploads";
import creativesRouter from "./creatives";
import waitlistRouter from "./waitlist";
import workspacesRouter from "./workspaces";

const router: IRouter = Router();

router.use(adminRouter);
router.use(seedRouter);
router.use(accountsRouter);
router.use(uploadsRouter);
router.use(creativesRouter);
router.use(waitlistRouter);
router.use(workspacesRouter);

// Re-exported for routes that authorize against account grants.
export { userHasAccountAccess } from "./shared";

export default router;
