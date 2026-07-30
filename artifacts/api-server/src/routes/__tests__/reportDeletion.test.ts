import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable, workspaceReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getMetrixSeedFromSupabase } from "../../lib/metrixSeedAssembly";

// Guards the delete route
// (DELETE /metrix/workspaces/:workspaceId/reports/:reportId) against
// regressions in auth/middleware or route wiring: unauthenticated → 401,
// wrong-workspace → 403, unknown id → 404, and a real success case that
// removes the row and returns {status:"deleted", id}.
//
// Boots the real app in-process (no separate server process) against the
// live dev DB/Supabase, since requireWorkspaceAccess depends on the real
// seed bundle's manager_account.id.

let baseUrl: string;
let close: () => Promise<void>;
let testUserId: number;
let sessionToken: string;
let workspaceId: string;
let adAccountId: string;

function makeReport(overrides: Partial<{ createdByUserId: number | null }> = {}) {
  return {
    workspaceId,
    adAccountId,
    createdByUserId: overrides.createdByUserId ?? testUserId,
    title: "Report deletion test report",
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

async function reportExists(id: number): Promise<boolean> {
  const rows = await db
    .select({ id: workspaceReportsTable.id })
    .from(workspaceReportsTable)
    .where(eq(workspaceReportsTable.id, id));
  return rows.length > 0;
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

  const [user] = await db
    .insert(usersTable)
    .values({
      email: `report-delete-test-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "admin",
    })
    .returning({ id: usersTable.id });
  testUserId = user.id;

  const session = await createSession(testUserId);
  sessionToken = session.token;

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      close = () =>
        new Promise<void>((res) => server.close(() => res()));
      resolve();
    });
  });
}, 90_000);

afterAll(async () => {
  if (testUserId) {
    await db
      .delete(workspaceReportsTable)
      .where(eq(workspaceReportsTable.createdByUserId, testUserId));
    await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, testUserId));
    await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  }
  if (typeof close === "function") await close();
  await pool.end();
});

function deleteUrl(ws: string, reportId: number | string): string {
  return `${baseUrl}/api/metrix/workspaces/${ws}/reports/${reportId}`;
}

describe("DELETE /metrix/workspaces/:workspaceId/reports/:reportId", () => {
  it("401s when unauthenticated", async () => {
    const reportId = await insertReport();
    const res = await fetch(deleteUrl(workspaceId, reportId), { method: "DELETE" });
    expect(res.status).toBe(401);
    expect(await reportExists(reportId)).toBe(true);
  });

  it("403s for a workspace id that isn't this deployment's manager account", async () => {
    const reportId = await insertReport();
    const res = await fetch(deleteUrl("some-other-workspace", reportId), {
      method: "DELETE",
      headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    expect(res.status).toBe(403);
    expect(await reportExists(reportId)).toBe(true);
  });

  it("404s for a non-existent report id", async () => {
    const res = await fetch(deleteUrl(workspaceId, 987654321), {
      method: "DELETE",
      headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    expect(res.status).toBe(404);
  });

  it("404s for a non-numeric report id instead of erroring", async () => {
    const res = await fetch(deleteUrl(workspaceId, "not-a-number"), {
      method: "DELETE",
      headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    expect(res.status).toBe(404);
  });

  it("deletes the row and returns {status:'deleted', id} on success", async () => {
    const reportId = await insertReport();
    const res = await fetch(deleteUrl(workspaceId, reportId), {
      method: "DELETE",
      headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "deleted", id: reportId });
    expect(await reportExists(reportId)).toBe(false);
  });

  it("a second delete of the same report 404s (no double-delete success)", async () => {
    const reportId = await insertReport();
    const first = await fetch(deleteUrl(workspaceId, reportId), {
      method: "DELETE",
      headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    expect(first.status).toBe(200);

    const second = await fetch(deleteUrl(workspaceId, reportId), {
      method: "DELETE",
      headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    expect(second.status).toBe(404);
  });
});
