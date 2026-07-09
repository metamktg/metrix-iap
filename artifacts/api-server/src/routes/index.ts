import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metrixRouter from "./metrix";
import authRouter from "./auth";
import metaConnectRouter from "./metaConnect";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(metrixRouter);
router.use(metaConnectRouter);

export default router;
