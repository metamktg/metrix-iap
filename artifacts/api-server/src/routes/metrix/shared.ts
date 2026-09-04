// ─── Shared helpers for the split /metrix routers ──────────────────────
// Moved verbatim out of the former single routes/metrix.ts (E5). These are
// the module-level helpers its route handlers closed over; they live here so
// every split router shares ONE definition rather than a copy per file.
// No behaviour change — the route table before and after this split is
// byte-identical, handler counts included.

import { db, usersTable, userAdAccountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { hashPassword, generateTempPassword } from "../../lib/passwords";
import { isAgencyAdminEmail } from "../../lib/agencyAccessSafeguard";
import { ensureSupabaseAuthUser } from "@workspace/auth-mirror";
import { sendApprovalEmail } from "../../lib/approvalEmail";
import { invalidateMetrixSeedCache } from "../../lib/metrixSeedAssembly";
import { getSupabase } from "../../lib/supabase";
import { autoMapUnmappedCreatives } from "../../lib/creativeAutoMap";
import { parseIapCsv, IapCsvFormatError, type DuplicateHeaderConflict } from "../../lib/iapCsvParser";
import { detectReportGrain, type ReportGrain } from "../../lib/reportGrain";
import { IAP_CSV_CLASS_SPECS, type IapCsvClass } from "../../lib/iapCsvSpec";
import { convertXlsxToCsvText, looksLikeXlsxContent } from "../../lib/xlsxToCsv";
import { resolveCreativeLinkResult, extensionOf, type CreativeLinkResult } from "../../lib/creativeAssetType";
import { logger } from "../../lib/logger";
import { getAppBaseUrl } from "../../lib/appUrl";
import type { Logger } from "pino";
// Provision (or reset) a user account with a temp password and email it.
// Shared by waitlist approval and access-request approval. The temp password
// is only returned when the email could not be delivered, so the admin can
// share it manually — otherwise it never leaves the email channel.
export async function provisionApprovedUser(
  email: string,
  log: Logger,
  extra?: { canManageTeam?: boolean; canViewAgencyRollups?: boolean },
): Promise<{ email_sent: boolean; temp_password?: string; email_error?: string; userId: number }> {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  // Designated agency accounts must always have full ad-account visibility
  // — provisioning them as a scoped "member" is what stranded
  // meta@metamktgagency.com with an empty view after per-user scoping
  // shipped. See agencyAccessSafeguard.ts for the durable reconciliation.
  const role = isAgencyAdminEmail(email) ? "admin" : undefined;
  const permissionFields = {
    ...(extra?.canManageTeam !== undefined ? { canManageTeam: extra.canManageTeam } : {}),
    ...(extra?.canViewAgencyRollups !== undefined
      ? { canViewAgencyRollups: extra.canViewAgencyRollups }
      : {}),
  };

  let userId: number;
  if (existingUser) {
    // Explicit approval is an unambiguous grant: it also restores a
    // previously revoked account.
    await db
      .update(usersTable)
      .set({
        passwordHash,
        mustChangePassword: true,
        disabledAt: null,
        ...(role ? { role } : {}),
        ...permissionFields,
      })
      .where(eq(usersTable.id, existingUser.id));
    userId = existingUser.id;
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        mustChangePassword: true,
        ...(role ? { role } : {}),
        ...permissionFields,
      })
      .returning({ id: usersTable.id });
    userId = created!.id;
  }

  // Mirror into Supabase Auth so official-schema reviewer/approver FKs
  // (auth.users) can reference this user. Non-fatal: approval still succeeds
  // if Supabase is unreachable; `pnpm --filter @workspace/scripts run
  // mirror:auth-users` repairs any gaps.
  try {
    const mirror = await ensureSupabaseAuthUser(email);
    await db
      .update(usersTable)
      .set({ supabaseUserId: mirror.supabaseUserId })
      .where(eq(usersTable.email, email));
  } catch (err) {
    log.error({ err, email }, "Supabase Auth mirror failed for approved user");
  }

  const emailResult = await sendApprovalEmail(email, tempPassword, getAppBaseUrl(), log);
  const sent = emailResult.status === "sent";
  return {
    email_sent: sent,
    userId,
    ...(sent
      ? {}
      : { temp_password: tempPassword, email_error: emailResult.reason }),
  };
}

// ─── Ad account creation & manual report staging ──────────────────────
export async function userHasAccountAccess(userId: number, accountId: string): Promise<boolean> {
  const rows = await db
    .select({ id: userAdAccountsTable.id })
    .from(userAdAccountsTable)
    .where(
      and(
        eq(userAdAccountsTable.userId, userId),
        eq(userAdAccountsTable.adAccountId, accountId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export function manualImportFileUrl(accountId: string, importId: string): string {
  return `/api/metrix/accounts/${accountId}/manual-imports/${importId}/file`;
}

export async function syncCreativeAssetLinks(
  accountId: string,
  importId: string,
  filename: string,
  previousAdNames: string[],
  nextAdNames: string[],
): Promise<CreativeLinkResult> {
  const supabase = getSupabase();
  const fileUrl = manualImportFileUrl(accountId, importId);

  const removed = previousAdNames.filter((n) => !nextAdNames.includes(n));
  if (removed.length > 0) {
    const clear = await supabase
      .from("ads")
      .update({ creative_asset_url: null, asset_filename: null, asset_servable: false })
      .eq("account_id", accountId)
      .in("ad_name", removed)
      .eq("creative_asset_url", fileUrl);
    if (clear.error) throw new Error(clear.error.message);
  }

  const result: CreativeLinkResult = { matched: [], unmatched: [] };
  if (nextAdNames.length > 0) {
    const link = await supabase
      .from("ads")
      .update({ creative_asset_url: fileUrl, asset_filename: filename, asset_servable: true })
      .eq("account_id", accountId)
      .in("ad_name", nextAdNames)
      .select("ad_name");
    if (link.error) throw new Error(link.error.message);
    const linked = resolveCreativeLinkResult(
      nextAdNames,
      (link.data ?? []).map((r) => r["ad_name"] as string),
    );
    result.matched = linked.matched;
    result.unmatched = linked.unmatched;
    if (result.unmatched.length > 0) {
      logger.warn(
        { accountId, importId, unmatched: result.unmatched },
        "syncCreativeAssetLinks: ad name(s) had no matching ads row — asset staged but not linked",
      );
    }
  }

  invalidateMetrixSeedCache();
  return result;
}

// Real Meta Ads Manager pivot exports (demo/placement CSVs spanning many
// months across breakdown dimensions) can exceed 50 MB for accounts with a
// long history — that cap was rejecting legitimate files in production.
// 75 MB gives real headroom (>20x the largest sample export on record).
// NOTE: files are stored as hex-encoded bytea via a Supabase/PostgREST
// insert, which gets slow (15-20s) well before this ceiling and has been
// observed to intermittently time out under shared-dev-Supabase load —
// pushing this cap materially higher (tested up to 150 MB) reproduced a
// server OOM crash from holding multiple in-memory copies of the payload
// (raw JSON string, base64 buffer, hex string) at once. If accounts
// routinely need larger files, switch storage to Object Storage (streamed
// upload) instead of raising this further.
export const MAX_MANUAL_IMPORT_BYTES = 75 * 1024 * 1024;

export const BASE64_RE = /^[A-Za-z0-9+/\-_]+={0,2}$/;

/** Maps a performance-CSV import kind to its canonical IAP CSV template class. */

export const PERFORMANCE_CSV_CLASS: Record<string, IapCsvClass> = {
  performance_demo_csv: "demographic",
  performance_placement_csv: "device_placement",
  // Ad-level summary: one row per ad per day, full spend (not privacy-limited).
  // Optional — supplements the required demo + placement exports.
  performance_ad_summary_csv: "ad_summary",
  // Conversion device: distinct Meta pivot from impression device.
  // Rows carry only conversion metrics (no spend/impressions) and must be
  // kept separate to avoid tracking_basis collisions with impression-device rows.
  performance_conversion_device_csv: "conversion_device",
  // Asset breakdown: a pivot "by asset" (Text / Headline / Image name …),
  // optionally with demographic or placement dimensions (a joint report).
  performance_asset_csv: "asset",
};

export type PerformanceCsvValidation = {
  mappingSummary?: Array<{
    canonical: string;
    found_as: string | null;
    confidence: number;
    method: string;
    tier: "exact" | "resolved" | "inferred" | "missing";
    is_required: boolean;
  }>;
  uploadWarnings?: string[];
  /** Detected grain — what the file can prove (lib/reportGrain.ts). Absent for creative assets. */
  reportGrain?: ReportGrain;
  /** Duplicated headers whose occurrences disagreed. [] when validation ran and found none. */
  headerConflicts?: DuplicateHeaderConflict[];
};

/**
 * Upload-time validation for the performance CSV kinds — shared verbatim by
 * the single-request staging route and the chunked-upload complete route so
 * a file gets the identical mapping report and warnings regardless of how
 * its bytes arrived. Throws IapCsvFormatError for anything the caller
 * should surface as a 422. Creative assets (no csvClass) return {}.
 */

export async function validatePerformanceCsvUpload(
  kind: string,
  filename: string,
  content: Buffer,
): Promise<PerformanceCsvValidation> {
  const csvClass = PERFORMANCE_CSV_CLASS[kind];
  if (!csvClass) return {};
  const isXlsx = extensionOf(filename) === "xlsx" || looksLikeXlsxContent(content);
  let text: string;
  let xlsxConversionWarnings: string[] = [];
  if (isXlsx) {
    const converted = await convertXlsxToCsvText(content, IAP_CSV_CLASS_SPECS[csvClass].requiredBreakdownColumns);
    text = converted.csvText;
    xlsxConversionWarnings = converted.warnings;
  } else {
    text = content.toString("utf8");
  }
  const parseResult = parseIapCsv(text, csvClass);
  if (parseResult.rows.length === 0) {
    throw new IapCsvFormatError(
      "This export has a valid header but no data rows. Re-export it with the campaign's rows included.",
    );
  }
  const mappingSummary = parseResult.mappingSummary.map((e) => ({
    canonical: e.canonical,
    found_as: e.foundAs ?? null,
    confidence: e.confidence,
    method: e.method,
    tier: e.tier,
    is_required: e.isRequired,
  }));
  const allWarnings = [...xlsxConversionWarnings, ...parseResult.warnings];
  return {
    mappingSummary,
    ...(allWarnings.length > 0 ? { uploadWarnings: allWarnings } : {}),
    reportGrain: detectReportGrain(parseResult, csvClass),
    headerConflicts: parseResult.headerConflicts,
  };
}

/**
 * User-safe rendering of an upstream failure. Supabase errors can carry a
 * whole HTML error page as their message (observed live: a Cloudflare 520
 * page rendered verbatim in the staging popup) — anything that looks like
 * markup, or is implausibly long for a sentence, collapses to a plain
 * retryable message. Postgres statement timeouts get their own wording.
 * The full error still goes to the server log at every call site.
 */

export async function findStagedByteDuplicate(
  accountId: string,
  kind: string,
  contentMd5: string,
): Promise<{ filename: string } | null> {
  const supabase = getSupabase();
  const dupCheckRes = await supabase
    .from("manual_imports")
    .select("id, filename, created_at")
    .eq("account_id", accountId)
    .eq("kind", kind)
    .eq("status", "staged")
    .eq("content_md5", contentMd5)
    .limit(1);
  if (dupCheckRes.error) throw new Error(dupCheckRes.error.message);
  const existing = dupCheckRes.data?.[0];
  return existing ? { filename: String(existing["filename"]) } : null;
}

/**
 * After a creative_asset is staged, match it on the server against the ads
 * this account already knows (creativeAutoMap.ts) and report the names it
 * landed on. Before the first analysis run there is nothing to match
 * against, and that is fine: the run's link step revisits every unmapped
 * file with the registry it just wrote. Never fatal to the upload itself.
 * Shared by single-request and chunked staging so both transports stage a
 * creative identically.
 */
export async function autoLinkStagedCreative(
  accountId: string,
  importId: string,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void },
): Promise<CreativeLinkResult> {
  try {
    const auto = await autoMapUnmappedCreatives(accountId);
    const stagedRow = await getSupabase().from("manual_imports").select("ad_names").eq("id", importId).limit(1);
    const names = ((stagedRow.data?.[0]?.["ad_names"] as string[] | null) ?? []);
    log.info({ accountId, importId, considered: auto.considered, mapped: auto.mapped }, "Creative staged; server auto-map ran");
    return { matched: names, unmatched: [] };
  } catch (err) {
    log.warn({ err, accountId, importId }, "Creative staged; server auto-map failed (file stays unmapped)");
    return { matched: [], unmatched: [] };
  }
}
