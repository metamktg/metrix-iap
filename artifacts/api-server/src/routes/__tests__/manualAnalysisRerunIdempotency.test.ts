// Integration test: re-running analysis over the SAME data window must be
// idempotent — identical output rows, zero errors — including when the
// re-staged file dates the same days in a different (spreadsheet round-trip)
// format.
//
// Regression guard for the August 2026 AAFE re-ingestion failure: a
// corrected Demographics CSV re-exported through Google Sheets carried
// "3/13/2026"-style slash dates while the placements file carried ISO
// "2026-03-13". Unnormalized, the same real-world day existed under two
// bucket keys, the run's lexicographic min/max window was wrong (its
// window-delete destroyed rows outside the re-run's real span), and the
// insert died with:
//   duplicate key value violates unique constraint
//   "ad_performance_account_id_ad_name_campaign_name_result_type_key"
// leaving the account's rollups partially destroyed. With parse-time Day
// normalization (normalizeDayValues) + the pre-write guards in
// buildAdPerformanceRows + per-table delete-adjacent-to-insert, the same
// re-run must now succeed, fully supersede the first run's rows, and say
// how many rows it replaced.
//
// Boots the real Express app in-process against the live dev Supabase
// (same harness as manualAnalysisReuploadIsolation.test.ts).

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

// ── CSV builder (multi-row) ─────────────────────────────────────────────

const q = (cell: string): string =>
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
const line = (cells: string[]): string => cells.map(q).join(",");
const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

function breakdownValue(col: string, opts: { day: string; adName: string }): string {
  switch (col) {
    case "Day": return opts.day;
    case "Campaign ID": return "9301";
    case "Campaign name": return "Rerun Idempotency Test";
    case "Ad set ID": return "9401";
    case "Ad set name": return "Rerun Idempotency Test - AS1";
    case "Ad ID": return "9501";
    case "Ad name": return opts.adName;
    case "Gender": return "female";
    case "Age": return "25-34";
    case "Text": return "";
    case "Impression device": return "iphone";
    case "Platform": return "facebook";
    case "Placement": return "feed";
    default: return "x";
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
  rows: { day: string; adName: string; spend: string }[],
): string {
  const header = [...breakdownCols, ...BASE_METRICS].map(resolveCurrency);
  const dataLines = rows.map((r) =>
    line([
      ...breakdownCols.map((c) => breakdownValue(c, r)),
      ...BASE_METRICS.map((col) => baseValue(col, r.spend)),
    ]),
  );
  return [line(header), ...dataLines].join("\n");
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
      email: `rerun-idempotency-admin-${Date.now()}@example.test`,
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
    for (const table of ["demographic_signal", "placement_signal", "iap_runs", "ads"]) {
      await supabase.from(table).delete().eq("account_id", testAccountId);
    }
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
      filename: `rerun-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
      content_base64: Buffer.from(csvText, "utf8").toString("base64"),
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { import_id: string };
  stagedImportIds.push(body.import_id);
  return body.import_id;
}

type RunSnapshot = {
  id: string;
  status: string;
  imports_used: number | null;
  rows_ingested: number | null;
  error_message: string | null;
  csv_warnings: string[] | null;
};

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

type AdPerfRow = { ad_name: string; campaign_name: string; result_type: string; date_start: string; date_end: string; spend: number };

async function fetchAdPerformance(accountId: string): Promise<AdPerfRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ad_performance")
    .select("ad_name, campaign_name, result_type, date_start, date_end, spend, manual_analysis_run_id")
    .eq("account_id", accountId)
    .order("date_start")
    .order("ad_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as (AdPerfRow & { manual_analysis_run_id: string })[];
}

// ── Test ───────────────────────────────────────────────────────────────

// Days 13/14 so the M/D/YYYY re-stage is auto-disambiguated (day > 12) —
// matching the real AAFE file whose span crossed day 13.
const ISO_DAYS = ["2026-03-13", "2026-03-14"];
const MDY_DAYS = ["3/13/2026", "3/14/2026"];
const AD = "RerunIdempotency_v1";

describe("manual analysis re-run idempotency", () => {
  it("re-running the same window with a slash-dated re-export supersedes cleanly instead of colliding", async () => {
    testAccountId = await createManualAccount(`Rerun Idempotency Test ${Date.now()}`);

    // ── Run 1: ISO-dated batch ───────────────────────────────────────────
    await stageCsv(
      testAccountId,
      "performance_demo_csv",
      buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, ISO_DAYS.map((day) => ({ day, adName: AD, spend: "42.50" }))),
    );
    await stageCsv(
      testAccountId,
      "performance_placement_csv",
      buildCsv(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS, ISO_DAYS.map((day) => ({ day, adName: AD, spend: "42.50" }))),
    );
    const run1 = await runAnalysisAndWait(testAccountId);
    expect(run1.error_message).toBeNull();
    expect(run1.status).toBe("success");
    const rows1 = await fetchAdPerformance(testAccountId);
    expect(rows1.map((r) => r.date_start)).toEqual(ISO_DAYS);

    // ── Run 2: SAME data, demo re-exported with M/D/YYYY dates ──────────
    // (the exact real-world re-import case that used to crash with the
    // ad_performance unique-constraint violation)
    await stageCsv(
      testAccountId,
      "performance_demo_csv",
      buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, MDY_DAYS.map((day) => ({ day, adName: AD, spend: "42.50" }))),
    );
    await stageCsv(
      testAccountId,
      "performance_placement_csv",
      buildCsv(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS, ISO_DAYS.map((day) => ({ day, adName: AD, spend: "42.50" }))),
    );
    const run2 = await runAnalysisAndWait(testAccountId);
    expect(run2.error_message).toBeNull();
    expect(run2.status).toBe("success");

    // Idempotent supersede: identical logical rows, no duplicates, no
    // leftovers from run 1.
    const rows2 = await fetchAdPerformance(testAccountId);
    expect(rows2.length).toBe(rows1.length);
    expect(
      rows2.map((r) => [r.ad_name, r.campaign_name, r.result_type, r.date_start, r.date_end, String(r.spend)]),
    ).toEqual(
      rows1.map((r) => [r.ad_name, r.campaign_name, r.result_type, r.date_start, r.date_end, String(r.spend)]),
    );
    expect(new Set((rows2 as (AdPerfRow & { manual_analysis_run_id: string })[]).map((r) => r.manual_analysis_run_id))).toEqual(
      new Set([run2.id]),
    );

    // Honesty surface: the run tells the user its dates were normalized and
    // that it replaced the earlier rows rather than silently overwriting.
    const warnings = run2.csv_warnings ?? [];
    expect(warnings.some((w) => w.includes("normalized to YYYY-MM-DD"))).toBe(true);
    expect(warnings.some((w) => w.includes("[Re-run] Replaced"))).toBe(true);
  }, 120_000);

  it("rejects staging the byte-identical file twice into the same slot (409), while different bytes stay legal", async () => {
    // Same-bytes double-staging would double-count every row at analysis
    // time (accumulate() sums both copies into the same buckets) — observed
    // on a real account where the identical placement export was staged
    // twice. Different-bytes files per slot remain the legitimate
    // multi-file-per-slot workflow.
    const accountId = await createManualAccount(`Rerun Dedup Test ${Date.now()}`);
    try {
      const csv = buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, [{ day: "2026-04-13", adName: AD, spend: "10.00" }]);
      await stageCsv(accountId, "performance_demo_csv", csv);

      const dupRes = await fetch(`${baseUrl}/api/metrix/accounts/${accountId}/manual-imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${adminToken}` },
        body: JSON.stringify({
          kind: "performance_demo_csv",
          filename: `rerun-dedup-copy-${Date.now()}.csv`,
          content_base64: Buffer.from(csv, "utf8").toString("base64"),
        }),
      });
      expect(dupRes.status).toBe(409);
      const dupBody = (await dupRes.json()) as { message: string };
      expect(dupBody.message).toContain("already staged");
      expect(dupBody.message).toContain("double-count");

      // A different-bytes file for the same slot still stages fine.
      const otherCsv = buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, [{ day: "2026-04-14", adName: AD, spend: "11.00" }]);
      await stageCsv(accountId, "performance_demo_csv", otherCsv);
    } finally {
      const supabase = getSupabase();
      await supabase.from("manual_imports").delete().eq("account_id", accountId);
      await supabase.from("ad_accounts").delete().eq("id", accountId);
    }
  }, 60_000);
});
