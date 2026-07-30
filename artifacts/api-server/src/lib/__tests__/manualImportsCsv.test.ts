// Integration tests for POST /api/metrix/accounts/:accountId/manual-imports.
//
// Covers the full upload → decode → CSV-parse pipeline via the real HTTP API:
//   1. 401 when the request has no session cookie
//   2. Valid demographic CSV staged successfully (200, status:"staged")
//   3. Wrong-class CSV (device/placement headers in the demo slot) → 422 with
//      the cross-class mismatch message
//   4. Demographic CSV with all-zero impressions → 200, status:"staged",
//      upload_warnings includes the conversion-export notice
//   5. CSV with a missing critical breakdown column (Ad name) → 422
//
// Boots the real Express app in-process (app.listen(0)) against the live dev
// DB / Supabase — the route's account-existence check reads Supabase directly,
// so a stub would diverge from production behaviour.
//
// Uses an admin test user so the per-account access guard (userHasAccountAccess)
// is bypassed — the tests focus on the CSV validation path, not auth.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getMetrixSeedFromSupabase } from "../../lib/metrixSeedAssembly";
import { getSupabase } from "../../lib/supabase";
import {
  DEMOGRAPHIC_BREAKDOWN_COLUMNS,
  DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
  BASE_METRICS,
} from "../iapCsvSpec";

// ── CSV building helpers ──────────────────────────────────────────────────────

const q = (cell: string): string =>
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
const line = (cells: string[]): string => cells.map(q).join(",");

const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

function breakdownValue(col: string): string {
  switch (col) {
    case "Date":
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
      return "UGC_Testimonial_v1";
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

function baseValue(col: string): string {
  if (col === "Amount spent ({ACCOUNT_CURRENCY})") return "42.50";
  if (col === "Result type") return "Purchases";
  if (col === "Result value type") return "";
  if (col === "Impressions") return "5100";
  if (col === "Reach") return "4800";
  if (col === "Results") return "3";
  return "";
}

/** Builds a minimal, valid CSV for the given breakdown column set. */
function buildCsv(
  breakdownCols: readonly string[],
  opts: { dropBreakdown?: string; zeroImpressions?: boolean } = {},
): string {
  const cols = opts.dropBreakdown
    ? breakdownCols.filter((c) => c !== opts.dropBreakdown)
    : breakdownCols;
  const header = [...cols, ...BASE_METRICS].map(resolveCurrency);
  const row = [
    ...cols.map(breakdownValue),
    ...BASE_METRICS.map((col) =>
      opts.zeroImpressions && col === "Impressions" ? "0" : baseValue(col)
    ),
  ];
  return [line(header), line(row)].join("\n");
}

function toBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

// ── Test harness ─────────────────────────────────────────────────────────────

let baseUrl: string;
let close: () => Promise<void>;
let testUserId: number;
let sessionToken: string;
let accountId: string;

const stagedImportIds: string[] = [];

beforeAll(async () => {
  const bundle = (await getMetrixSeedFromSupabase()) as {
    ad_accounts?: Array<{ id?: string }>;
  };
  const firstAccountId = bundle.ad_accounts?.[0]?.id;
  if (!firstAccountId) {
    throw new Error(
      "Metrix seed bundle has no ad_accounts — cannot test the manual-imports route against a real Supabase account.",
    );
  }
  accountId = firstAccountId;

  const [user] = await db
    .insert(usersTable)
    .values({
      email: `manual-imports-csv-test-${Date.now()}@example.test`,
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
      close = () => new Promise<void>((res) => server.close(() => res()));
      resolve();
    });
  });
}, 120_000);

afterAll(async () => {
  if (stagedImportIds.length > 0) {
    const supabase = getSupabase();
    for (const id of stagedImportIds) {
      await supabase.from("manual_imports").delete().eq("id", id);
    }
  }
  await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, testUserId));
  await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  if (typeof close === "function") await close();
  await pool.end();
});

function stageUrl(acctId = accountId): string {
  return `${baseUrl}/api/metrix/accounts/${acctId}/manual-imports`;
}

function authHeaders(): { Cookie: string; "Content-Type": string } {
  return {
    Cookie: `${SESSION_COOKIE}=${sessionToken}`,
    "Content-Type": "application/json",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /metrix/accounts/:accountId/manual-imports — CSV validation", () => {
  it("401s when unauthenticated", async () => {
    const csvText = buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS);
    // No Cookie header — should be rejected by requireAuth.
    const res = await fetch(stageUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "performance_demo_csv",
        filename: "demo.csv",
        content_base64: toBase64(csvText),
      }),
    });
    expect(res.status).toBe(401);
  });

  it("stages a valid demographic CSV and returns status:staged", async () => {
    // Full valid demographic CSV — all required columns present, one data row.
    const csvText = buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS);
    const res = await fetch(stageUrl(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        kind: "performance_demo_csv",
        filename: "demo.csv",
        content_base64: toBase64(csvText),
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["status"]).toBe("staged");
    expect(typeof json["import_id"]).toBe("string");
    stagedImportIds.push(String(json["import_id"]));
  });

  it("rejects a device/placement CSV uploaded as the demographic slot with 422 and a mismatch message", async () => {
    // Build a device/placement CSV — its signature columns ("Placement",
    // "Impression device") should trigger detectCsvClassMismatch when parsed
    // under the "demographic" class.
    const csvText = buildCsv(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS);
    const res = await fetch(stageUrl(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        kind: "performance_demo_csv",
        filename: "placement.csv",
        content_base64: toBase64(csvText),
      }),
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as Record<string, unknown>;
    const msg = String(json["message"] ?? "");
    expect(msg).toMatch(/device.placement pivot/i);
    expect(msg).toMatch(/wrong slot/i);
  });

  it("stages a delivery CSV with all-zero impressions and returns upload_warnings with the conversion-export message", async () => {
    // A demographic CSV where every row has Impressions=0 signals a Meta
    // conversion-event export. The route should still stage the file but
    // include an upload_warnings entry explaining the anomaly.
    const csvText = buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, { zeroImpressions: true });
    const res = await fetch(stageUrl(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        kind: "performance_demo_csv",
        filename: "zero-impressions.csv",
        content_base64: toBase64(csvText),
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["status"]).toBe("staged");
    const warnings = json["upload_warnings"] as string[] | undefined;
    expect(Array.isArray(warnings)).toBe(true);
    expect(warnings!.some((w) => /conversion-event export/i.test(w))).toBe(true);
    stagedImportIds.push(String(json["import_id"]));
  });

  it("rejects a demographic CSV missing the critical 'Ad name' column with 422 and a column-not-found message", async () => {
    // Drop Ad name — a critical breakdown column that cannot be recovered by
    // fuzzy inference. The parser should hard-error with an IapCsvFormatError.
    const csvText = buildCsv(DEMOGRAPHIC_BREAKDOWN_COLUMNS, { dropBreakdown: "Ad name" });
    const res = await fetch(stageUrl(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        kind: "performance_demo_csv",
        filename: "missing_adname.csv",
        content_base64: toBase64(csvText),
      }),
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as Record<string, unknown>;
    const msg = String(json["message"] ?? "");
    expect(msg).toMatch(/required columns could not be found/i);
    expect(msg).toMatch(/Ad name/i);
  });
});
