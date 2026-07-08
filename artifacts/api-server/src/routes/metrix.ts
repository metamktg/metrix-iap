import { Router, type IRouter } from "express";
import {
  GetMetrixSeedResponse,
  JoinAgentWaitlistBody,
  JoinAgentWaitlistResponse,
  ListAgentWaitlistQueryParams,
  ListAgentWaitlistResponse,
  CreateWorkspaceInviteBody,
  CreateWorkspaceInviteResponse,
  ListWorkspaceInvitesResponse,
  RevokeWorkspaceInviteResponse,
  ResendWorkspaceInviteResponse,
  UpdateNotificationPrefsBody,
  UpdateNotificationPrefsResponse,
} from "@workspace/api-zod";
import {
  db,
  agentWaitlistTable,
  workspaceInvitesTable,
  workspaceNotificationPrefsTable,
} from "@workspace/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { waitlistRateLimit } from "../middlewares/waitlistRateLimit";
import { isDisposableEmailDomain } from "../lib/disposableEmailDomains";
import seedBundle from "../data/metrix_seed_bundle.json" with { type: "json" };

const router: IRouter = Router();

router.get("/metrix/seed", (_req, res) => {
  const data = GetMetrixSeedResponse.parse(seedBundle);
  res.json(data);
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
        email: agentWaitlistTable.email,
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
      email: row.email,
      joined_at: row.createdAt.toISOString(),
    })),
    total,
  });
  res.json(data);
});

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

router.get("/metrix/workspaces/:workspaceId/invites", async (req, res) => {
  const workspaceId = req.params.workspaceId;
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

router.post("/metrix/workspaces/:workspaceId/invites", async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const parsed = CreateWorkspaceInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "A valid email and role are required." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;

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
  async (req, res) => {
    const workspaceId = req.params.workspaceId;
    const inviteId = parseInviteId(req.params.inviteId);
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
  async (req, res) => {
    const workspaceId = req.params.workspaceId;
    const inviteId = parseInviteId(req.params.inviteId);
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

router.get("/metrix/workspaces/:workspaceId/notification-prefs", async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const rows = await db
    .select()
    .from(workspaceNotificationPrefsTable)
    .where(eq(workspaceNotificationPrefsTable.workspaceId, workspaceId));

  res.json(UpdateNotificationPrefsResponse.parse(prefRowsToApi(rows)));
});

router.put("/metrix/workspaces/:workspaceId/notification-prefs", async (req, res) => {
  const workspaceId = req.params.workspaceId;
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

export default router;
