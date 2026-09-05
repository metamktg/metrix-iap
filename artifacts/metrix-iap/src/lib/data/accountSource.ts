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

export type AccountSourceKind = "live" | "manual" | "imported";

export interface AccountSourceDescription {
  kind: AccountSourceKind;
  /** "Live Meta connection" · "Manual reports" · "Imported package" · "Imported data". */
  label: string;
  /** One word for a chip: "Live" · "Manual" · "Imported". */
  short: string;
}

/**
 * What to call an account's source on a settings surface. Two of them
 * printed the raw `source_status` ("manual_reports",
 * "imported_from_iap_loop_package") or the word "connected" beside a
 * CONNECTED badge on a manual account (audit round 5). An account whose
 * source was never recorded predates the field and is the importer's.
 */
export function describeAccountSource(account: Pick<AdAccount, "source_status">): AccountSourceDescription {
  const status = account.source_status ?? null;
  if (status === "live_meta_connection") return { kind: "live", label: "Live Meta connection", short: "Live" };
  if (status === "manual_reports") return { kind: "manual", label: "Manual reports", short: "Manual" };
  if (status && status.startsWith("imported_")) return { kind: "imported", label: "Imported package", short: "Imported" };
  return { kind: "imported", label: "Imported data", short: "Imported" };
}
