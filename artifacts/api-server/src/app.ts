import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getAppBaseUrl } from "./lib/appUrl";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// All first-party clients (IAP app, marketing site) reach the API through
// the same-origin /api path route, so cross-origin access is not part of
// normal operation. In production, CORS is restricted to the app's own
// origin; dev stays permissive for local tooling.
app.use(
  cors(
    process.env.NODE_ENV === "production"
      ? { origin: new URL(getAppBaseUrl()).origin }
      : undefined,
  ),
);
// The seed bundle is a large JSON payload — compress all compressible
// responses (no-op for clients that don't send Accept-Encoding).
app.use(compression());
app.use(cookieParser());
// Manual report uploads carry base64 file content (8 MB decoded max), so
// this path gets a larger JSON body limit; everything else keeps the
// express default (100kb). body-parser skips requests already parsed here.
app.use("/api/metrix/accounts", express.json({ limit: "12mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
