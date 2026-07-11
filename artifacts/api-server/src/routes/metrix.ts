import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  GetMetrixSeedResponse,
  JoinAgentWaitlistBody,
  JoinAgentWaitlistResponse,
  ListAgentWaitlistQueryParams,
  ListAgentWaitlistResponse,
  CreateWorkspaceInviteBody,
  CreateWorkspaceInviteResponse,
  ListWorkspaceInvitesResponse,
  ListWorkspaceMembersResponse,
  RevokeWorkspaceInviteResponse,
  ResendWorkspaceInviteResponse,
  UpdateMemberPermissionsBody,
  UpdateMemberPermissionsResponse,
  UpdateNotificationPrefsBody,
  UpdateNotificationPrefsResponse,
  SubmitRequestAccessBody,
  SubmitRequestAccessResponse,
  ApproveAgentWaitlistEntryResponse,
  RejectAgentWaitlistEntryResponse,
  AdminLoginBody,
  AdminLoginResponse,
  AdminCreateUserBody,
  AdminCreateUserResponse,
  GetAdminSessionResponse,
  AdminLogoutResponse,
  ListRequestAccessEntriesResponse,
  ApproveRequestAccessEntryResponse,
  RejectRequestAccessEntryResponse,
  UpdateReportSettingsBody,
  UpdateReportSettingsResponse,
  CreateWorkspaceReportBody,
  CreateWorkspaceReportResponse,
  ListWorkspaceReportsResponse,
  DeleteWorkspaceReportResponse,
  BatchDeleteWorkspaceReportsBody,
  BatchDeleteWorkspaceReportsResponse,
  GetAdminEmailStatusResponse,
  ListAdminUsersResponse,
  AdminResendTempPasswordResponse,
  AdminSendPasswordResetResponse,
  AdminRevokeUserResponse,
  AdminRestoreUserResponse,
  CreateManualAdAccountBody,
  CreateManualAdAccountResponse,
  StageManualImportBody,
  StageManualImportResponse,
  ListManualImportsResponse,
  UpdateManualImportAdNamesBody,
  UpdateManualImportAdNamesResponse,
  GrantMemberAdAccountBody,
  GrantMemberAdAccountResponse,
  ListMemberAdAccountsResponse,
  RevokeMemberAdAccountResponse,
  ResendMemberTempPasswordResponse,
  UpdateMemberStatusBody,
  UpdateMemberStatusResponse,
} from "@workspace/api-zod";
import {
  db,
  agentWaitlistTable,
  usersTable,
  userAdAccountsTable,
  workspaceInvitesTable,
  workspaceNotificationPrefsTable,
  workspaceReportSettingsTable,
  workspaceReportsTable,
  type WorkspaceReportSettings,
  type WorkspaceReport,
} from "@workspace/db";
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { requireAuth } from "../middlewares/requireAuth";
import { waitlistRateLimit } from "../middlewares/waitlistRateLimit";
import { hashPassword, generateTempPassword } from "../lib/passwords";
import { isAgencyAdminEmail } from "../lib/agencyAccessSafeguard";
import { ensureSupabaseAuthUser } from "@workspace/auth-mirror";
import { sendApprovalEmail } from "../lib/approvalEmail";
import { sendPasswordResetEmail } from "../lib/passwordResetEmail";
import { getEmailConfig } from "../lib/email";
import {
  createPasswordResetToken,
  deletePasswordResetTokensForUser,
} from "../lib/passwordResets";
import { destroyAllSessions } from "../lib/sessions";
import { isDisposableEmailDomain } from "../lib/disposableEmailDomains";
import {
  getMetrixSeedFromSupabase,
  composeSeedForUser,
  invalidateMetrixSeedCache,
} from "../lib/metrixSeedAssembly";
import { randomBytes } from "node:crypto";
import { getSupabase } from "../lib/supabase";
import { parseIapCsv, IapCsvFormatError } from "../lib/iapCsvParser";
import type { IapCsvClass } from "../lib/iapCsvSpec";
import {
  detectCreativeAssetKind,
  creativeAssetTypeMismatch,
  resolveCreativeLinkResult,
  type CreativeLinkResult,
} from "../lib/creativeAssetType";
import { notifyRequestAccess } from "../lib/requestAccessNotification";
import { logger } from "../lib/logger";
import { getAppBaseUrl } from "../lib/appUrl";
import {
  createAdminToken,
  hasAdminSession,
  setAdminCookie,
  clearAdminCookie,
  safeCompare,
} from "../lib/adminPanelSession";
import rateLimit from "express-rate-limit";
import type { Logger } from "pino";

const router: IRouter = Router();

// ─── Admin panel session (password-protected /admin page) ─────────────

const adminLoginRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    req.log?.warn({ ip: req.ip }, "admin login rate limit exceeded");
    res.status(429).json({ message: "Too many attempts. Please try again shortly." });
  },
});

router.post("/metrix/admin/session", adminLoginRateLimit, (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ message: "Incorrect admin password." });
    return;
  }

  const configured = process.env.ADMIN_PANEL_PASSWORD;
  if (!configured) {
    // Fail closed: nobody can log in until the secret is set.
    req.log.warn("Admin login attempted but ADMIN_PANEL_PASSWORD is not configured");
    res.status(401).json({ message: "Admin access is not configured on this server." });
    return;
  }

  if (!safeCompare(parsed.data.password, configured)) {
    req.log.warn({ ip: req.ip }, "Admin login failed: wrong password");
    res.status(401).json({ message: "Incorrect admin password." });
    return;
  }

  setAdminCookie(req, res, createAdminToken());
  res.json(AdminLoginResponse.parse({ authenticated: true }));
});

router.get("/metrix/admin/session", (req, res) => {
  res.json(GetAdminSessionResponse.parse({ authenticated: hasAdminSession(req) }));
});

router.delete("/metrix/admin/session", (req, res) => {
  clearAdminCookie(req, res);
  res.json(AdminLogoutResponse.parse({ authenticated: false }));
});

// Provision (or reset) a user account with a temp password and email it.
// Shared by waitlist approval and access-request approval. The temp password
// is only returned when the email could not be delivered, so the admin can
// share it manually — otherwise it never leaves the email channel.
async function provisionApprovedUser(
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

// ─── Admin user management ─────────────────────────────────────────────

router.get("/metrix/admin/email-status", requireAdmin, (req, res) => {
  const { mode, from } = getEmailConfig();
  const environment = process.env["REPLIT_DEPLOYMENT"]
    ? "production"
    : "development";
  res.json(GetAdminEmailStatusResponse.parse({ mode, from, environment }));
});

function adminUserStatus(user: {
  disabledAt: Date | null;
  lastLoginAt: Date | null;
}): "active" | "invited" | "disabled" {
  if (user.disabledAt) return "disabled";
  return user.lastLoginAt ? "active" : "invited";
}

router.get("/metrix/admin/users", requireAdmin, async (req, res) => {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      mustChangePassword: usersTable.mustChangePassword,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
      disabledAt: usersTable.disabledAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));

  res.json(
    ListAdminUsersResponse.parse({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        status: adminUserStatus(u),
        role: u.role,
        must_change_password: u.mustChangePassword,
        created_at: u.createdAt.toISOString(),
        last_login_at: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        disabled_at: u.disabledAt ? u.disabledAt.toISOString() : null,
      })),
      total: rows.length,
    }),
  );
});

// Create a user account on the spot (demo-call flow). Unlike approval
// provisioning, the temp password is ALWAYS returned so the admin can copy
// it from the console immediately — email is a courtesy, never required.
router.post("/metrix/admin/users", requireAdmin, async (req, res) => {
  const parsed = AdminCreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Please enter a valid email address." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing) {
    res.status(409).json({
      message:
        "An account with this email already exists. Use “New temp password” on that user below to issue fresh credentials.",
    });
    return;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  // Designated agency accounts must always be admins — same rule as
  // approval provisioning (see agencyAccessSafeguard.ts).
  const role = isAgencyAdminEmail(email) ? "admin" : undefined;

  // onConflictDoNothing + returning guards the race where two creates for
  // the same email pass the pre-check: the loser gets no row back → 409.
  const inserted = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      mustChangePassword: true,
      ...(role ? { role } : {}),
    })
    .onConflictDoNothing({ target: usersTable.email })
    .returning({ id: usersTable.id });
  if (inserted.length === 0) {
    res.status(409).json({
      message:
        "An account with this email already exists. Use “New temp password” on that user below to issue fresh credentials.",
    });
    return;
  }
  req.log.info({ email }, "admin created user directly from console");

  // Mirror into Supabase Auth (official-schema FKs). Non-fatal — the
  // mirror:auth-users script repairs any gaps.
  try {
    const mirror = await ensureSupabaseAuthUser(email);
    await db
      .update(usersTable)
      .set({ supabaseUserId: mirror.supabaseUserId })
      .where(eq(usersTable.email, email));
  } catch (err) {
    req.log.error({ err, email }, "Supabase Auth mirror failed for admin-created user");
  }

  // Courtesy email — the flow succeeds regardless of delivery.
  const emailResult = await sendApprovalEmail(email, tempPassword, getAppBaseUrl(), req.log);
  const sent = emailResult.status === "sent";
  res.json(
    AdminCreateUserResponse.parse({
      status: "created",
      email,
      temp_password: tempPassword,
      email_sent: sent,
      ...(sent ? {} : { email_error: emailResult.reason }),
    }),
  );
});

async function findAdminUser(userIdRaw: string) {
  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId < 1) return null;
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      disabledAt: usersTable.disabledAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ?? null;
}

router.post(
  "/metrix/admin/users/:userId/resend-temp-password",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    if (user.disabledAt) {
      res.status(409).json({
        message: "This account is disabled. Restore access before sending new credentials.",
      });
      return;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(usersTable.id, user.id));
    // Old credentials are dead; open sessions and outstanding reset links
    // go with them.
    await destroyAllSessions(user.id);
    await deletePasswordResetTokensForUser(user.id);

    const emailResult = await sendApprovalEmail(
      user.email,
      tempPassword,
      getAppBaseUrl(),
      req.log,
    );
    const sent = emailResult.status === "sent";
    res.json(
      AdminResendTempPasswordResponse.parse({
        status: "resent",
        email: user.email,
        email_sent: sent,
        ...(sent
          ? {}
          : { temp_password: tempPassword, email_error: emailResult.reason }),
      }),
    );
  },
);

router.post(
  "/metrix/admin/users/:userId/send-password-reset",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    if (user.disabledAt) {
      res.status(409).json({
        message: "This account is disabled. Restore access before sending a reset link.",
      });
      return;
    }

    const { token } = await createPasswordResetToken(user.id);
    const resetUrl = `${getAppBaseUrl()}reset-password?token=${token}`;
    const emailResult = await sendPasswordResetEmail(
      user.email,
      resetUrl,
      getAppBaseUrl(),
      req.log,
    );
    const sent = emailResult.status === "sent";
    res.json(
      AdminSendPasswordResetResponse.parse({
        status: "reset_link_created",
        email: user.email,
        email_sent: sent,
        ...(sent
          ? {}
          : { reset_url: resetUrl, email_error: emailResult.reason }),
      }),
    );
  },
);

router.post(
  "/metrix/admin/users/:userId/revoke",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    if (!user.disabledAt) {
      await db
        .update(usersTable)
        .set({ disabledAt: new Date() })
        .where(eq(usersTable.id, user.id));
    }
    // Always destroy sessions and outstanding reset links, even if already
    // disabled — a pre-revoke reset link must not survive a later restore.
    await destroyAllSessions(user.id);
    await deletePasswordResetTokensForUser(user.id);
    req.log.info({ email: user.email }, "admin revoked user access");

    res.json(
      AdminRevokeUserResponse.parse({ status: "revoked", email: user.email }),
    );
  },
);

router.post(
  "/metrix/admin/users/:userId/restore",
  requireAdmin,
  async (req, res) => {
    const user = await findAdminUser(String(req.params.userId));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    await db
      .update(usersTable)
      .set({ disabledAt: null })
      .where(eq(usersTable.id, user.id));
    req.log.info({ email: user.email }, "admin restored user access");

    res.json(
      AdminRestoreUserResponse.parse({ status: "restored", email: user.email }),
    );
  },
);

router.get("/metrix/seed", requireAuth, async (req, res) => {
  try {
    const user = req.authUser!;
    let bundle = await getMetrixSeedFromSupabase();
    if (user.role !== "admin") {
      // Members see only accounts they have been granted. The per-user view
      // is derived fresh on every request (never cached) so a new grant is
      // visible immediately. An empty grant set is valid: ad_accounts []
      // renders the onboarding path client-side.
      const grants = await db
        .select({ adAccountId: userAdAccountsTable.adAccountId })
        .from(userAdAccountsTable)
        .where(eq(userAdAccountsTable.userId, user.id));
      bundle = composeSeedForUser(bundle, new Set(grants.map((g) => g.adAccountId)), {
        viewAgencyRollups: user.canViewAgencyRollups,
      });
    }
    const data = GetMetrixSeedResponse.parse(bundle);
    res.json(data);
  } catch (err) {
    // No static fallback by design: the app must not silently render stale
    // bundled data when the Supabase-backed data layer is unavailable.
    req.log.error({ err }, "Failed to assemble Metrix seed from Supabase");
    res.status(503).json({
      message:
        err instanceof Error ? err.message : "Metrix data layer is unavailable.",
    });
  }
});

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

function manualImportFileUrl(accountId: string, importId: string): string {
  return `${getAppBaseUrl()}api/metrix/accounts/${accountId}/manual-imports/${importId}/file`;
}

/**
 * Links a staged creative_asset import to real ad rows in `ads` so the
 * uploaded file becomes visible everywhere creatives render (CreativeCard,
 * primaryAdForCell), not just inside the upload dialog. Only ever UPDATEs
 * existing `ads` rows matched by (account_id, ad_name) — never inserts a
 * fabricated ad. Names removed from the mapping are unlinked only if they
 * still point at this exact import's URL (so we never clobber a different
 * import's mapping).
 */
async function syncCreativeAssetLinks(
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

router.post("/metrix/accounts", requireAuth, async (req, res) => {
  const parsed = CreateManualAdAccountBody.safeParse(req.body);
  const name = parsed.success ? parsed.data.name.trim() : "";
  if (!parsed.success || name.length < 2) {
    res.status(400).json({ message: "An account name of at least 2 characters is required." });
    return;
  }
  const user = req.authUser!;

  try {
    const supabase = getSupabase();
    const lookup = await supabase
      .from("ad_accounts")
      .select("id, name")
      .ilike("name", name)
      .limit(1);
    if (lookup.error) throw new Error(lookup.error.message);
    if (lookup.data && lookup.data.length > 0) {
      res.status(409).json({
        message: `An ad account named "${lookup.data[0]!["name"]}" already exists.`,
      });
      return;
    }

    // Manual accounts get a "manual_" id — NEVER an act_ prefix, which is
    // reserved for real Meta ad account ids.
    const accountId = `manual_${randomBytes(9).toString("base64url")}`;
    const insert = await supabase.from("ad_accounts").insert({
      id: accountId,
      name,
      status: "unconfigured",
      platform: "Meta Ads",
      source_status: "manual_reports",
      overview_state: {
        title: "Analysis not run yet",
        description:
          "This ad account was created for manual report uploads. Upload exported Meta reports; performance and strategy data appears after the first analysis run processes them.",
        primary_action: "Upload Reports",
        secondary_action: "Connect Meta",
      },
    });
    if (insert.error) throw new Error(insert.error.message);

    // Grant the creator access (idempotent) — for members this is what
    // makes the new account visible in their filtered seed. The account row
    // lives in Supabase and the grant lives in Replit Postgres, so there is
    // no shared transaction; if the grant fails we compensate by deleting the
    // just-created account row so a half-failure never strands an ungranted,
    // orphaned account that nobody can see or manage.
    try {
      await db
        .insert(userAdAccountsTable)
        .values({ userId: user.id, adAccountId: accountId })
        .onConflictDoNothing();
    } catch (grantErr) {
      req.log.error(
        { err: grantErr, accountId },
        "Access grant failed after account insert — rolling back the orphaned account",
      );
      const rollback = await supabase.from("ad_accounts").delete().eq("id", accountId);
      if (rollback.error) {
        req.log.error(
          { err: rollback.error, accountId },
          "Failed to roll back orphaned account after grant failure",
        );
      }
      throw new Error(
        "The account was created but access couldn't be granted, so it was rolled back. Please try again.",
      );
    }
    invalidateMetrixSeedCache();

    req.log.info({ accountId, name }, "Manual ad account created");
    res.json(
      CreateManualAdAccountResponse.parse({
        account_id: accountId,
        name,
        status: "unconfigured",
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to create manual ad account");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not create the ad account.",
    });
  }
});

const MAX_MANUAL_IMPORT_BYTES = 8 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/\-_]+={0,2}$/;

/** Maps a performance-CSV import kind to its canonical IAP CSV template class. */
const PERFORMANCE_CSV_CLASS: Record<string, IapCsvClass> = {
  performance_demo_csv: "demographic",
  performance_placement_csv: "device_placement",
};

router.post("/metrix/accounts/:accountId/manual-imports", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const parsed = StageManualImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "A file kind (performance_csv or creative_library), filename, and base64 content are required.",
    });
    return;
  }
  const user = req.authUser!;

  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }

    const supabase = getSupabase();
    const account = await supabase
      .from("ad_accounts")
      .select("id")
      .eq("id", accountId)
      .limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }

    if (parsed.data.kind !== "creative_asset" && parsed.data.ad_names && parsed.data.ad_names.length > 0) {
      res.status(400).json({ message: "ad_names is only valid for creative_asset uploads." });
      return;
    }

    const b64 = parsed.data.content_base64.replace(/\s/g, "");
    if (!BASE64_RE.test(b64)) {
      res.status(400).json({ message: "File content is not valid base64." });
      return;
    }
    const content = Buffer.from(b64, "base64");
    if (content.length === 0) {
      res.status(400).json({ message: "The uploaded file is empty." });
      return;
    }
    if (content.length > MAX_MANUAL_IMPORT_BYTES) {
      res.status(413).json({ message: "File is too large — the limit is 8 MB." });
      return;
    }

    // ── Upload-time validation ────────────────────────────────────────
    // The two performance CSVs are validated against their exact Meta pivot
    // export template NOW, so a malformed file is rejected at upload instead
    // of silently failing later at analysis-run time. Validation only checks
    // shape — no performance numbers are stored or fabricated from the parse.
    const csvClass = PERFORMANCE_CSV_CLASS[parsed.data.kind];
    if (csvClass) {
      try {
        const text = content.toString("utf8");
        const result = parseIapCsv(text, csvClass);
        if (result.rows.length === 0) {
          res.status(422).json({
            message: "This export has a valid header but no data rows. Re-export it with the campaign's rows included.",
          });
          return;
        }
      } catch (err) {
        if (err instanceof IapCsvFormatError) {
          res.status(422).json({ message: err.message });
          return;
        }
        throw err;
      }
    }

    // Creative files are checked for a filename-extension / real-content
    // mismatch (e.g. a video renamed .png), which would otherwise render as
    // a broken image. Only a proven contradiction is rejected.
    if (parsed.data.kind === "creative_asset") {
      const mismatch = creativeAssetTypeMismatch(parsed.data.filename, content);
      if (mismatch) {
        res.status(422).json({ message: mismatch });
        return;
      }
    }

    // Staged only: the file is stored raw for the analysis pipeline. It is
    // never parsed into performance data at upload time — no fabricated
    // numbers appear in the app from an upload alone.
    const insert = await supabase
      .from("manual_imports")
      .insert({
        account_id: accountId,
        kind: parsed.data.kind,
        filename: parsed.data.filename,
        content_type: parsed.data.content_type ?? null,
        content: `\\x${content.toString("hex")}`,
        size_bytes: content.length,
        ad_names: parsed.data.kind === "creative_asset" ? (parsed.data.ad_names ?? []) : [],
        match_method: parsed.data.kind === "creative_asset" ? (parsed.data.match_method ?? null) : null,
        uploaded_by_user_id: user.id,
        uploaded_by_email: user.email,
      })
      .select("id")
      .single();
    if (insert.error) throw new Error(insert.error.message);

    const importId = String(insert.data["id"]);
    let linkResult: CreativeLinkResult | null = null;
    if (parsed.data.kind === "creative_asset" && (parsed.data.ad_names?.length ?? 0) > 0) {
      linkResult = await syncCreativeAssetLinks(accountId, importId, parsed.data.filename, [], parsed.data.ad_names!);
    }

    req.log.info(
      { accountId, kind: parsed.data.kind, filename: parsed.data.filename, sizeBytes: content.length },
      "Manual import staged",
    );
    res.json(
      StageManualImportResponse.parse({
        status: "staged",
        import_id: String(insert.data["id"]),
        filename: parsed.data.filename,
        size_bytes: content.length,
        note: "File staged for the analysis pipeline. Performance data appears only after an analysis run processes it — nothing is parsed or fabricated at upload time.",
        ...(linkResult
          ? { link_result: { matched: linkResult.matched, unmatched: linkResult.unmatched } }
          : {}),
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to stage manual import");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not stage the uploaded file.",
    });
  }
});

router.get("/metrix/accounts/:accountId/manual-imports", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const account = await supabase.from("ad_accounts").select("id").eq("id", accountId).limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }
    const { data, error } = await supabase
      .from("manual_imports")
      .select("id, account_id, kind, filename, content_type, size_bytes, ad_names, match_method, status, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json(
      ListManualImportsResponse.parse({
        imports: (data ?? []).map((r) => ({
          id: String(r["id"]),
          account_id: String(r["account_id"]),
          kind: r["kind"],
          filename: r["filename"],
          content_type: r["content_type"] ?? null,
          size_bytes: r["size_bytes"],
          ad_names: r["ad_names"] ?? [],
          match_method: r["match_method"] ?? null,
          status: r["status"],
          created_at: String(r["created_at"]),
        })),
      }),
    );
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to list manual imports");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not list staged imports.",
    });
  }
});

router.patch("/metrix/accounts/:accountId/manual-imports/:importId", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const importId = String(req.params["importId"]);
  const parsed = UpdateManualImportAdNamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "ad_names must be an array of strings." });
    return;
  }
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const existing = await supabase
      .from("manual_imports")
      .select("id, kind, filename, ad_names")
      .eq("id", importId)
      .eq("account_id", accountId)
      .limit(1);
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data || existing.data.length === 0) {
      res.status(404).json({ message: "Staged import not found." });
      return;
    }
    if (existing.data[0]!["kind"] !== "creative_asset") {
      res.status(400).json({ message: "Only creative asset uploads have an editable ad-name mapping." });
      return;
    }
    const previousAdNames: string[] = existing.data[0]!["ad_names"] ?? [];
    // match_method is only ever persisted when the caller explicitly passes
    // it back unmodified (still equal to the auto-suggested value) — any
    // other save (dropdown pick, free-text edit) omits it, which clears the
    // stored reason so it never lies about a manually-picked mapping.
    const { data, error } = await supabase
      .from("manual_imports")
      .update({ ad_names: parsed.data.ad_names, match_method: parsed.data.match_method ?? null })
      .eq("id", importId)
      .select("id, account_id, kind, filename, content_type, size_bytes, ad_names, match_method, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    const linkResult = await syncCreativeAssetLinks(
      accountId,
      importId,
      existing.data[0]!["filename"],
      previousAdNames,
      parsed.data.ad_names,
    );

    res.json(
      UpdateManualImportAdNamesResponse.parse({
        id: String(data["id"]),
        account_id: String(data["account_id"]),
        kind: data["kind"],
        filename: data["filename"],
        content_type: data["content_type"] ?? null,
        size_bytes: data["size_bytes"],
        ad_names: data["ad_names"] ?? [],
        match_method: data["match_method"] ?? null,
        status: data["status"],
        created_at: String(data["created_at"]),
        link_result: { matched: linkResult.matched, unmatched: linkResult.unmatched },
      }),
    );
  } catch (err) {
    req.log.error({ err, accountId, importId }, "Failed to update manual import ad names");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not update the ad-name mapping.",
    });
  }
});

router.delete("/metrix/accounts/:accountId/manual-imports/:importId", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const importId = String(req.params["importId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const existing = await supabase
      .from("manual_imports")
      .select("id, kind, ad_names")
      .eq("id", importId)
      .eq("account_id", accountId)
      .limit(1);
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data || existing.data.length === 0) {
      res.status(404).json({ message: "Staged import not found." });
      return;
    }
    if (existing.data[0]!["kind"] === "creative_asset") {
      const adNames: string[] = existing.data[0]!["ad_names"] ?? [];
      if (adNames.length > 0) {
        await syncCreativeAssetLinks(accountId, importId, "", adNames, []);
      }
    }
    const del = await supabase.from("manual_imports").delete().eq("id", importId);
    if (del.error) throw new Error(del.error.message);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err, accountId, importId }, "Failed to delete manual import");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not delete the staged import.",
    });
  }
});

router.get("/metrix/accounts/:accountId/manual-imports/:importId/file", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const importId = String(req.params["importId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const existing = await supabase
      .from("manual_imports")
      .select("id, content_type, content")
      .eq("id", importId)
      .eq("account_id", accountId)
      .limit(1);
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data || existing.data.length === 0) {
      res.status(404).json({ message: "Staged import not found." });
      return;
    }
    const row = existing.data[0]!;
    const rawContent = row["content"] as string;
    const hex = rawContent.startsWith("\\x") ? rawContent.slice(2) : rawContent;
    const buf = Buffer.from(hex, "hex");
    const contentType = (row["content_type"] as string | null) ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=60");

    // Video elements (Safari in particular) require Range/206 support to
    // play at all, not just to seek — without this, video creatives can
    // silently fail to load even though the plain GET works fine.
    res.setHeader("Accept-Ranges", "bytes");
    const rangeHeader = req.headers.range;
    if (rangeHeader && contentType.startsWith("video/")) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      const total = buf.length;
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= total) {
        res.setHeader("Content-Range", `bytes */${total}`);
        res.status(416).end();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", String(end - start + 1));
      res.send(buf.subarray(start, end + 1));
      return;
    }
    res.send(buf);
  } catch (err) {
    req.log.error({ err, accountId, importId }, "Failed to fetch manual import file");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not fetch the staged file.",
    });
  }
});

router.post("/metrix/agent-waitlist", waitlistRateLimit, async (req, res) => {
  const parsed = JoinAgentWaitlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "A valid email address is required." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  if (isDisposableEmailDomain(email)) {
    res.status(400).json({
      message: "Please use a permanent email address to join the waitlist.",
    });
    return;
  }

  const inserted = await db
    .insert(agentWaitlistTable)
    .values({ email })
    .onConflictDoNothing({ target: agentWaitlistTable.email })
    .returning();

  const data = JoinAgentWaitlistResponse.parse({
    status: inserted.length > 0 ? "joined" : "already_joined",
    email,
  });
  res.json(data);
});

router.post("/metrix/request-access", waitlistRateLimit, async (req, res) => {
  const parsed = SubmitRequestAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message:
        "Please fill in all required fields with valid values (name, email, phone, business type, industry, and ad spend).",
    });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (isDisposableEmailDomain(email)) {
    res.status(400).json({
      message: "Please use a permanent business email address.",
    });
    return;
  }

  const submission = {
    full_name: parsed.data.full_name.trim(),
    email,
    phone: parsed.data.phone.trim(),
    business_type: parsed.data.business_type,
    industry: parsed.data.industry.trim(),
    avg_monthly_ad_spend: parsed.data.avg_monthly_ad_spend.trim(),
    website: parsed.data.website?.trim() || undefined,
    linkedin: parsed.data.linkedin?.trim() || undefined,
  };

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    req.log.error({ err }, "Supabase not configured for request-access");
    res.status(503).json({
      message: "We couldn't save your request right now. Please try again shortly.",
    });
    return;
  }

  const { error } = await supabase.from("request_access").insert({
    full_name: submission.full_name,
    email: submission.email,
    phone: submission.phone,
    business_type: submission.business_type,
    industry: submission.industry,
    avg_monthly_ad_spend: submission.avg_monthly_ad_spend,
    website: submission.website ?? null,
    linkedin: submission.linkedin ?? null,
  });

  if (error) {
    // 23505 = unique violation on lower(email): request already on file.
    if (error.code === "23505") {
      const data = SubmitRequestAccessResponse.parse({
        status: "already_requested",
        email,
      });
      res.json(data);
      return;
    }
    req.log.error({ error }, "Failed to store request-access submission");
    res.status(503).json({
      message: "We couldn't save your request right now. Please try again shortly.",
    });
    return;
  }

  // Fire the internal notification; never block or fail the submission on it.
  void notifyRequestAccess(submission, req.log);

  const data = SubmitRequestAccessResponse.parse({ status: "received", email });
  res.json(data);
});

router.get("/metrix/agent-waitlist", requireAdmin, async (req, res) => {
  const parsedQuery = ListAgentWaitlistQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ message: "Invalid limit/offset query parameters." });
    return;
  }
  const { limit, offset } = parsedQuery.data;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: agentWaitlistTable.id,
        email: agentWaitlistTable.email,
        status: agentWaitlistTable.status,
        approvedAt: agentWaitlistTable.approvedAt,
        createdAt: agentWaitlistTable.createdAt,
      })
      .from(agentWaitlistTable)
      .orderBy(desc(agentWaitlistTable.createdAt), desc(agentWaitlistTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(agentWaitlistTable),
  ]);

  const data = ListAgentWaitlistResponse.parse({
    entries: rows.map((row) => ({
      id: row.id,
      email: row.email,
      status: row.status,
      approved_at: row.approvedAt ? row.approvedAt.toISOString() : undefined,
      joined_at: row.createdAt.toISOString(),
    })),
    total,
  });
  res.json(data);
});

// Server-streamed CSV export of the entire waitlist in a single request.
// The whole list is written straight to the response in keyset-paged batches
// (no client-side page loop, no full-table buffering in memory), so the
// download stays fast and constant-memory even at tens of thousands of rows.
router.get("/metrix/agent-waitlist/export.csv", requireAdmin, async (req, res) => {
  const escapeCsv = (value: string) =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="metrix-agent-waitlist.csv"',
  );
  res.write("email,status,joined_at,approved_at\n");

  const BATCH = 1000;
  // Keyset pagination on the (created_at, id) order — stable and index-friendly
  // regardless of size, and immune to offset drift if rows are added mid-export.
  let cursor: { createdAt: Date; id: number } | null = null;
  try {
    for (;;) {
      const where: SQL | undefined = cursor
        ? sql`(${agentWaitlistTable.createdAt}, ${agentWaitlistTable.id}) < (${cursor.createdAt.toISOString()}, ${cursor.id})`
        : undefined;
      const batch: {
        id: number;
        email: string;
        status: string;
        approvedAt: Date | null;
        createdAt: Date;
      }[] = await db
        .select({
          id: agentWaitlistTable.id,
          email: agentWaitlistTable.email,
          status: agentWaitlistTable.status,
          approvedAt: agentWaitlistTable.approvedAt,
          createdAt: agentWaitlistTable.createdAt,
        })
        .from(agentWaitlistTable)
        .where(where)
        .orderBy(desc(agentWaitlistTable.createdAt), desc(agentWaitlistTable.id))
        .limit(BATCH);

      if (batch.length === 0) break;
      let chunk = "";
      for (const row of batch) {
        chunk +=
          [
            escapeCsv(row.email),
            escapeCsv(row.status),
            row.createdAt.toISOString(),
            row.approvedAt ? row.approvedAt.toISOString() : "",
          ].join(",") + "\n";
      }
      res.write(chunk);

      const last = batch[batch.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (batch.length < BATCH) break;
    }
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to stream waitlist CSV export");
    // Headers/first bytes may already be flushed; end the stream rather than
    // sending a JSON error that would corrupt the partial CSV.
    if (!res.headersSent) {
      res.status(500).json({ message: "Could not export the waitlist." });
    } else {
      res.end();
    }
  }
});

router.post(
  "/metrix/agent-waitlist/:entryId/approve",
  requireAdmin,
  async (req, res) => {
    const entryId = Number.parseInt(String(req.params.entryId), 10);
    if (!Number.isInteger(entryId) || entryId < 1) {
      res.status(404).json({ message: "Waitlist entry not found." });
      return;
    }

    const [entry] = await db
      .select()
      .from(agentWaitlistTable)
      .where(eq(agentWaitlistTable.id, entryId))
      .limit(1);

    if (!entry) {
      res.status(404).json({ message: "Waitlist entry not found." });
      return;
    }

    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, entry.email))
      .limit(1);

    if (entry.status === "approved" && existingUser) {
      const data = ApproveAgentWaitlistEntryResponse.parse({
        status: "already_approved",
        email: entry.email,
        email_sent: false,
      });
      res.json(data);
      return;
    }

    // Strict lifecycle: a rejected entry stays rejected — no silent revival.
    if (entry.status === "rejected") {
      res.status(409).json({ message: "This entry was rejected and cannot be approved." });
      return;
    }

    const provisioned = await provisionApprovedUser(entry.email, req.log);

    await db
      .update(agentWaitlistTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(agentWaitlistTable.id, entry.id));

    const data = ApproveAgentWaitlistEntryResponse.parse({
      status: "approved",
      email: entry.email,
      ...provisioned,
    });
    res.json(data);
  },
);

router.post(
  "/metrix/agent-waitlist/:entryId/reject",
  requireAdmin,
  async (req, res) => {
    const entryId = Number.parseInt(String(req.params.entryId), 10);
    if (!Number.isInteger(entryId) || entryId < 1) {
      res.status(404).json({ message: "Waitlist entry not found." });
      return;
    }

    const [entry] = await db
      .select()
      .from(agentWaitlistTable)
      .where(eq(agentWaitlistTable.id, entryId))
      .limit(1);

    if (!entry) {
      res.status(404).json({ message: "Waitlist entry not found." });
      return;
    }

    if (entry.status === "rejected") {
      res.json(
        RejectAgentWaitlistEntryResponse.parse({
          status: "already_rejected",
          email: entry.email,
        }),
      );
      return;
    }

    // Strict lifecycle: an approved entry (account already provisioned)
    // cannot be flipped to rejected from here.
    if (entry.status === "approved") {
      res.status(409).json({ message: "This entry was already approved and cannot be rejected." });
      return;
    }

    await db
      .update(agentWaitlistTable)
      .set({ status: "rejected" })
      .where(eq(agentWaitlistTable.id, entry.id));

    req.log.info({ entryId: entry.id }, "Waitlist entry rejected");
    res.json(
      RejectAgentWaitlistEntryResponse.parse({
        status: "rejected",
        email: entry.email,
      }),
    );
  },
);

// ─── Access requests (admin) ──────────────────────────────────────────

type RequestAccessRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  business_type: string | null;
  industry: string | null;
  avg_monthly_ad_spend: string | null;
  website: string | null;
  linkedin: string | null;
  status: string;
  created_at: string;
};

router.get("/metrix/request-access", requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: rows, error } = await supabase
      .from("request_access")
      .select(
        "id, full_name, email, phone, business_type, industry, avg_monthly_ad_spend, website, linkedin, status, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const entries = ((rows ?? []) as RequestAccessRow[]).map((row) => ({
      ...row,
      status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
    }));
    res.json(ListRequestAccessEntriesResponse.parse({ entries, total: entries.length }));
  } catch (err) {
    req.log.error({ err }, "Failed to list access requests");
    res.status(503).json({ message: "Could not load access requests." });
  }
});

async function findRequestAccessRow(requestId: string): Promise<RequestAccessRow | null> {
  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("request_access")
    .select(
      "id, full_name, email, phone, business_type, industry, avg_monthly_ad_spend, website, linkedin, status, created_at",
    )
    .eq("id", requestId)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((rows ?? []) as RequestAccessRow[])[0] ?? null;
}

router.post(
  "/metrix/request-access/:requestId/approve",
  requireAdmin,
  async (req, res) => {
    const requestId = String(req.params.requestId);
    try {
      const entry = await findRequestAccessRow(requestId);
      if (!entry) {
        res.status(404).json({ message: "Access request not found." });
        return;
      }

      const email = entry.email.trim().toLowerCase();
      const [existingUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (entry.status === "approved" && existingUser) {
        res.json(
          ApproveRequestAccessEntryResponse.parse({
            status: "already_approved",
            email,
            email_sent: false,
          }),
        );
        return;
      }

      // Strict lifecycle: a rejected request stays rejected.
      if (entry.status === "rejected") {
        res.status(409).json({ message: "This request was rejected and cannot be approved." });
        return;
      }

      // Mark the request approved BEFORE provisioning credentials. If this
      // update fails we bail out without touching any account, so a retry is
      // always safe. If provisioning then fails, the thrown error surfaces as
      // a 503 below and the already_approved+existingUser guard above won't
      // trigger (no user row yet) — so a retry re-runs provisioning.
      const supabase = getSupabase();
      const upd = await supabase
        .from("request_access")
        .update({ status: "approved" })
        .eq("id", entry.id);
      if (upd.error) throw new Error(upd.error.message);

      const provisioned = await provisionApprovedUser(email, req.log);

      res.json(
        ApproveRequestAccessEntryResponse.parse({
          status: "approved",
          email,
          ...provisioned,
        }),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to approve access request");
      res.status(503).json({ message: "Could not approve the access request." });
    }
  },
);

router.post(
  "/metrix/request-access/:requestId/reject",
  requireAdmin,
  async (req, res) => {
    const requestId = String(req.params.requestId);
    try {
      const entry = await findRequestAccessRow(requestId);
      if (!entry) {
        res.status(404).json({ message: "Access request not found." });
        return;
      }

      if (entry.status === "rejected") {
        res.json(
          RejectRequestAccessEntryResponse.parse({
            status: "already_rejected",
            email: entry.email,
          }),
        );
        return;
      }

      // Strict lifecycle: an approved request (account provisioned) cannot
      // be flipped to rejected from here.
      if (entry.status === "approved") {
        res
          .status(409)
          .json({ message: "This request was already approved and cannot be rejected." });
        return;
      }

      const supabase = getSupabase();
      const upd = await supabase
        .from("request_access")
        .update({ status: "rejected" })
        .eq("id", entry.id);
      if (upd.error) throw new Error(upd.error.message);

      req.log.info({ requestId: entry.id }, "Access request rejected");
      res.json(
        RejectRequestAccessEntryResponse.parse({
          status: "rejected",
          email: entry.email,
        }),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to reject access request");
      res.status(503).json({ message: "Could not reject the access request." });
    }
  },
);

const inviteRowToApi = (row: {
  id: number;
  email: string;
  role: string;
  status: string;
  canManageTeam: boolean;
  canViewAgencyRollups: boolean;
  adAccountIds: unknown;
  createdAt: Date;
}) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  manage_team: row.canManageTeam,
  view_agency_rollups: row.canViewAgencyRollups,
  ad_account_ids: Array.isArray(row.adAccountIds) ? (row.adAccountIds as string[]) : [],
  created_at: row.createdAt.toISOString(),
});

// This deployment is single-workspace: the only valid workspaceId is the
// manager account id from the Metrix seed bundle. Authenticated users are
// members of that workspace; anything else is forbidden.
const requireWorkspaceAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const workspaceId = String(req.params.workspaceId);
  try {
    const bundle = (await getMetrixSeedFromSupabase()) as {
      manager_account?: { id?: string };
    };
    const allowedId = bundle.manager_account?.id;
    if (!allowedId || workspaceId !== allowedId) {
      res.status(403).json({ message: "You don't have access to this workspace." });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "Workspace access check failed (seed unavailable)");
    res.status(503).json({
      message: "Couldn't verify workspace access because the Metrix data layer is unavailable.",
    });
  }
};

// Team-management endpoints (member roster + invites) require the explicit
// "manage team" master-level permission. Agency `admin` accounts always
// qualify, independent of the stored can_manage_team flag.
const requireManageTeam = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.authUser;
  if (user?.role !== "admin" && !user?.canManageTeam) {
    res.status(403).json({ message: "You don't have permission to manage the team." });
    return;
  }
  next();
};

// Real provisioned user accounts (this deployment is single-workspace, so
// every user row belongs to this workspace). "invited" = provisioned but the
// member hasn't completed their first login yet.
router.get("/metrix/workspaces/:workspaceId/members", requireAuth, requireWorkspaceAccess, requireManageTeam, async (req, res) => {
  const rows = await db
    .select({
      email: usersTable.email,
      role: usersTable.role,
      mustChangePassword: usersTable.mustChangePassword,
      canManageTeam: usersTable.canManageTeam,
      canViewAgencyRollups: usersTable.canViewAgencyRollups,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
      disabledAt: usersTable.disabledAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt), desc(usersTable.id));

  const data = ListWorkspaceMembersResponse.parse({
    members: rows.map((row) => ({
      email: row.email,
      status: row.disabledAt
        ? "disabled"
        : row.mustChangePassword && !row.lastLoginAt
          ? "invited"
          : "active",
      role: row.role === "admin" ? "admin" : "member",
      manage_team: row.role === "admin" || row.canManageTeam,
      view_agency_rollups: row.role === "admin" || row.canViewAgencyRollups,
      created_at: row.createdAt.toISOString(),
      last_login_at: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    })),
  });
  res.json(data);
});

router.post(
  "/metrix/workspaces/:workspaceId/members/:email/resend-temp-password",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    const [target] = await db
      .select({ id: usersTable.id, email: usersTable.email, disabledAt: usersTable.disabledAt })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!target) {
      res.status(404).json({ message: "Member not found." });
      return;
    }
    if (target.disabledAt) {
      res.status(409).json({
        message: "This account is disabled. Restore access before sending new credentials.",
      });
      return;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(usersTable.id, target.id));
    await destroyAllSessions(target.id);
    await deletePasswordResetTokensForUser(target.id);

    const emailResult = await sendApprovalEmail(
      target.email,
      tempPassword,
      getAppBaseUrl(),
      req.log,
    );
    const sent = emailResult.status === "sent";
    res.json(
      ResendMemberTempPasswordResponse.parse({
        status: "resent",
        email: target.email,
        email_sent: sent,
        ...(sent ? {} : { temp_password: tempPassword, email_error: emailResult.reason }),
      }),
    );
  },
);

router.patch(
  "/metrix/workspaces/:workspaceId/members/:email/status",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    const parsed = UpdateMemberStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "status must be 'active' or 'disabled'." });
      return;
    }

    if (parsed.data.status === "disabled") {
      if (req.authUser && email === req.authUser.email.toLowerCase()) {
        res.status(403).json({ message: "You can't remove your own access." });
        return;
      }
      if (isAgencyAdminEmail(email)) {
        res.status(403).json({ message: "This account is protected and can't be removed." });
        return;
      }
    }

    const [target] = await db
      .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!target) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    if (parsed.data.status === "disabled" && target.role === "admin") {
      const [adminRow] = await db
        .select({ total: count() })
        .from(usersTable)
        .where(and(eq(usersTable.role, "admin"), sql`${usersTable.disabledAt} is null`));
      if (Number(adminRow?.total ?? 0) <= 1) {
        res.status(409).json({ message: "Can't remove the workspace's only admin." });
        return;
      }
    }

    await db
      .update(usersTable)
      .set({ disabledAt: parsed.data.status === "disabled" ? new Date() : null })
      .where(eq(usersTable.id, target.id));

    if (parsed.data.status === "disabled") {
      await destroyAllSessions(target.id);
      await deletePasswordResetTokensForUser(target.id);
      req.log.info({ email: target.email }, "member access removed via team management");
    } else {
      req.log.info({ email: target.email }, "member access restored via team management");
    }

    res.json(UpdateMemberStatusResponse.parse({ status: parsed.data.status, email: target.email }));
  },
);

router.patch(
  "/metrix/workspaces/:workspaceId/members/:email/permissions",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    const parsed = UpdateMemberPermissionsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "manage_team and view_agency_rollups are required." });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!target) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    await db
      .update(usersTable)
      .set({
        canManageTeam: parsed.data.manage_team,
        canViewAgencyRollups: parsed.data.view_agency_rollups,
      })
      .where(eq(usersTable.id, target.id));

    const isAdmin = target.role === "admin";
    res.json(
      UpdateMemberPermissionsResponse.parse({
        status: "updated",
        manage_team: isAdmin || parsed.data.manage_team,
        view_agency_rollups: isAdmin || parsed.data.view_agency_rollups,
      }),
    );
  },
);

// Per-member ad-account grants. The target user just needs to exist as a
// real account (this deployment is single-workspace, so any provisioned
// user is implicitly a member); the target ad account must exist in the
// current Metrix seed.
const grantsForUser = async (userId: number): Promise<string[]> => {
  const rows = await db
    .select({ adAccountId: userAdAccountsTable.adAccountId })
    .from(userAdAccountsTable)
    .where(eq(userAdAccountsTable.userId, userId));
  return rows.map((r) => r.adAccountId);
};

router.get(
  "/metrix/workspaces/:workspaceId/members/:email/ad-accounts",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!target) {
      res.status(404).json({ message: "Member not found." });
      return;
    }
    const ad_account_ids = await grantsForUser(target.id);
    res.json(ListMemberAdAccountsResponse.parse({ ad_account_ids }));
  },
);

router.post(
  "/metrix/workspaces/:workspaceId/members/:email/ad-accounts",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    const parsed = GrantMemberAdAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "An ad account id is required." });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!target) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    let bundle: { ad_accounts?: { id: string }[] };
    try {
      bundle = (await getMetrixSeedFromSupabase()) as { ad_accounts?: { id: string }[] };
    } catch (err) {
      req.log.error({ err }, "Failed to load Metrix seed while granting ad account access");
      res.status(503).json({
        message: "Couldn't verify the ad account because the Metrix data layer is unavailable.",
      });
      return;
    }
    const accountExists = (bundle.ad_accounts ?? []).some(
      (a) => a.id === parsed.data.ad_account_id,
    );
    if (!accountExists) {
      res.status(400).json({ message: "Unknown ad account." });
      return;
    }

    await db
      .insert(userAdAccountsTable)
      .values({ userId: target.id, adAccountId: parsed.data.ad_account_id })
      .onConflictDoNothing({
        target: [userAdAccountsTable.userId, userAdAccountsTable.adAccountId],
      });

    const ad_account_ids = await grantsForUser(target.id);
    res.json(GrantMemberAdAccountResponse.parse({ status: "granted", ad_account_ids }));
  },
);

router.delete(
  "/metrix/workspaces/:workspaceId/members/:email/ad-accounts/:adAccountId",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const email = decodeURIComponent(String(req.params.email)).toLowerCase();
    const adAccountId = decodeURIComponent(String(req.params.adAccountId));

    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!target) {
      res.status(404).json({ message: "Member not found." });
      return;
    }

    await db
      .delete(userAdAccountsTable)
      .where(
        and(
          eq(userAdAccountsTable.userId, target.id),
          eq(userAdAccountsTable.adAccountId, adAccountId),
        ),
      );

    const ad_account_ids = await grantsForUser(target.id);
    res.json(RevokeMemberAdAccountResponse.parse({ status: "revoked", ad_account_ids }));
  },
);

router.get("/metrix/workspaces/:workspaceId/invites", requireAuth, requireWorkspaceAccess, requireManageTeam, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const rows = await db
    .select()
    .from(workspaceInvitesTable)
    .where(eq(workspaceInvitesTable.workspaceId, workspaceId))
    .orderBy(desc(workspaceInvitesTable.createdAt), desc(workspaceInvitesTable.id));

  const data = ListWorkspaceInvitesResponse.parse({
    invites: rows.map(inviteRowToApi),
  });
  res.json(data);
});

const getWorkspaceTeamFromSeed = async (): Promise<{
  memberEmails: Set<string>;
  seatLimit: number | null;
}> => {
  const bundle = (await getMetrixSeedFromSupabase()) as {
    workspace_settings?: {
      team?: { seat_limit?: number; members?: { email: string }[] };
    };
  };
  const team = bundle.workspace_settings?.team;
  return {
    memberEmails: new Set(
      (team?.members ?? []).map((m) => m.email.toLowerCase()),
    ),
    seatLimit: team?.seat_limit ?? null,
  };
};

router.post("/metrix/workspaces/:workspaceId/invites", requireAuth, requireWorkspaceAccess, requireManageTeam, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const parsed = CreateWorkspaceInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "A valid email and role are required." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;
  const manageTeam = parsed.data.manage_team;
  const viewAgencyRollups = parsed.data.view_agency_rollups;
  const adAccountIds = parsed.data.ad_account_ids;

  // Provisioning now happens immediately at invite time, so treat an email
  // that already has an active (logged-in) account as a hard stop rather
  // than silently re-provisioning it — that would reset their password and
  // overwrite their permissions/grants out from under them. Adjusting an
  // existing member's permissions/access goes through the permissions and
  // ad-account endpoints instead.
  const [existingActiveUser] = await db
    .select({ id: usersTable.id, lastLoginAt: usersTable.lastLoginAt })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existingActiveUser?.lastLoginAt) {
    res.status(409).json({
      message:
        "This person already has an active account. Use their row in the member list to change permissions or account access instead of re-inviting them.",
    });
    return;
  }

  const [existingInvite] = await db
    .select()
    .from(workspaceInvitesTable)
    .where(
      and(
        eq(workspaceInvitesTable.workspaceId, workspaceId),
        eq(workspaceInvitesTable.email, email),
      ),
    )
    .limit(1);

  if (existingInvite) {
    const data = CreateWorkspaceInviteResponse.parse({
      status: "already_invited",
      invite: inviteRowToApi(existingInvite),
    });
    res.json(data);
    return;
  }

  let team: Awaited<ReturnType<typeof getWorkspaceTeamFromSeed>>;
  try {
    team = await getWorkspaceTeamFromSeed();
  } catch (err) {
    req.log.error({ err }, "Failed to load workspace team from Metrix seed");
    res.status(503).json({
      message:
        "Couldn't verify available seats because the Metrix data layer is unavailable. Try again shortly.",
    });
    return;
  }

  // Seat check + insert must be atomic, or two invites racing at the last
  // free seat can both pass the check and both insert, over-booking the
  // workspace. We serialize per-workspace with a transaction-scoped advisory
  // lock, then re-count pending invites and insert inside the same
  // transaction so the count can't go stale between check and write.
  let seatFull = false;
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`metrix-invite:${workspaceId}`}))`);

    if (team.seatLimit !== null) {
      const pendingRows = await tx
        .select({ email: workspaceInvitesTable.email })
        .from(workspaceInvitesTable)
        .where(
          and(
            eq(workspaceInvitesTable.workspaceId, workspaceId),
            eq(workspaceInvitesTable.status, "invited"),
          ),
        );
      const pendingCount = pendingRows.filter(
        (row) => !team.memberEmails.has(row.email.toLowerCase()),
      ).length;
      const seatsUsed = team.memberEmails.size + pendingCount;

      if (seatsUsed >= team.seatLimit) {
        seatFull = true;
        return [] as (typeof workspaceInvitesTable.$inferSelect)[];
      }
    }

    return tx
      .insert(workspaceInvitesTable)
      .values({
        workspaceId,
        email,
        role,
        status: "invited",
        canManageTeam: manageTeam,
        canViewAgencyRollups: viewAgencyRollups,
        adAccountIds,
      })
      .onConflictDoNothing({
        target: [workspaceInvitesTable.workspaceId, workspaceInvitesTable.email],
      })
      .returning();
  });

  if (seatFull) {
    res.status(409).json({
      message: `This workspace is full: all ${team.seatLimit} seats are in use. Remove a member or cancel a pending invite before inviting someone new.`,
    });
    return;
  }

  if (inserted.length > 0) {
    // Single-step invite: the account is provisioned immediately (temp
    // password + email) rather than deferred to a later "acceptance" step,
    // which this codebase has never had. Grants apply as soon as the row
    // exists so the member's first login already has the right access.
    let provisioned: Awaited<ReturnType<typeof provisionApprovedUser>>;
    try {
      provisioned = await provisionApprovedUser(email, req.log, {
        canManageTeam: manageTeam,
        canViewAgencyRollups: viewAgencyRollups,
      });
    } catch (err) {
      req.log.error({ err, email }, "Failed to provision invited member account");
      res.status(500).json({ message: "The invite was recorded but the account couldn't be provisioned. Try resending it." });
      return;
    }

    if (adAccountIds.length > 0) {
      await db
        .insert(userAdAccountsTable)
        .values(adAccountIds.map((adAccountId) => ({ userId: provisioned.userId, adAccountId })))
        .onConflictDoNothing();
    }

    const data = CreateWorkspaceInviteResponse.parse({
      status: "created",
      invite: inviteRowToApi(inserted[0]),
      email_sent: provisioned.email_sent,
      ...(provisioned.temp_password ? { temp_password: provisioned.temp_password } : {}),
      ...(provisioned.email_error ? { email_error: provisioned.email_error } : {}),
    });
    res.json(data);
    return;
  }

  const [existing] = await db
    .select()
    .from(workspaceInvitesTable)
    .where(
      and(
        eq(workspaceInvitesTable.workspaceId, workspaceId),
        eq(workspaceInvitesTable.email, email),
      ),
    )
    .limit(1);

  const data = CreateWorkspaceInviteResponse.parse({
    status: "already_invited",
    invite: inviteRowToApi(existing),
  });
  res.json(data);
});

const parseInviteId = (raw: string): number | null => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

router.delete(
  "/metrix/workspaces/:workspaceId/invites/:inviteId",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const inviteId = parseInviteId(String(req.params.inviteId));
    if (inviteId === null) {
      res.status(404).json({ message: "Invite not found." });
      return;
    }

    const deleted = await db
      .delete(workspaceInvitesTable)
      .where(
        and(
          eq(workspaceInvitesTable.workspaceId, workspaceId),
          eq(workspaceInvitesTable.id, inviteId),
        ),
      )
      .returning({ id: workspaceInvitesTable.id, email: workspaceInvitesTable.email, status: workspaceInvitesTable.status });

    if (deleted.length === 0) {
      res.status(404).json({ message: "Invite not found." });
      return;
    }

    // Invites now provision the account immediately (no separate accept
    // step), so revoking one must also lock out the account it created —
    // otherwise a "revoked" invitee could still log in with their temp
    // password. Only lock out accounts that never completed first login;
    // an already-active member who happens to share an invite row is
    // managed through the admin disable/restore flow instead.
    const invite = deleted[0]!;
    if (invite.status === "invited") {
      const [invitedUser] = await db
        .select({ id: usersTable.id, lastLoginAt: usersTable.lastLoginAt })
        .from(usersTable)
        .where(eq(usersTable.email, invite.email))
        .limit(1);
      if (invitedUser && !invitedUser.lastLoginAt) {
        await db
          .update(usersTable)
          .set({ disabledAt: new Date() })
          .where(eq(usersTable.id, invitedUser.id));
        await destroyAllSessions(invitedUser.id);
        await deletePasswordResetTokensForUser(invitedUser.id);
        req.log.info({ email: invite.email }, "revoked invite disabled the provisioned account");
      }
    }

    const data = RevokeWorkspaceInviteResponse.parse({ status: "revoked" });
    res.json(data);
  },
);

router.post(
  "/metrix/workspaces/:workspaceId/invites/:inviteId/resend",
  requireAuth,
  requireWorkspaceAccess,
  requireManageTeam,
  async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const inviteId = parseInviteId(String(req.params.inviteId));
    if (inviteId === null) {
      res.status(404).json({ message: "Invite not found." });
      return;
    }

    const updated = await db
      .update(workspaceInvitesTable)
      .set({ createdAt: sql`now()` })
      .where(
        and(
          eq(workspaceInvitesTable.workspaceId, workspaceId),
          eq(workspaceInvitesTable.id, inviteId),
        ),
      )
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ message: "Invite not found." });
      return;
    }

    // The account is provisioned at invite-creation time, so "resend" means
    // re-issuing a fresh temp password + email for that already-existing
    // account (same as admin resend-temp-password), not re-creating a row.
    let provisioned: Awaited<ReturnType<typeof provisionApprovedUser>> | undefined;
    try {
      provisioned = await provisionApprovedUser(updated[0]!.email, req.log, {
        canManageTeam: updated[0]!.canManageTeam,
        canViewAgencyRollups: updated[0]!.canViewAgencyRollups,
      });
    } catch (err) {
      req.log.error({ err, email: updated[0]!.email }, "Failed to resend invite credentials");
    }

    const data = ResendWorkspaceInviteResponse.parse({
      status: "resent",
      invite: inviteRowToApi(updated[0]),
      ...(provisioned
        ? {
            email_sent: provisioned.email_sent,
            ...(provisioned.temp_password ? { temp_password: provisioned.temp_password } : {}),
            ...(provisioned.email_error ? { email_error: provisioned.email_error } : {}),
          }
        : { email_sent: false, email_error: "Failed to provision account." }),
    });
    res.json(data);
  },
);

const prefRowsToApi = (
  rows: {
    kind: string;
    key: string;
    enabled: boolean | null;
    email: boolean | null;
    inApp: boolean | null;
  }[],
) => ({
  channels: rows
    .filter((r) => r.kind === "channel")
    .map((r) => ({ id: r.key, enabled: r.enabled ?? false })),
  events: rows
    .filter((r) => r.kind === "event")
    .map((r) => ({ id: r.key, email: r.email ?? false, in_app: r.inApp ?? false })),
});

router.get("/metrix/workspaces/:workspaceId/notification-prefs", requireAuth, requireWorkspaceAccess, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const rows = await db
    .select()
    .from(workspaceNotificationPrefsTable)
    .where(eq(workspaceNotificationPrefsTable.workspaceId, workspaceId));

  res.json(UpdateNotificationPrefsResponse.parse(prefRowsToApi(rows)));
});

router.put("/metrix/workspaces/:workspaceId/notification-prefs", requireAuth, requireWorkspaceAccess, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const parsed = UpdateNotificationPrefsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid notification preference payload." });
    return;
  }

  const channelValues = (parsed.data.channels ?? []).map((c) => ({
    workspaceId,
    kind: "channel" as const,
    key: c.id,
    enabled: c.enabled,
    email: null,
    inApp: null,
  }));
  const eventValues = (parsed.data.events ?? []).map((e) => ({
    workspaceId,
    kind: "event" as const,
    key: e.id,
    enabled: null,
    email: e.email,
    inApp: e.in_app,
  }));
  const values = [...channelValues, ...eventValues];

  if (values.length > 0) {
    await db
      .insert(workspaceNotificationPrefsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          workspaceNotificationPrefsTable.workspaceId,
          workspaceNotificationPrefsTable.kind,
          workspaceNotificationPrefsTable.key,
        ],
        set: {
          enabled: sql`excluded.enabled`,
          email: sql`excluded.email`,
          inApp: sql`excluded.in_app`,
          updatedAt: new Date(),
        },
      });
  }

  const rows = await db
    .select()
    .from(workspaceNotificationPrefsTable)
    .where(eq(workspaceNotificationPrefsTable.workspaceId, workspaceId));

  res.json(UpdateNotificationPrefsResponse.parse(prefRowsToApi(rows)));
});

// ─── Report Builder settings (per-workspace overrides) ────────────────
// Singleton row per workspace; null columns fall back to seed defaults
// on the client.

const reportSettingsRowToApi = (row: WorkspaceReportSettings | undefined) => ({
  default_branding: row?.defaultBranding ?? null,
  default_format: row?.defaultFormat ?? null,
  default_mode: row?.defaultMode ?? null,
  schedule_enabled: row?.scheduleEnabled ?? null,
  schedule_cadence: row?.scheduleCadence ?? null,
  schedule_recipients: row?.scheduleRecipients ?? null,
});

router.get("/metrix/workspaces/:workspaceId/report-settings", requireAuth, requireWorkspaceAccess, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const rows = await db
    .select()
    .from(workspaceReportSettingsTable)
    .where(eq(workspaceReportSettingsTable.workspaceId, workspaceId))
    .limit(1);

  res.json(UpdateReportSettingsResponse.parse(reportSettingsRowToApi(rows[0])));
});

router.put("/metrix/workspaces/:workspaceId/report-settings", requireAuth, requireWorkspaceAccess, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const parsed = UpdateReportSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid report settings payload." });
    return;
  }

  const b = parsed.data;
  // Only overwrite columns the client actually sent; omitted keys keep
  // their stored value, explicit nulls clear the override.
  const patch: Partial<typeof workspaceReportSettingsTable.$inferInsert> = {};
  if ("default_branding" in b) patch.defaultBranding = b.default_branding ?? null;
  if ("default_format" in b) patch.defaultFormat = b.default_format ?? null;
  if ("default_mode" in b) patch.defaultMode = b.default_mode ?? null;
  if ("schedule_enabled" in b) patch.scheduleEnabled = b.schedule_enabled ?? null;
  if ("schedule_cadence" in b) patch.scheduleCadence = b.schedule_cadence ?? null;
  if ("schedule_recipients" in b) patch.scheduleRecipients = b.schedule_recipients ?? null;

  const [row] = await db
    .insert(workspaceReportSettingsTable)
    .values({ workspaceId, ...patch })
    .onConflictDoUpdate({
      target: [workspaceReportSettingsTable.workspaceId],
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();

  res.json(UpdateReportSettingsResponse.parse(reportSettingsRowToApi(row)));
});

// ─── Generated reports ────────────────────────────────────────────────
// Each generated report stores a full document snapshot (model_json) so
// Report History and Exports can re-download exactly what was generated,
// independent of later data changes.

const reportRowToApi = (row: WorkspaceReport) => ({
  id: row.id,
  ad_account_id: row.adAccountId,
  title: row.title,
  mode: row.mode,
  branding: row.branding,
  export_format: row.exportFormat,
  section_count: row.sectionCount,
  range_start: row.rangeStart ?? null,
  range_end: row.rangeEnd ?? null,
  range_source: row.rangeIsOverride ?? null,
  summary: row.summary,
  model_json: row.modelJson,
  generated_at: row.generatedAt.toISOString(),
});

router.get("/metrix/workspaces/:workspaceId/reports", requireAuth, requireWorkspaceAccess, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const user = req.authUser!;
  // Members see only reports they generated themselves; admins see all
  // (including legacy rows with no creator recorded).
  const where =
    user.role === "admin"
      ? eq(workspaceReportsTable.workspaceId, workspaceId)
      : and(
          eq(workspaceReportsTable.workspaceId, workspaceId),
          eq(workspaceReportsTable.createdByUserId, user.id),
        );
  const rows = await db
    .select()
    .from(workspaceReportsTable)
    .where(where)
    .orderBy(desc(workspaceReportsTable.generatedAt), desc(workspaceReportsTable.id));

  res.json(ListWorkspaceReportsResponse.parse({ reports: rows.map(reportRowToApi) }));
});

router.post("/metrix/workspaces/:workspaceId/reports", requireAuth, requireWorkspaceAccess, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const parsed = CreateWorkspaceReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid generated report payload." });
    return;
  }
  const b = parsed.data;

  // The snapshot must be a well-formed report document, not arbitrary JSON:
  // an object with a non-empty sections array of titled sections.
  let model: unknown;
  try {
    model = JSON.parse(b.model_json);
  } catch {
    res.status(400).json({ message: "Report snapshot is not valid JSON." });
    return;
  }
  const sections = (model as { sections?: unknown })?.sections;
  const validSections =
    Array.isArray(sections) &&
    sections.length > 0 &&
    sections.every(
      (s) => typeof s === "object" && s !== null && typeof (s as { title?: unknown }).title === "string",
    );
  if (!validSections) {
    res.status(400).json({ message: "Report snapshot must contain at least one titled section." });
    return;
  }

  const [row] = await db
    .insert(workspaceReportsTable)
    .values({
      workspaceId,
      adAccountId: b.ad_account_id,
      title: b.title,
      mode: b.mode,
      branding: b.branding,
      exportFormat: b.export_format,
      sectionCount: b.section_count,
      rangeStart: b.range_start ?? null,
      rangeEnd: b.range_end ?? null,
      rangeIsOverride: b.range_source ?? null,
      summary: b.summary,
      modelJson: b.model_json,
      createdByUserId: req.authUser!.id,
    })
    .returning();

  res.json(
    CreateWorkspaceReportResponse.parse({ status: "created", report: reportRowToApi(row) }),
  );
});

router.delete(
  "/metrix/workspaces/:workspaceId/reports/:reportId",
  requireAuth,
  requireWorkspaceAccess,
  async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const reportId = Number(String(req.params.reportId));
    if (!Number.isInteger(reportId) || reportId <= 0) {
      res.status(404).json({ message: "Report not found in this workspace." });
      return;
    }
    const user = req.authUser!;

    // Members can delete only their own reports; admins can delete any.
    // A member hitting someone else's report gets the same 404 as a
    // missing row — no existence leak.
    const deleteWhere =
      user.role === "admin"
        ? and(
            eq(workspaceReportsTable.workspaceId, workspaceId),
            eq(workspaceReportsTable.id, reportId),
          )
        : and(
            eq(workspaceReportsTable.workspaceId, workspaceId),
            eq(workspaceReportsTable.id, reportId),
            eq(workspaceReportsTable.createdByUserId, user.id),
          );

    const deleted = await db
      .delete(workspaceReportsTable)
      .where(deleteWhere)
      .returning({ id: workspaceReportsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ message: "Report not found in this workspace." });
      return;
    }

    res.json(DeleteWorkspaceReportResponse.parse({ status: "deleted", id: deleted[0].id }));
  },
);

router.post(
  "/metrix/workspaces/:workspaceId/reports/batch-delete",
  requireAuth,
  requireWorkspaceAccess,
  async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const parsed = BatchDeleteWorkspaceReportsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Provide at least one report id to delete." });
      return;
    }

    // De-dupe and keep only positive integer ids; anything else can't match a row.
    const ids = Array.from(new Set(parsed.data.report_ids)).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (ids.length === 0) {
      res.json(
        BatchDeleteWorkspaceReportsResponse.parse({ status: "deleted", deleted_ids: [], deleted_count: 0 }),
      );
      return;
    }

    const user = req.authUser!;

    // Members can delete only their own reports; admins can delete any in the
    // workspace. Ids that don't match a deletable row are silently dropped —
    // no existence leak, matching the single-delete semantics.
    const deleteWhere =
      user.role === "admin"
        ? and(
            eq(workspaceReportsTable.workspaceId, workspaceId),
            inArray(workspaceReportsTable.id, ids),
          )
        : and(
            eq(workspaceReportsTable.workspaceId, workspaceId),
            inArray(workspaceReportsTable.id, ids),
            eq(workspaceReportsTable.createdByUserId, user.id),
          );

    const deleted = await db
      .delete(workspaceReportsTable)
      .where(deleteWhere)
      .returning({ id: workspaceReportsTable.id });

    const deletedIds = deleted.map((r) => r.id);
    res.json(
      BatchDeleteWorkspaceReportsResponse.parse({
        status: "deleted",
        deleted_ids: deletedIds,
        deleted_count: deletedIds.length,
      }),
    );
  },
);

export default router;
