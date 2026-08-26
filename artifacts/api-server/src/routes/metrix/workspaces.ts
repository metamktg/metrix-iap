// ─── /metrix workspaces routes ───────────────────────────────────────────
// Split out of routes/metrix.ts (E5) — a pure move. Routes appear here in
// their ORIGINAL registration order, and index.ts mounts the routers in
// the original order too, so Express matching is unchanged.

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
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
  UpdateReportSettingsBody,
  UpdateReportSettingsResponse,
  CreateWorkspaceReportBody,
  CreateWorkspaceReportResponse,
  ListWorkspaceReportsResponse,
  DeleteWorkspaceReportResponse,
  BatchDeleteWorkspaceReportsBody,
  BatchDeleteWorkspaceReportsResponse,
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
  usersTable,
  userAdAccountsTable,
  workspaceInvitesTable,
  workspaceNotificationPrefsTable,
  workspaceReportSettingsTable,
  workspaceReportsTable,
  type WorkspaceReportSettings,
  type WorkspaceReport,
} from "@workspace/db";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { hashPassword, generateTempPassword } from "../../lib/passwords";
import { isAgencyAdminEmail } from "../../lib/agencyAccessSafeguard";
import { sendApprovalEmail } from "../../lib/approvalEmail";
import { deletePasswordResetTokensForUser } from "../../lib/passwordResets";
import { destroyAllSessions } from "../../lib/sessions";
import { getMetrixSeedFromSupabase } from "../../lib/metrixSeedAssembly";
import { getAppBaseUrl } from "../../lib/appUrl";
import { provisionApprovedUser } from "./shared";
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
export const requireWorkspaceAccess = async (
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
export const requireManageTeam = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.authUser;
  if (user?.role !== "admin" && !user?.canManageTeam) {
    res.status(403).json({ message: "You don't have permission to manage the team." });
    return;
  }
  next();
};

// Per-member ad-account grants. The target user just needs to exist as a
// real account (this deployment is single-workspace, so any provisioned
// user is implicitly a member); the target ad account must exist in the
// current Metrix seed.
export const grantsForUser = async (userId: number): Promise<string[]> => {
  const rows = await db
    .select({ adAccountId: userAdAccountsTable.adAccountId })
    .from(userAdAccountsTable)
    .where(eq(userAdAccountsTable.userId, userId));
  return rows.map((r) => r.adAccountId);
};

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
const parseInviteId = (raw: string): number | null => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};
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
// ─── Report Builder settings (per-workspace overrides) ────────────────
// Singleton row per workspace; null columns fall back to seed defaults
// on the client.
export const reportSettingsRowToApi = (row: WorkspaceReportSettings | undefined) => ({
  default_branding: row?.defaultBranding ?? null,
  default_format: row?.defaultFormat ?? null,
  default_mode: row?.defaultMode ?? null,
  schedule_enabled: row?.scheduleEnabled ?? null,
  schedule_cadence: row?.scheduleCadence ?? null,
  schedule_recipients: row?.scheduleRecipients ?? null,
});

// ─── Generated reports ────────────────────────────────────────────────
// Each generated report stores a full document snapshot (model_json) so
// Report History and Exports can re-download exactly what was generated,
// independent of later data changes.
export const reportRowToApi = (row: WorkspaceReport) => ({
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

// ─── Google Docs export ───────────────────────────────────────────────
// Creates a real Google Doc in the connected Google account's Drive and
// returns its edit URL. Returns { connected: false } when the Google Docs
// connector is not configured or the token has expired.
export type GdocModelLike = {
  docTitle?: string;
  accountName?: string;
  platform?: string;
  windowLabel?: string | null;
  /** True when the report includes analysis-derived sections (strategy,
   *  cell/variable performance) that are never scoped by windowLabel —
   *  see reportExport.ts's ReportModel for the full explanation. */
  hasAnalysisDerivedContent?: boolean;
  footerNote?: string;
  sections?: Array<{
    title?: string;
    blocks?: Array<{
      kind?: string;
      text?: string;
      items?: Array<{ label?: string; value?: string }>;
      headers?: string[];
      rows?: string[][];
      caption?: string;
      title?: string;
      data?: Array<{ label?: string; value?: number }>;
    }>;
  }>;
};

function buildGoogleDocContent(model: GdocModelLike): {
  text: string;
  styleRequests: object[];
} {
  let text = "";
  const styleRequests: object[] = [];

  function addHeading(level: "HEADING_1" | "HEADING_2", headingText: string): void {
    const start = 1 + text.length;
    text += headingText + "\n";
    const end = 1 + text.length;
    styleRequests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle: { namedStyleType: level },
        fields: "namedStyleType",
      },
    });
  }

  if (model.docTitle) addHeading("HEADING_1", model.docTitle);

  const meta = [model.accountName, model.platform].filter(Boolean).join(" · ");
  if (meta) text += meta + "\n";
  if (model.windowLabel) {
    text += model.hasAnalysisDerivedContent
      ? `Report window: ${model.windowLabel} (live performance) · Strategy & concept data: all-time\n`
      : `Report window: ${model.windowLabel}\n`;
  }
  text += "\n";

  for (const section of model.sections ?? []) {
    if (section.title) addHeading("HEADING_2", section.title);

    for (const block of section.blocks ?? []) {
      if (block.kind === "text" && block.text) {
        text += block.text + "\n\n";
      } else if (block.kind === "stats" && block.items?.length) {
        for (const item of block.items) {
          text += `${item.label ?? ""}: ${item.value ?? ""}\n`;
        }
        text += "\n";
      } else if (block.kind === "table") {
        if (block.caption) text += block.caption + "\n";
        if (block.headers?.length) text += block.headers.join("\t") + "\n";
        for (const row of block.rows ?? []) {
          text += row.join("\t") + "\n";
        }
        text += "\n";
      } else if (block.kind === "chart" && block.title) {
        text += block.title + ":\n";
        for (const d of block.data ?? []) {
          text += `  ${d.label ?? ""}: ${d.value != null ? d.value.toLocaleString("en-US") : ""}\n`;
        }
        text += "\n";
      }
    }
  }

  if (model.footerNote) {
    text += "\n" + model.footerNote + "\n";
  }

  return { text, styleRequests };
}

const router: IRouter = Router();


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


router.post(
  "/metrix/workspaces/:workspaceId/reports/google-doc",
  requireAuth,
  requireWorkspaceAccess,
  async (req, res) => {
    const { title, model_json } = req.body as { title?: unknown; model_json?: unknown };
    if (!title || typeof title !== "string" || !model_json || typeof model_json !== "string") {
      res.status(400).json({ message: "title and model_json are required." });
      return;
    }

    let model: GdocModelLike;
    try {
      model = JSON.parse(model_json) as GdocModelLike;
    } catch {
      res.status(400).json({ message: "model_json is not valid JSON." });
      return;
    }

    try {
      const { ReplitConnectors } = await import("@replit/connectors-sdk");
      const connectors = new ReplitConnectors();

      // Step 1: Create a blank Google Doc with the report title
      const createResp = await connectors.proxy("google-docs", "/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!createResp.ok) {
        res.json({ connected: false, url: null });
        return;
      }

      const doc = (await createResp.json()) as { documentId?: string };
      const documentId = doc.documentId;
      if (!documentId) {
        res.json({ connected: false, url: null });
        return;
      }

      // Step 2: Populate the doc with report content
      const { text, styleRequests } = buildGoogleDocContent(model);
      if (text.trim().length > 0) {
        const requests: object[] = [
          { insertText: { location: { index: 1 }, text } },
          ...styleRequests,
        ];
        await connectors.proxy("google-docs", `/v1/documents/${documentId}:batchUpdate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
      }

      const url = `https://docs.google.com/document/d/${documentId}/edit`;
      res.json({ connected: true, url });
    } catch {
      res.json({ connected: false, url: null });
    }
  },
);


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
