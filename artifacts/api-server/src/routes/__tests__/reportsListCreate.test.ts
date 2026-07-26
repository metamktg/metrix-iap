import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable, workspaceReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getMetrixSeedFromSupabase } from "../../lib/metrixSeedAssembly";

// Guards the sibling report endpoints
// (GET/POST /metrix/workspaces/:workspaceId/reports) against regressions in
// auth/middleware or route wiring, mirroring reportDeletion.test.ts:
// unauthenticated -> 401, wrong-workspace -> 403, member/admin scoping on
// list, and payload validation on create.
//
// Boots the real app in-process (no separate server process) against the
// live dev DB/Supabase, since requireWorkspaceAccess depends on the real
// seed bundle's manager_account.id.

let baseUrl: string;
let close: () => Promise<void>;
let adminUserId: number;
let adminSessionToken: string;
let memberUserId: number;
let memberSessionToken: string;
let otherMemberUserId: number;
let workspaceId: string;
let adAccountId: string;

function makeReport(overrides: Partial<{ createdByUserId: number | null }> = {}) {
  return {
    workspaceId,
    adAccountId,
    createdByUserId: overrides.createdByUserId ?? adminUserId,
    title: "Reports list/create test report",
    mode: "internal",
    branding: "metrix",
    exportFormat: "pdf",
    sectionCount: 1,
    rangeStart: null,
    rangeEnd: null,
    rangeIsOverride: null,
    summary: "Test summary",
    modelJson: JSON.stringify({ sections: [{ title: "Overview" }] }),
  };
}

async function insertReport(overrides?: Partial<{ createdByUserId: number | null }>) {
  const [row] = await db
    .insert(workspaceReportsTable)
    .values(makeReport(overrides))
    .returning({ id: workspaceReportsTable.id });
  return row.id;
}

function reportsUrl(ws: string): string {
  return `${baseUrl}/api/metrix/workspaces/${ws}/reports`;
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    ad_account_id: adAccountId,
    title: "Created via test",
    mode: "internal",
    branding: "metrix",
    export_format: "pdf",
    section_count: 1,
    range_start: null,
    range_end: null,
    range_source: null,
    summary: "Test summary",
    model_json: JSON.stringify({ sections: [{ title: "Overview" }] }),
    ...overrides,
  };
}

beforeAll(async () => {
  const bundle = (await getMetrixSeedFromSupabase()) as {
    manager_account?: { id?: string };
    ad_accounts?: Array<{ id?: string }>;
  };
  const managerId = bundle.manager_account?.id;
  const firstAccountId = bundle.ad_accounts?.[0]?.id;
  if (!managerId || !firstAccountId) {
    throw new Error(
      "Metrix seed bundle unavailable/empty — cannot exercise real requireWorkspaceAccess in this test.",
    );
  }
  workspaceId = managerId;
  adAccountId = firstAccountId;

  const [admin] = await db
    .insert(usersTable)
    .values({
      email: `reports-list-admin-test-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "admin",
    })
    .returning({ id: usersTable.id });
  adminUserId = admin.id;
  adminSessionToken = (await createSession(adminUserId)).token;

  const [member] = await db
    .insert(usersTable)
    .values({
      email: `reports-list-member-test-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "member",
    })
    .returning({ id: usersTable.id });
  memberUserId = member.id;
  memberSessionToken = (await createSession(memberUserId)).token;

  const [otherMember] = await db
    .insert(usersTable)
    .values({
      email: `reports-list-other-member-test-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "member",
    })
    .returning({ id: usersTable.id });
  otherMemberUserId = otherMember.id;

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      close = () => new Promise<void>((res) => server.close(() => res()));
      resolve();
    });
  });
// beforeAll timeout raised to 30 s: getMetrixSeedFromSupabase() can exceed
// the default 10 s hookTimeout when Supabase is cold.
}, 30_000);

afterAll(async () => {
  await db
    .delete(workspaceReportsTable)
    .where(eq(workspaceReportsTable.createdByUserId, adminUserId));
  await db
    .delete(workspaceReportsTable)
    .where(eq(workspaceReportsTable.createdByUserId, memberUserId));
  await db
    .delete(workspaceReportsTable)
    .where(eq(workspaceReportsTable.createdByUserId, otherMemberUserId));
  await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, adminUserId));
  await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, memberUserId));
  await db.delete(usersTable).where(eq(usersTable.id, adminUserId));
  await db.delete(usersTable).where(eq(usersTable.id, memberUserId));
  await db.delete(usersTable).where(eq(usersTable.id, otherMemberUserId));
  // Guard: if beforeAll timed out before the server was started, close is
  // still the uninitialized module-level let (undefined). Skip gracefully.
  if (typeof close === "function") await close();
  await pool.end();
});

describe("GET /metrix/workspaces/:workspaceId/reports", () => {
  it("401s when unauthenticated", async () => {
    const res = await fetch(reportsUrl(workspaceId));
    expect(res.status).toBe(401);
  });

  it("403s for a workspace id that isn't this deployment's manager account", async () => {
    const res = await fetch(reportsUrl("some-other-workspace"), {
      headers: { Cookie: `${SESSION_COOKIE}=${adminSessionToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("a member sees only their own reports, not another member's or an admin's", async () => {
    const memberReportId = await insertReport({ createdByUserId: memberUserId });
    const otherMemberReportId = await insertReport({ createdByUserId: otherMemberUserId });
    const adminReportId = await insertReport({ createdByUserId: adminUserId });

    const res = await fetch(reportsUrl(workspaceId), {
      headers: { Cookie: `${SESSION_COOKIE}=${memberSessionToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reports: Array<{ id: number }> };
    const ids = body.reports.map((r) => r.id);
    expect(ids).toContain(memberReportId);
    expect(ids).not.toContain(otherMemberReportId);
    expect(ids).not.toContain(adminReportId);
  });

  it("an admin sees reports from every creator", async () => {
    const memberReportId = await insertReport({ createdByUserId: memberUserId });
    const adminReportId = await insertReport({ createdByUserId: adminUserId });

    const res = await fetch(reportsUrl(workspaceId), {
      headers: { Cookie: `${SESSION_COOKIE}=${adminSessionToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reports: Array<{ id: number }> };
    const ids = body.reports.map((r) => r.id);
    expect(ids).toContain(memberReportId);
    expect(ids).toContain(adminReportId);
  });
});

describe("POST /metrix/workspaces/:workspaceId/reports", () => {
  it("401s when unauthenticated", async () => {
    const res = await fetch(reportsUrl(workspaceId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCreateBody()),
    });
    expect(res.status).toBe(401);
  });

  it("403s for a workspace id that isn't this deployment's manager account", async () => {
    const res = await fetch(reportsUrl("some-other-workspace"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE}=${adminSessionToken}`,
      },
      body: JSON.stringify(validCreateBody()),
    });
    expect(res.status).toBe(403);
  });

  it("400s when the body fails schema validation", async () => {
    const res = await fetch(reportsUrl(workspaceId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE}=${adminSessionToken}`,
      },
      body: JSON.stringify({ ...validCreateBody(), mode: "not-a-real-mode" }),
    });
    expect(res.status).toBe(400);
  });

  it("400s when model_json is not valid JSON", async () => {
    const res = await fetch(reportsUrl(workspaceId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE}=${adminSessionToken}`,
      },
      body: JSON.stringify(validCreateBody({ model_json: "{not json" })),
    });
    expect(res.status).toBe(400);
  });

  it("400s when model_json has no titled sections", async () => {
    const res = await fetch(reportsUrl(workspaceId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE}=${adminSessionToken}`,
      },
      body: JSON.stringify(validCreateBody({ model_json: JSON.stringify({ sections: [] }) })),
    });
    expect(res.status).toBe(400);
  });

  it("creates a report scoped to the caller and workspace on success", async () => {
    const res = await fetch(reportsUrl(workspaceId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE}=${memberSessionToken}`,
      },
      body: JSON.stringify(validCreateBody()),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; report: { id: number; title: string } };
    expect(body.status).toBe("created");
    expect(body.report.title).toBe("Created via test");

    const [row] = await db
      .select()
      .from(workspaceReportsTable)
      .where(eq(workspaceReportsTable.id, body.report.id));
    expect(row.workspaceId).toBe(workspaceId);
    expect(row.createdByUserId).toBe(memberUserId);
  });
});
