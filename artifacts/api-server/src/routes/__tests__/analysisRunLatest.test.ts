import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getMetrixSeedFromSupabase } from "../../lib/metrixSeedAssembly";
import { getSupabase } from "../../lib/supabase";

// Integration tests for GET /metrix/accounts/:id/analysis-runs/latest.
//
// Covers:
//   1. Auth gates (401, 403)
//   2. Manual analysis run path: finished_at present after a completed run
//   3. Live-Meta fallback path: finished_at synthesized from report_pulls when
//      no manual run exists (the stale-warning persistence gap fixed by this task)
//   4. Live-Meta running state: finished_at is null when any class is still running
//
// Boots the real app in-process against the live dev Supabase. Test rows are
// inserted in beforeAll and cleaned up in afterAll.

let baseUrl: string;
let close: () => Promise<void>;
let adminUserId: number;
let memberUserId: number;
let adminToken: string;
let memberToken: string;
let adAccountId: string;
let testRunId: string | null = null;

// Fake act_-style account id used exclusively for the live-Meta fallback tests.
// This account has no manual_analysis_runs so the endpoint falls through to
// synthesizeRunFromReportPulls. Using a stable test-only prefix avoids
// collisions with real connected accounts.
const liveMetaTestAccountId = `act_test_analysis_run_latest_${Date.now()}`;
const liveMetaReportPullIds: string[] = [];

beforeAll(async () => {
  const bundle = (await getMetrixSeedFromSupabase()) as {
    ad_accounts?: Array<{ id?: string }>;
  };
  const firstAccountId = bundle.ad_accounts?.[0]?.id;
  if (!firstAccountId) {
    throw new Error(
      "Metrix seed bundle has no ad_accounts — cannot exercise analysis-run endpoint in this test.",
    );
  }
  adAccountId = firstAccountId;

  const [admin] = await db
    .insert(usersTable)
    .values({
      email: `analysis-run-admin-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "admin",
    })
    .returning({ id: usersTable.id });
  adminUserId = admin.id;

  const [member] = await db
    .insert(usersTable)
    .values({
      email: `analysis-run-member-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "member",
    })
    .returning({ id: usersTable.id });
  memberUserId = member.id;

  adminToken = (await createSession(adminUserId)).token;
  memberToken = (await createSession(memberUserId)).token;

  const supabase = getSupabase();

  // ── Manual run: insert a completed run for the first seed account ──────
  const { data: runRows, error: runErr } = await supabase
    .from("manual_analysis_runs")
    .insert({
      account_id: adAccountId,
      status: "success",
      date_range: "7d",
      date_start: "2025-01-01",
      date_end: "2025-01-07",
      rows_ingested: 42,
      imports_used: 2,
      started_at: new Date(Date.now() - 5000).toISOString(),
      finished_at: new Date().toISOString(),
      created_by: `analysis-run-test-${Date.now()}`,
    })
    .select("id");
  if (runErr) throw new Error(`Failed to insert test analysis run: ${runErr.message}`);
  testRunId = String(runRows![0]!["id"]);

  // ── Live-Meta fallback: insert two report_pulls (one per class, both success) ─
  // These use a fake act_-style account id so there are no manual_analysis_runs
  // for this account, exercising the synthesizeRunFromReportPulls path.
  const fetchedAt = new Date().toISOString();
  const REPORT_CLASSES = [
    "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
    "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
  ];
  for (const cls of REPORT_CLASSES) {
    const { data: pullRows, error: pullErr } = await supabase
      .from("report_pulls")
      .insert({
        user_id: String(adminUserId),
        ad_account_id: liveMetaTestAccountId,
        report_class: cls,
        status: "success",
        date_range_start: "2025-06-17",
        date_range_end: "2025-07-16",
        fetched_at: fetchedAt,
      })
      .select("id");
    if (pullErr) throw new Error(`Failed to insert test report_pull (${cls}): ${pullErr.message}`);
    liveMetaReportPullIds.push(String(pullRows![0]!["id"]));
  }

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      close = () => new Promise<void>((res) => server.close(() => res()));
      resolve();
    });
  });
}, 120_000);

afterAll(async () => {
  const supabase = getSupabase();
  if (testRunId) {
    await supabase.from("manual_analysis_runs").delete().eq("id", testRunId);
  }
  if (liveMetaReportPullIds.length > 0) {
    await supabase.from("report_pulls").delete().in("id", liveMetaReportPullIds);
  }
  if (adminUserId !== undefined || memberUserId !== undefined) {
    const userIds = [adminUserId, memberUserId].filter(
      (id): id is number => id !== undefined,
    );
    await db
      .delete(userSessionsTable)
      .where(inArray(userSessionsTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  await close?.();
  await pool.end();
});

function latestRunUrl(accountId: string): string {
  return `${baseUrl}/api/metrix/accounts/${accountId}/analysis-runs/latest`;
}

function get(accountId: string, token?: string) {
  return fetch(latestRunUrl(accountId), {
    headers: token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
}

describe("GET /metrix/accounts/:id/analysis-runs/latest", () => {
  it("401s when unauthenticated", async () => {
    const res = await get(adAccountId);
    expect(res.status).toBe(401);
  });

  it("403s when a member has no access to the account", async () => {
    const res = await get(adAccountId, memberToken);
    expect(res.status).toBe(403);
  });

  it("returns 200 with run=null for an unknown account", async () => {
    const res = await get("nonexistent-account-id", adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run: unknown };
    expect(body.run).toBeNull();
  });

  describe("manual analysis run path", () => {
    it("returns finished_at for a completed manual run", async () => {
      const res = await get(adAccountId, adminToken);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: Record<string, unknown> | null };
      expect(body.run).not.toBeNull();
      const run = body.run!;
      expect(typeof run["finished_at"]).toBe("string");
      expect((run["finished_at"] as string).length).toBeGreaterThan(0);
      expect(run["status"]).toBe("success");
      expect(run["account_id"]).toBe(adAccountId);
    });

    it("run shape includes all required OpenAPI fields", async () => {
      const res = await get(adAccountId, adminToken);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: Record<string, unknown> | null };
      const run = body.run!;
      expect(run).toHaveProperty("id");
      expect(run).toHaveProperty("account_id");
      expect(run).toHaveProperty("status");
      expect(run).toHaveProperty("date_range");
      expect(run).toHaveProperty("started_at");
      expect(run).toHaveProperty("finished_at");
    });
  });

  describe("live-Meta fallback path (synthesized from report_pulls)", () => {
    it("returns finished_at synthesized from report_pulls when no manual run exists", async () => {
      const res = await get(liveMetaTestAccountId, adminToken);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: Record<string, unknown> | null };
      expect(body.run).not.toBeNull();
      const run = body.run!;
      expect(typeof run["finished_at"]).toBe("string");
      expect((run["finished_at"] as string).length).toBeGreaterThan(0);
      expect(run["status"]).toBe("success");
      expect(run["account_id"]).toBe(liveMetaTestAccountId);
      expect(run["date_range"]).toBe("30d");
    });

    it("returns finished_at=null when any report class is still running", async () => {
      const supabase = getSupabase();
      // Insert a "running" pull for a separate fake account to isolate this case.
      const runningAccountId = `act_test_running_${Date.now()}`;
      const { data: pullRows, error: pullErr } = await supabase
        .from("report_pulls")
        .insert({
          user_id: String(adminUserId),
          ad_account_id: runningAccountId,
          report_class: "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
          status: "running",
          date_range_start: "2025-06-17",
          date_range_end: "2025-07-16",
          fetched_at: new Date().toISOString(),
        })
        .select("id");
      if (pullErr) throw new Error(`Failed to insert running report_pull: ${pullErr.message}`);
      const runningPullId = String(pullRows![0]!["id"]);

      try {
        const res = await get(runningAccountId, adminToken);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { run: Record<string, unknown> | null };
        expect(body.run).not.toBeNull();
        const run = body.run!;
        expect(run["status"]).toBe("running");
        expect(run["finished_at"]).toBeNull();
      } finally {
        await supabase.from("report_pulls").delete().eq("id", runningPullId);
      }
    }, 60_000);
  });
});
