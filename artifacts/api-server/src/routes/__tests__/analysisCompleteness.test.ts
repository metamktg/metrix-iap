import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getSupabase } from "../../lib/supabase";

// Integration tests for the analysis-validated pipeline:
//   1. GET /metrix/accounts/:id/analysis-completeness — auth gates + honest
//      per-surface verification (incomplete run → complete=false with gaps;
//      after all required surfaces get rows → complete=true).
//   2. GET /metrix/accounts/:id/stage-status — analysis.validated mirrors
//      the same completeness computation (single source of truth).
//   3. POST /metrix/accounts/:id/generate/strategy — 409 while the latest
//      manual run isn't validated (strategy readiness gate).
//
// Boots the real app in-process against the live dev Supabase. Test rows are
// inserted in beforeAll and cleaned up in afterAll. Runs are ordered: the
// incomplete-state assertions run BEFORE the surface rows are inserted.

let baseUrl: string;
let close: () => Promise<void>;
let adminUserId: number;
let memberUserId: number;
let adminToken: string;
let memberToken: string;
let adAccountId: string;
let testRunId: string | null = null;

const SURFACE_TABLES = [
  "ad_performance",
  "demographic_performance",
  "placement_performance",
  "platform_performance",
  "device_performance",
] as const;

beforeAll(async () => {
  // Lightweight account lookup — deliberately NOT the full seed assembly
  // (that query set is heavy and can 522 when Supabase is under load).
  const { data: accounts, error: acctErr } = await getSupabase()
    .from("ad_accounts")
    .select("id")
    .limit(1);
  if (acctErr) throw new Error(`Failed to list ad_accounts: ${acctErr.message}`);
  const firstAccountId = accounts?.[0]?.["id"];
  if (!firstAccountId) {
    throw new Error("No ad_accounts rows — cannot exercise completeness endpoint.");
  }
  adAccountId = String(firstAccountId);

  const [admin] = await db
    .insert(usersTable)
    .values({
      email: `completeness-admin-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "admin",
    })
    .returning({ id: usersTable.id });
  adminUserId = admin.id;

  const [member] = await db
    .insert(usersTable)
    .values({
      email: `completeness-member-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "member",
    })
    .returning({ id: usersTable.id });
  memberUserId = member.id;

  adminToken = (await createSession(adminUserId)).token;
  memberToken = (await createSession(memberUserId)).token;

  // Insert a fresh SUCCESS run with NO output rows — the completeness check
  // scopes to this (latest) run, so every required surface starts empty.
  const supabase = getSupabase();
  let runRows: Array<{ id: string | number }> | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await supabase
      .from("manual_analysis_runs")
      .insert({
        account_id: adAccountId,
        status: "success",
        date_range: "7d",
        date_start: "2025-01-01",
        date_end: "2025-01-07",
        rows_ingested: 0,
        started_at: new Date(Date.now() - 5000).toISOString(),
        finished_at: new Date().toISOString(),
        created_by: `completeness-test-${Date.now()}`,
      })
      .select("id");
    if (!error) { runRows = data; break; }
    if (attempt === 2) throw new Error(`Failed to insert test analysis run: ${error.message}`);
    await new Promise((res) => setTimeout(res, 3_000));
  }
  testRunId = String(runRows![0]!.id);

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
    for (const table of SURFACE_TABLES) {
      await supabase.from(table).delete().eq("manual_analysis_run_id", testRunId);
    }
    await supabase.from("manual_analysis_runs").delete().eq("id", testRunId);
  }
  if (adminUserId !== undefined || memberUserId !== undefined) {
    const userIds = [adminUserId, memberUserId].filter((id): id is number => id !== undefined);
    await db.delete(userSessionsTable).where(inArray(userSessionsTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  await close?.();
  await pool.end();
});

function get(path: string, token?: string) {
  return fetch(`${baseUrl}/api/metrix/accounts/${adAccountId}${path}`, {
    headers: token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
}

type Completeness = {
  run_id: string | null;
  run_status: string;
  complete: boolean;
  surfaces: Array<{ key: string; label: string; rows: number; required: boolean; ok: boolean; note: string | null }>;
};

describe("analysis completeness verification + strategy gate", () => {
  it("401s when unauthenticated", async () => {
    const res = await get("/analysis-completeness");
    expect(res.status).toBe(401);
  });

  it("403s for a member without account access", async () => {
    const res = await get("/analysis-completeness", memberToken);
    expect(res.status).toBe(403);
  });

  it("reports complete=false with per-surface gaps when the run wrote no rows", async () => {
    const res = await get("/analysis-completeness", adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Completeness;
    expect(body.run_id).toBe(testRunId);
    expect(body.run_status).toBe("success");
    expect(body.complete).toBe(false);
    // Every required surface must be present and flagged not-ok.
    const requiredKeys = SURFACE_TABLES.map(String);
    for (const key of requiredKeys) {
      const surface = body.surfaces.find((s) => s.key === key);
      expect(surface, `surface ${key} missing from response`).toBeDefined();
      expect(surface!.required).toBe(true);
      expect(surface!.ok).toBe(false);
      expect(surface!.rows).toBe(0);
    }
    // Optional surfaces are reported honestly but never block.
    const concepts = body.surfaces.find((s) => s.key === "concept_performance");
    expect(concepts?.required).toBe(false);
    expect(concepts?.ok).toBe(true);
    expect(body.surfaces.some((s) => s.key === "creative_library")).toBe(true);
  });

  it("stage-status reports validated=false for the incomplete run", async () => {
    const res = await get("/stage-status", adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      analysis: { status: string; validated: boolean; progress_pct: number; progress_stage: string };
    };
    expect(body.analysis.status).toBe("success");
    expect(body.analysis.validated).toBe(false);
    expect(typeof body.analysis.progress_pct).toBe("number");
    expect(typeof body.analysis.progress_stage).toBe("string");
  });

  it("blocks strategy generation with 409 while the analysis is not validated", async () => {
    const res = await fetch(`${baseUrl}/api/metrix/accounts/${adAccountId}/generate/strategy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
      body: JSON.stringify({ analysis_all_time: true }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/fully loaded analysis/i);
  });

  it("flips to complete=true and validated=true once every required surface has rows", async () => {
    const supabase = getSupabase();
    const base = {
      account_id: adAccountId,
      manual_analysis_run_id: testRunId,
      date_start: "2025-01-03",
      date_end: "2025-01-03",
      spend: 10,
    };
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [
      { table: "ad_performance",          row: { ...base, campaign_name: "T", ad_name: "completeness-test-ad", result_type: "Results" } },
      { table: "demographic_performance", row: { ...base, age: "25-34", gender: "female" } },
      { table: "placement_performance",   row: { ...base, placement: "Facebook Feed" } },
      { table: "platform_performance",    row: { ...base, platform: "facebook" } },
      { table: "device_performance",      row: { ...base, device: "mobile" } },
    ];
    for (const { table, row } of inserts) {
      const { error } = await supabase.from(table).insert(row);
      if (error) throw new Error(`${table}: ${error.message}`);
    }

    const res = await get("/analysis-completeness", adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Completeness;
    expect(body.complete).toBe(true);
    for (const key of SURFACE_TABLES) {
      const surface = body.surfaces.find((s) => s.key === key);
      expect(surface!.ok).toBe(true);
      expect(surface!.rows).toBeGreaterThan(0);
    }

    const statusRes = await get("/stage-status", adminToken);
    const statusBody = (await statusRes.json()) as { analysis: { validated: boolean } };
    expect(statusBody.analysis.validated).toBe(true);
  }, 60_000);
});
