import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable, workspaceReportsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getMetrixSeedFromSupabase } from "../../lib/metrixSeedAssembly";

// Guards the batch-delete route
// (POST /metrix/workspaces/:workspaceId/reports/batch-delete) against
// regressions in auth/middleware or route wiring: unauthenticated → 401,
// wrong-workspace → 403, empty/invalid payload → 400, member-scoping (a
// member can't delete someone else's report), and a real success case that
// removes only the requested rows and reports the deleted ids/count.
//
// Boots the real app in-process (no separate server process) against the
// live dev DB/Supabase, since requireWorkspaceAccess depends on the real
// seed bundle's manager_account.id.

let baseUrl: string;
let close: () => Promise<void>;
let adminUserId: number;
let memberUserId: number;
let adminToken: string;
let memberToken: string;
let workspaceId: string;
let adAccountId: string;

function makeReport(createdByUserId: number) {
  return {
    workspaceId,
    adAccountId,
    createdByUserId,
    title: "Report batch-deletion test report",
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

async function insertReport(createdByUserId: number): Promise<number> {
  const [row] = await db
    .insert(workspaceReportsTable)
    .values(makeReport(createdByUserId))
    .returning({ id: workspaceReportsTable.id });
  return row.id;
}

async function existingIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: workspaceReportsTable.id })
    .from(workspaceReportsTable)
    .where(inArray(workspaceReportsTable.id, ids));
  return rows.map((r) => r.id);
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
      email: `report-batch-admin-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "admin",
    })
    .returning({ id: usersTable.id });
  adminUserId = admin.id;

  const [member] = await db
    .insert(usersTable)
    .values({
      email: `report-batch-member-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "member",
    })
    .returning({ id: usersTable.id });
  memberUserId = member.id;

  adminToken = (await createSession(adminUserId)).token;
  memberToken = (await createSession(memberUserId)).token;

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      close = () => new Promise<void>((res) => server.close(() => res()));
      resolve();
    });
  });
});

afterAll(async () => {
  await db
    .delete(workspaceReportsTable)
    .where(inArray(workspaceReportsTable.createdByUserId, [adminUserId, memberUserId]));
  await db
    .delete(userSessionsTable)
    .where(inArray(userSessionsTable.userId, [adminUserId, memberUserId]));
  await db.delete(usersTable).where(inArray(usersTable.id, [adminUserId, memberUserId]));
  await close();
  await pool.end();
});

function batchUrl(ws: string): string {
  return `${baseUrl}/api/metrix/workspaces/${ws}/reports/batch-delete`;
}

function post(ws: string, body: unknown, token?: string) {
  return fetch(batchUrl(ws), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /metrix/workspaces/:workspaceId/reports/batch-delete", () => {
  it("401s when unauthenticated", async () => {
    const id = await insertReport(adminUserId);
    const res = await post(workspaceId, { report_ids: [id] });
    expect(res.status).toBe(401);
    expect(await existingIds([id])).toEqual([id]);
  });

  it("403s for a workspace id that isn't this deployment's manager account", async () => {
    const id = await insertReport(adminUserId);
    const res = await post("some-other-workspace", { report_ids: [id] }, adminToken);
    expect(res.status).toBe(403);
    expect(await existingIds([id])).toEqual([id]);
  });

  it("400s when report_ids is empty", async () => {
    const res = await post(workspaceId, { report_ids: [] }, adminToken);
    expect(res.status).toBe(400);
  });

  it("400s when report_ids is missing", async () => {
    const res = await post(workspaceId, {}, adminToken);
    expect(res.status).toBe(400);
  });

  it("deletes multiple rows and reports deleted ids/count on success", async () => {
    const ids = [
      await insertReport(adminUserId),
      await insertReport(adminUserId),
      await insertReport(adminUserId),
    ];
    const res = await post(workspaceId, { report_ids: ids }, adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; deleted_count?: number; deleted_ids?: number[] };
    expect(body.status).toBe("deleted");
    expect(body.deleted_count).toBe(3);
    expect([...(body.deleted_ids ?? [])].sort()).toEqual([...ids].sort());
    expect(await existingIds(ids)).toEqual([]);
  });

  it("silently ignores unknown ids and deletes the ones that match", async () => {
    const real = await insertReport(adminUserId);
    const res = await post(workspaceId, { report_ids: [real, 987654321] }, adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; deleted_count?: number; deleted_ids?: number[] };
    expect(body.deleted_count).toBe(1);
    expect(body.deleted_ids).toEqual([real]);
    expect(await existingIds([real])).toEqual([]);
  });

  it("a member cannot delete another user's reports", async () => {
    const adminOwned = await insertReport(adminUserId);
    const res = await post(workspaceId, { report_ids: [adminOwned] }, memberToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; deleted_count?: number; deleted_ids?: number[] };
    expect(body.deleted_count).toBe(0);
    expect(body.deleted_ids).toEqual([]);
    // The admin's report is untouched.
    expect(await existingIds([adminOwned])).toEqual([adminOwned]);
    // Clean up (member can't, so remove directly).
    await db.delete(workspaceReportsTable).where(eq(workspaceReportsTable.id, adminOwned));
  });
});
