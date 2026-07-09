import app from "./app";
import { logger } from "./lib/logger";
import { reconcileAgencyAdminAccess } from "./lib/agencyAccessSafeguard";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Never fail silently: reconcile agency admin access on every boot so a
// missed promotion or an emptied grants table surfaces immediately in
// logs instead of showing up as "the app is broken" reports.
reconcileAgencyAdminAccess(logger).catch((err) => {
  logger.error({ err }, "Agency access safeguard failed to run");
});
