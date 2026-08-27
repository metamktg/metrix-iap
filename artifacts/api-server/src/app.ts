import express, { type Express } from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getAppBaseUrl } from "./lib/appUrl";
import { securityHeaders } from "./middlewares/securityHeaders";

const app: Express = express();

app.set("trust proxy", 1);

// Baseline security headers on every response. Registered first so it
// applies to error responses and short-circuited requests too, not just the
// ones that reach a route. See the middleware for why nosniff in particular
// is load-bearing rather than cosmetic here.
app.use(securityHeaders);

// Response compression: the Metrix seed bundle is a multi-megabyte JSON
// document served on every cache miss and re-fetched by the client after
// each mutation — highly repetitive text that gzips ~10x. Registered before
// the logger/routes so every JSON response (seed, summaries, listings)
// benefits; the default filter already skips tiny and non-text bodies.
app.use(compression());

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
app.use(cookieParser());
// Manual report uploads carry base64 file content (75 MB decoded max for
// CSV/report imports; base64 inflates that by ~33%), so this path gets a
// larger JSON body limit; everything else keeps the express default (100kb).
// body-parser skips requests already parsed here.
app.use("/api/metrix/accounts", express.json({ limit: "110mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Requests whose body exceeds the express.json limit above never reach a
// route handler — body-parser throws before req.body is populated, so the
// route's own "file too large" JSON response (metrix.ts) is unreachable for
// that case. Without this handler Express's default error page returns a
// bare, non-JSON 413, which upload UIs can only report as a raw HTTP status.
// This is a defense-in-depth net around the SAME size limit metrix.ts checks
// (see supabase-bytea-file-serving memory: don't raise the limit itself
// past what's been verified reliable — a prior attempt to push it to
// 150-200 MB caused a Node OOM, not just slowness).
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const httpErr = err as { status?: number; statusCode?: number; type?: string };
  if (httpErr?.type === "entity.too.large" || httpErr?.status === 413 || httpErr?.statusCode === 413) {
    res.status(413).json({
      message: "This file is too large for the upload. Try a smaller file or narrow the export's date range.",
    });
    return;
  }
  req.log?.error({ err }, "Unhandled request error");
  res.status(500).json({ message: "Something went wrong processing this request." });
});

export default app;
