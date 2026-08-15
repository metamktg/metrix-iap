// Integration test for the conversion-export confirmation gate on
// POST /api/metrix/accounts/:accountId/analysis-runs.
//
// Regression guard: a staged delivery-class CSV (demographic/placement/
// ad-summary) with the all-zero-impressions conversion-export signature
// used to only produce a post-hoc warning AFTER the run committed
// impossible CTR/CPM numbers. It must now be rejected with 409 +
// code:"conversion_export_confirmation_required" up front, and only
// proceed when the caller resubmits with confirm_conversion_export:true.
//
// Boots the real Express app in-process against the live dev Supabase.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getMetrixSeedFromSupabase } from "../../lib/metrixSeedAssembly";
import { getSupabase } from "../../lib/supabase";
import {
  DEMOGRAPHIC_BREAKDOWN_COLUMNS,
  DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
  BASE_METRICS,
} from "../../lib/iapCsvSpec";

// ── CSV builder ──────────────────────────────────────────────────────────────

const q = (cell: string): string =>
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
const line = (cells: string[]): string => cells.map(q).join(",");

const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

function breakdownValue(col: string): string {
  switch (col) {
    case "Day":
      return "2026-07-01";
    case "Campaign ID":
      return "6001";
    case "Campaign name":
      return "Prospecting - Broad";
    case "Ad set ID":
      return "7001";
    case "Ad set name":
      return "Prospecting - Broad - AS1";
    case "Ad ID":
      return "8001";
    case "Ad name":
      return "ConversionGate_Test_Ad_v1";
    case "Gender":
      return "female";
    case "Age":
      return "25-34";
    case "Text":
      return "";
    case "Impression device":
      return "iphone";
    case "Platform":
      return "facebook";
    case "Placement":
      return "feed";
    default:
      return "x";
  }
}

function baseValue(col: string, opts: { zeroImpressions?: boolean }): string {
  if (col === "Amount spent ({ACCOUNT_CURRENCY})") return "42.50";
  if (col === "Result type") return "Purchases";
  if (col === "Result value type") return "";
  if (col === "Impressions") return opts.zeroImpressions ? "0" : "5100";
  if (col === "Reach") return "4800";
  if (col === "Results") return "3";
  return "";
}

function buildCsv(breakdownCols: readonly string[], opts: { zeroImpressions?: boolean } = {}): string {
  const header = [...breakdownCols, ...BASE_METRICS].map(resolveCurrency);
  const row = [
    ...breakdownCols.map(breakdownValue),
    ...BASE_METRICS.map((col) => baseValue(col, opts)),
  ];
  return [line(header), line(row)].join("\n");
}

// ── Test state ─────────────────────────────────────────────────────────────

let baseUrl: string;
let close: () => Promise<void>;
let adminUserId: number;
let adminToken: string;
let adAccountId: string;

const stagedImportIds: string[] = [];
let startedRunId: string | null = null;

beforeAll(async () => {
  const bundle = (await getMetrixSeedFromSupabase()) as {
    ad_accounts?: Array<{ id?: string }>;
  };
  const firstAccountId = bundle.ad_accounts?.[0]?.id;
  if (!firstAccountId) {
    throw new Error("Metrix seed bundle has no ad_accounts — cannot run conversion-export gate test.");
  }
  adAccountId = firstAccountId;

  const [admin] = await db
    .insert(usersTable)
    .values({
      email: `conv-export-gate-test-admin-${Date.now()}@example.test`,
      passwordHash: "test-not-a-real-hash",
      role: "admin",
    })
    .returning({ id: usersTable.id });
  adminUserId = admin.id;
  adminToken = (await createSession(adminUserId)).token;

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
  if (startedRunId) {
    // Mirror analysisEngine's deleteRunOutputs() — sweep every run-tagged
    // rollup table so this test never leaves synthetic rows behind in the
    // shared dev account it ran against.
    for (const table of [
      "ad_performance",
      "concept_performance",
      "variable_performance",
      "demographic_performance",
      "placement_performance",
      "platform_performance",
      "device_performance",
    ]) {
      await supabase.from(table).delete().eq("manual_analysis_run_id", startedRunId);
    }
    await supabase.from("manual_analysis_runs").delete().eq("id", startedRunId);
  }
  if (stagedImportIds.length > 0) {
    await supabase.from("manual_imports").delete().in("id", stagedImportIds);
  }
  if (adminUserId !== undefined) {
    await db.delete(userSessionsTable).where(inArray(userSessionsTable.userId, [adminUserId]));
    await db.delete(usersTable).where(inArray(usersTable.id, [adminUserId]));
  }
  await close?.();
  await pool.end();
}, 120_000);

// ── Helpers ────────────────────────────────────────────────────────────────

async function stageCsv(kind: "performance_demo_csv" | "performance_placement_csv", csvText: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/metrix/accounts/${adAccountId}/manual-imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${adminToken}` },
    body: JSON.stringify({
      kind,
      filename: `test-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
      content_base64: Buffer.from(csvText, "utf8").toString("base64"),
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { import_id: string };
  stagedImportIds.push(body.import_id);
  return body.import_id;
}

async function startRun(confirm?: boolean) {
  return fetch(`${baseUrl}/api/metrix/accounts/${adAccountId}/analysis-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${adminToken}` },
    body: JSON.stringify({
      date_range: "all",
      ...(confirm !== undefined ? { confirm_conversion_export: confirm } : {}),
    }),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /analysis-runs conversion-export confirmation gate", () => {
  it("rejects with 409 + code when a staged demographic CSV has all-zero impressions", async () => {
    await stageCsv("performance_demo_csv", buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, { zeroImpressions: true }));
    await stageCsv("performance_placement_csv", buildCsv(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS));

    const res = await startRun();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { message: string; code?: string; files?: string[] };
    expect(body.code).toBe("conversion_export_confirmation_required");
    expect(body.files?.length).toBeGreaterThan(0);
    expect(body.message).toMatch(/conversion-event export/i);
  }, 30_000);

  it("proceeds and starts the run when confirm_conversion_export is true", async () => {
    const res = await startRun(true);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { run_id: string };
    expect(body.run_id).toBeDefined();
    startedRunId = body.run_id;

    // Wait for the background pipeline to reach a terminal status before the
    // test process exits — otherwise the run (and this shared dev account)
    // are left stuck in "running", blocking every other run against it with
    // a false "already in progress" conflict.
    const deadline = Date.now() + 60_000;
    let status = "running";
    while (Date.now() < deadline) {
      const latestRes = await fetch(`${baseUrl}/api/metrix/accounts/${adAccountId}/analysis-runs/latest`, {
        headers: { Cookie: `${SESSION_COOKIE}=${adminToken}` },
      });
      const latestBody = (await latestRes.json()) as { run?: { id: string; status: string } };
      if (latestBody.run?.id === startedRunId) {
        status = latestBody.run.status;
        if (status === "success" || status === "error") break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(["success", "error"]).toContain(status);
  }, 65_000);
});
