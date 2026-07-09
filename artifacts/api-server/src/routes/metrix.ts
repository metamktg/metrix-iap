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
  UpdateNotificationPrefsBody,
  UpdateNotificationPrefsResponse,
  SubmitRequestAccessBody,
  SubmitRequestAccessResponse,
  ApproveAgentWaitlistEntryResponse,
  RejectAgentWaitlistEntryResponse,
  AdminLoginBody,
  AdminLoginResponse,
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
import { and, count, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { requireAuth } from "../middlewares/requireAuth";
import { waitlistRateLimit } from "../middlewares/waitlistRateLimit";
import { hashPassword, generateTempPassword } from "../lib/passwords";
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
import { notifyRequestAccess } from "../lib/requestAccessNotification";
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
): Promise<{ email_sent: boolean; temp_password?: string; email_error?: string }> {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existingUser) {
    // Explicit approval is an unambiguous grant: it also restores a
    // previously revoked account.
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: true, disabledAt: null })
      .where(eq(usersTable.id, existingUser.id));
  } else {
    await db
      .insert(usersTable)
      .values({ email, passwordHash, mustChangePassword: true });
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
      bundle = composeSeedForUser(bundle, new Set(grants.map((g) => g.adAccountId)));
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

async function userHasAccountAccess(userId: number, accountId: string): Promise<boolean> {
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
    // makes the new account visible in their filtered seed.
    await db
      .insert(userAdAccountsTable)
      .values({ userId: user.id, adAccountId: accountId })
      .onConflictDoNothing();
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

    // Staged only: the file is stored raw for the analysis pipeline. It is
    // never parsed into performance data at upload time — no fabricated
    // numbers appear in the app from an upload alone.
    const insert = await supabase
      .from("manual_imports")
      .insert({
        account_id: accountId,
        kind: parsed.data.kind,
        filename: parsed.data.filename,
        content: `\\x${content.toString("hex")}`,
        size_bytes: content.length,
        uploaded_by_user_id: user.id,
        uploaded_by_email: user.email,
      })
      .select("id")
      .single();
    if (insert.error) throw new Error(insert.error.message);

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
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to stage manual import");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not stage the uploaded file.",
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
  createdAt: Date;
}) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
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

// Team-management endpoints (member roster + invites) are admin-only:
// members must never see the full client roster or manage invites.
const requireAdminRole = (req: Request, res: Response, next: NextFunction): void => {
  if (req.authUser?.role !== "admin") {
    res.status(403).json({ message: "Admin access required." });
    return;
  }
  next();
};

// Real provisioned user accounts (this deployment is single-workspace, so
// every user row belongs to this workspace). "invited" = provisioned but the
// member hasn't completed their first login yet.
router.get("/metrix/workspaces/:workspaceId/members", requireAuth, requireWorkspaceAccess, requireAdminRole, async (req, res) => {
  const rows = await db
    .select({
      email: usersTable.email,
      mustChangePassword: usersTable.mustChangePassword,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt), desc(usersTable.id));

  const data = ListWorkspaceMembersResponse.parse({
    members: rows.map((row) => ({
      email: row.email,
      status: row.mustChangePassword && !row.lastLoginAt ? "invited" : "active",
      created_at: row.createdAt.toISOString(),
      last_login_at: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    })),
  });
  res.json(data);
});

router.get("/metrix/workspaces/:workspaceId/invites", requireAuth, requireWorkspaceAccess, requireAdminRole, async (req, res) => {
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

router.post("/metrix/workspaces/:workspaceId/invites", requireAuth, requireWorkspaceAccess, requireAdminRole, async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const parsed = CreateWorkspaceInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "A valid email and role are required." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;

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

  if (team.seatLimit !== null) {
    const pendingRows = await db
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
      res.status(409).json({
        message: `This workspace is full: all ${team.seatLimit} seats are in use. Remove a member or cancel a pending invite before inviting someone new.`,
      });
      return;
    }
  }

  const inserted = await db
    .insert(workspaceInvitesTable)
    .values({ workspaceId, email, role, status: "invited" })
    .onConflictDoNothing({
      target: [workspaceInvitesTable.workspaceId, workspaceInvitesTable.email],
    })
    .returning();

  if (inserted.length > 0) {
    const data = CreateWorkspaceInviteResponse.parse({
      status: "created",
      invite: inviteRowToApi(inserted[0]),
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
  requireAdminRole,
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
      .returning({ id: workspaceInvitesTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ message: "Invite not found." });
      return;
    }

    const data = RevokeWorkspaceInviteResponse.parse({ status: "revoked" });
    res.json(data);
  },
);

router.post(
  "/metrix/workspaces/:workspaceId/invites/:inviteId/resend",
  requireAuth,
  requireWorkspaceAccess,
  requireAdminRole,
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

    const data = ResendWorkspaceInviteResponse.parse({
      status: "resent",
      invite: inviteRowToApi(updated[0]),
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

export default router;
