// ─── /metrix waitlist routes ───────────────────────────────────────────
// Split out of routes/metrix.ts (E5) — a pure move. Routes appear here in
// their ORIGINAL registration order, and index.ts mounts the routers in
// the original order too, so Express matching is unchanged.

import { Router, type IRouter } from "express";
import {
  ListAgentWaitlistQueryParams,
  ListAgentWaitlistResponse,
  SubmitRequestAccessBody,
  SubmitRequestAccessResponse,
  ApproveAgentWaitlistEntryResponse,
  RejectAgentWaitlistEntryResponse,
  ListRequestAccessEntriesResponse,
  ApproveRequestAccessEntryResponse,
  RejectRequestAccessEntryResponse,
} from "@workspace/api-zod";
import { db, agentWaitlistTable, usersTable } from "@workspace/db";
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { waitlistRateLimit } from "../../middlewares/waitlistRateLimit";
import { isDisposableEmailDomain } from "../../lib/disposableEmailDomains";
import { getSupabase } from "../../lib/supabase";
import { notifyRequestAccess } from "../../lib/requestAccessNotification";
import { provisionApprovedUser } from "./shared";
// ─── Access requests (admin) ──────────────────────────────────────────
export type RequestAccessRow = {
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

const router: IRouter = Router();


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
  const { limit, offset, q } = parsedQuery.data;

  const searchFilter = q && q.trim()
    ? sql`${agentWaitlistTable.email} ILIKE ${"%" + q.trim().replace(/%/g, "\\%").replace(/_/g, "\\_") + "%"} ESCAPE '\\'`
    : undefined;

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
      .where(searchFilter)
      .orderBy(desc(agentWaitlistTable.createdAt), desc(agentWaitlistTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(agentWaitlistTable).where(searchFilter),
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

export default router;
