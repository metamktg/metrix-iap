// Integration test: a second (and later) analysis run must only ingest the
// CSVs currently staged for THAT run — never re-pull files a prior run
// already consumed and destaged to status="processed".
//
// Regression guard for a real bug found during the manual-import hardening
// pass: startManualAnalysis() originally fetched every manual_imports row
// matching the account + required kinds with NO status filter, so once an
// account had completed one run and its consumed CSVs flipped to
// status="processed" (kept around for the Import History / restage panel —
// see markImportsProcessed / restageImportsForRun), the NEXT run would
// silently re-pull those already-processed files alongside the newly staged
// batch and merge their rows together. Every account that re-uploads and
// re-runs — the documented, encouraged workflow ("Running again adds
// another snapshot") — would have silently accumulated and double-counted
// spend/impressions/results on every run after the first.
//
// This test creates an isolated manual account (never touched by any other
// suite), runs analysis on a first CSV batch, confirms it settles, then
// stages and runs a second, disjoint batch. The second run's
// `imports_used` must equal exactly the second batch's file count (2) —
// not 4, which is what the pre-fix query would have reported by also
// counting the first batch's now-processed files.
//
// Boots the real Express app in-process against the live dev Supabase.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getSupabase } from "../../lib/supabase";
import {
  DEMOGRAPHIC_BREAKDOWN_COLUMNS,
  DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
  BASE_METRICS,
} from "../../lib/iapCsvSpec";

// ── CSV builder ──────────────────────────────────────────────────────────

const q = (cell: string): string =>
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
const line = (cells: string[]): string => cells.map(q).join(",");

const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

function breakdownValue(col: string, opts: { day: string; adName: string }): string {
  switch (col) {
    case "Day":
      return opts.day;
    case "Campaign ID":
      return "9001";
    case "Campaign name":
      return "Reupload Isolation Test";
    case "Ad set ID":
      return "9101";
    case "Ad set name":
      return "Reupload Isolation Test - AS1";
    case "Ad ID":
      return "9201";
    case "Ad name":
      return opts.adName;
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

function baseValue(col: string, spend: string): string {
  if (col === "Amount spent ({ACCOUNT_CURRENCY})") return spend;
  if (col === "Result type") return "Purchases";
  if (col === "Result value type") return "";
  if (col === "Impressions") return "5100";
  if (col === "Reach") return "4800";
  if (col === "Results") return "3";
  return "";
}

function buildCsv(
  breakdownCols: readonly string[],
  opts: { day: string; adName: string; spend: string },
): string {
  const header = [...breakdownCols, ...BASE_METRICS].map(resolveCurrency);
  const row = [
    ...breakdownCols.map((c) => breakdownValue(c, opts)),
    ...BASE_METRICS.map((col) => baseValue(col, opts.spend)),
  ];
  return [line(header), line(row)].join("\n");
}

// ── Test state ─────────────────────────────────────────────────────────

let baseUrl: string;
let close: () => Promise<void>;
let adminUserId: number;
let adminToken: string;
let testAccountId: string | null = null;
const stagedImportIds: string[] = [];
const startedRunIds: string[] = [];

const ROLLUP_TABLES = [
  "ad_performance",
  "concept_performance",
  "variable_performance",
  "demographic_performance",
  "placement_performance",
  "platform_performance",
  "device_performance",
];

beforeAll(async () => {
  const [admin] = await db
    .insert(usersTable)
    .values({
      email: `reupload-isolation-admin-${Date.now()}@example.test`,
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
  for (const runId of startedRunIds) {
    for (const table of ROLLUP_TABLES) {
      await supabase.from(table).delete().eq("manual_analysis_run_id", runId);
    }
    await supabase.from("manual_analysis_runs").delete().eq("id", runId);
  }
  if (stagedImportIds.length > 0) {
    await supabase.from("manual_imports").delete().in("id", stagedImportIds);
  }
  if (testAccountId) {
    await supabase.from("ads").delete().eq("account_id", testAccountId);
    await supabase.from("ad_accounts").delete().eq("id", testAccountId);
  }
  if (adminUserId !== undefined) {
    await db.delete(userSessionsTable).where(inArray(userSessionsTable.userId, [adminUserId]));
    await db.delete(usersTable).where(inArray(usersTable.id, [adminUserId]));
  }
  await close?.();
  await pool.end();
}, 120_000);

// ── Helpers ────────────────────────────────────────────────────────────

async function createManualAccount(name: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/metrix/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${adminToken}` },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { account_id: string };
  return body.account_id;
}

async function stageCsv(
  accountId: string,
  kind: "performance_demo_csv" | "performance_placement_csv",
  csvText: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/metrix/accounts/${accountId}/manual-imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${adminToken}` },
    body: JSON.stringify({
      kind,
      filename: `reupload-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
      content_base64: Buffer.from(csvText, "utf8").toString("base64"),
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { import_id: string };
  stagedImportIds.push(body.import_id);
  return body.import_id;
}

type RunSnapshot = { id: string; status: string; imports_used: number | null; rows_ingested: number | null };

async function runAnalysisAndWait(accountId: string): Promise<RunSnapshot> {
  const startRes = await fetch(`${baseUrl}/api/metrix/accounts/${accountId}/analysis-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${adminToken}` },
    body: JSON.stringify({ date_range: "all" }),
  });
  expect(startRes.status).toBe(202);
  const { run_id } = (await startRes.json()) as { run_id: string };
  startedRunIds.push(run_id);

  const deadline = Date.now() + 60_000;
  let run: RunSnapshot | null = null;
  while (Date.now() < deadline) {
    const latestRes = await fetch(`${baseUrl}/api/metrix/accounts/${accountId}/analysis-runs/latest`, {
      headers: { Cookie: `${SESSION_COOKIE}=${adminToken}` },
    });
    const latestBody = (await latestRes.json()) as { run?: RunSnapshot | null };
    if (latestBody.run?.id === run_id && (latestBody.run.status === "success" || latestBody.run.status === "error")) {
      run = latestBody.run;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!run) throw new Error(`Run ${run_id} did not settle within the test deadline.`);
  return run;
}

// ── Test ───────────────────────────────────────────────────────────────

describe("manual analysis re-upload isolation", () => {
  it("a second run only ingests the second batch's staged CSVs, not files a prior run already consumed", async () => {
    testAccountId = await createManualAccount(`Reupload Isolation Test ${Date.now()}`);

    // ── Batch 1: stage + run ────────────────────────────────────────────
    await stageCsv(
      testAccountId,
      "performance_demo_csv",
      buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, { day: "2026-01-01", adName: "ReuploadBatch1_v1", spend: "42.50" }),
    );
    await stageCsv(
      testAccountId,
      "performance_placement_csv",
      buildCsv(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS, { day: "2026-01-01", adName: "ReuploadBatch1_v1", spend: "42.50" }),
    );

    const run1 = await runAnalysisAndWait(testAccountId);
    expect(run1.status).toBe("success");
    // Exactly the 2 files staged for batch 1 — nothing else exists yet.
    expect(run1.imports_used).toBe(2);

    // ── Batch 2: stage a second, disjoint batch + run again ─────────────
    // Batch 1's files are now status="processed" (destaged) — they must
    // NOT be re-pulled into this run.
    await stageCsv(
      testAccountId,
      "performance_demo_csv",
      buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, { day: "2026-02-01", adName: "ReuploadBatch2_v1", spend: "88.00" }),
    );
    await stageCsv(
      testAccountId,
      "performance_placement_csv",
      buildCsv(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS, { day: "2026-02-01", adName: "ReuploadBatch2_v1", spend: "88.00" }),
    );

    const run2 = await runAnalysisAndWait(testAccountId);
    expect(run2.status).toBe("success");
    // The regression: without the status="staged" filter, this would be 4
    // (batch 1's 2 now-processed files plus batch 2's 2 newly staged ones).
    expect(run2.imports_used).toBe(2);
    // Same shape of input (1 demo + 1 placement row) must ingest the same
    // number of output rows each time — if batch 1 leaked into run 2, this
    // would differ from run1.rows_ingested.
    expect(run2.rows_ingested).toBe(run1.rows_ingested);
  }, 120_000);
});
