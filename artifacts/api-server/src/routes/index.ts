import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metrixRouter from "./metrix";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(metrixRouter);

export default router;
