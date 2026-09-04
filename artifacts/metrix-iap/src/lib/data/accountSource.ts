// ─── Where an account's data comes from ───────────────────────────────
//
// An account created for manual report uploads is stored with
// platform "Meta Ads" (the ads ARE Meta ads) and source_status
// "manual_reports"; a live connection registers with source_status
// "live_meta_connection". Two surfaces used to read "manual versus live"
// off the platform string, so a manual account counted as a live
// connection: the setup checklist asked it to "Connect data source" and the
// command chain marked Data complete with nothing staged (owner
// screenshot, 2026-09-04). The source is the source; the platform is not.

import type { AdAccount } from "./seedTypes";

export function hasLiveMetaConnection(account: Pick<AdAccount, "source_status">): boolean {
  return account.source_status === "live_meta_connection";
}

/** Manual report uploads, or an account whose source was never recorded
 *  (every account the importer created predates the field). */
export function isManualAccount(account: Pick<AdAccount, "source_status">): boolean {
  return !hasLiveMetaConnection(account);
}
