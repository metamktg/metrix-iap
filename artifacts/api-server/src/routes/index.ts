import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metrixRouter from "./metrix";

const router: IRouter = Router();

router.use(healthRouter);
router.use(metrixRouter);

export default router;
