import app from "./app";
import { logger } from "./lib/logger";
import { reconcileAgencyAdminAccess } from "./lib/agencyAccessSafeguard";
import { ensureDemoAccount } from "./lib/demoAccountSafeguard";
import { getMetrixSeedFromSupabase } from "./lib/metrixSeedAssembly";

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

// Self-healing demo login: recreate/repair the designated demo account on
// every boot so it survives DB resets, rollbacks, and dev/prod splits.
ensureDemoAccount(logger).catch((err) => {
  logger.error({ err }, "Demo account safeguard failed to run");
});

// Warm the seed cache at boot (2026-09-04): the first reader after a deploy
// used to pay the whole assembly on the boot splash, and past the TTL every
// reader did until the stale-while-revalidate cache landed. A failure here
// is logged and the first request rebuilds as before.
const warmStart = Date.now();
getMetrixSeedFromSupabase()
  .then(() => logger.info({ ms: Date.now() - warmStart }, "Metrix seed cache warmed"))
  .catch((err) => logger.warn({ err, ms: Date.now() - warmStart }, "Metrix seed cache warm-up failed; the first request will assemble it"));
