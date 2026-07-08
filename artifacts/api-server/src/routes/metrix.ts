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
  UpdateReportSettingsBody,
  UpdateReportSettingsResponse,
  CreateWorkspaceReportBody,
  CreateWorkspaceReportResponse,
  ListWorkspaceReportsResponse,
  DeleteWorkspaceReportResponse,
} from "@workspace/api-zod";
import {
  db,
  agentWaitlistTable,
  usersTable,
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
import { sendApprovalEmail } from "../lib/approvalEmail";
import { isDisposableEmailDomain } from "../lib/disposableEmailDomains";
import { getMetrixSeedFromSupabase } from "../lib/metrixSeedAssembly";
import { getSupabase } from "../lib/supabase";
import { notifyRequestAccess } from "../lib/requestAccessNotification";

const router: IRouter = Router();

router.get("/metrix/seed", requireAuth, async (req, res) => {
  try {
    const bundle = await getMetrixSeedFromSupabase();
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

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    if (existingUser) {
      await db
        .update(usersTable)
        .set({ passwordHash, mustChangePassword: true })
        .where(eq(usersTable.id, existingUser.id));
    } else {
      await db
        .insert(usersTable)
        .values({ email: entry.email, passwordHash, mustChangePassword: true });
    }

    await db
      .update(agentWaitlistTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(agentWaitlistTable.id, entry.id));

    const appUrl = getAppLoginUrl();
    const emailResult = await sendApprovalEmail(
      entry.email,
      tempPassword,
      appUrl,
      req.log,
    );

    const data = ApproveAgentWaitlistEntryResponse.parse({
      status: "approved",
      email: entry.email,
      email_sent: emailResult === "sent",
      // Only surface the temp password to the admin when the email could not
      // be delivered — otherwise it must never leave the email channel.
      ...(emailResult === "sent" ? {} : { temp_password: tempPassword }),
    });
    res.json(data);
  },
);

function getAppLoginUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  const domain = domains?.split(",")[0]?.trim();
  return domain ? `https://${domain}/` : "https://app.metrix.ad/";
}

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

// Real provisioned user accounts (this deployment is single-workspace, so
// every user row belongs to this workspace). "invited" = provisioned but the
// member hasn't completed their first login yet.
router.get("/metrix/workspaces/:workspaceId/members", requireAuth, requireWorkspaceAccess, async (req, res) => {
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

router.get("/metrix/workspaces/:workspaceId/invites", requireAuth, requireWorkspaceAccess, async (req, res) => {
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

router.post("/metrix/workspaces/:workspaceId/invites", requireAuth, requireWorkspaceAccess, async (req, res) => {
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
  const rows = await db
    .select()
    .from(workspaceReportsTable)
    .where(eq(workspaceReportsTable.workspaceId, workspaceId))
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

    const deleted = await db
      .delete(workspaceReportsTable)
      .where(
        and(
          eq(workspaceReportsTable.workspaceId, workspaceId),
          eq(workspaceReportsTable.id, reportId),
        ),
      )
      .returning({ id: workspaceReportsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ message: "Report not found in this workspace." });
      return;
    }

    res.json(DeleteWorkspaceReportResponse.parse({ status: "deleted", id: deleted[0].id }));
  },
);

export default router;
