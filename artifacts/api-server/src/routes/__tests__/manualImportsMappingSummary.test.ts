// Integration test: mapping_summary round-trip through Supabase.
//
// Regression guard for the column-mapping-warnings persistence path:
//   POST /api/metrix/accounts/:accountId/manual-imports (stages file, stores mapping_summary)
//   GET  /api/metrix/accounts/:accountId/manual-imports (fetches from Supabase, returns it)
//
// A regression here (e.g. the column being null in the SELECT, a Zod schema
// stripping the field, or the DB insert omitting it) would silently hide all
// column-mapping warnings at the "Run analysis" step without any error.
//
// Covers both performance CSV classes (demographic and device_placement) by
// uploading a CSV that substitutes "Reach impressions" for "Reach", which
// scores Jaccard ≈ 0.5 against "Reach" and is promoted as tier "inferred".
// The test asserts that tier appears in the POST response *and* is still
// present after a GET (i.e. it survived the Supabase round-trip).
//
// Boots the real app in-process against the live dev Supabase. Test rows are
// inserted in beforeAll and cleaned up in afterAll.

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

// ── CSV builder ────────────────────────────────────────────────────────────────

const q = (cell: string): string =>
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
const csvLine = (cells: string[]): string => cells.map(q).join(",");

/** Resolve the currency placeholder so the header/row match what Meta exports. */
const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

/** Stock cell values that keep the parser happy for a single data row. */
function cellValue(col: string): string {
  const map: Record<string, string> = {
    Date: "2026-06-01",
    "Campaign ID": "6001",
    "Campaign name": "Test Campaign",
    "Ad set ID": "7001",
    "Ad set name": "Test Ad Set",
    "Ad ID": "8001",
    "Ad name": "Test_Ad_v1",
    Gender: "female",
    Age: "25-34",
    Text: "",
    "Impression device": "iphone",
    Platform: "facebook",
    Placement: "feed",
    "Amount spent (USD)": "42.50",
    "Result type": "Purchases",
    "Result value type": "",
    Impressions: "5100",
    Results: "3",
  };
  return map[col] ?? "";
}

/**
 * Build a minimal valid performance CSV for the given breakdown columns.
 * Replaces "Reach" with "Reach impressions" so the parser has to use
 * Jaccard inference (tier: "inferred", confidence ≈ 0.5) for that column.
 */
function buildCsvWithInferredReach(breakdownCols: readonly string[]): string {
  const allCols = [
    ...breakdownCols.map(resolveCurrency),
    ...BASE_METRICS.map(resolveCurrency),
  ];
  // Substitute the low-confidence alias for "Reach"
  const headerCols = allCols.map((c) => (c === "Reach" ? "Reach impressions" : c));
  // Data row: for "Reach impressions" use a plausible reach value
  const dataCols = headerCols.map((h) =>
    h === "Reach impressions" ? "4800" : cellValue(h),
  );
  return [csvLine(headerCols), csvLine(dataCols)].join("\n");
}

// ── Test state ─────────────────────────────────────────────────────────────────

let baseUrl: string;
let close: () => Promise<void>;
let adminUserId: number;
let adminToken: string;
let adAccountId: string;

const stagedImportIds: string[] = [];

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const bundle = (await getMetrixSeedFromSupabase()) as {
    ad_accounts?: Array<{ id?: string }>;
  };
  const firstAccountId = bundle.ad_accounts?.[0]?.id;
  if (!firstAccountId) {
    throw new Error(
      "Metrix seed bundle has no ad_accounts — cannot run manual-imports mapping-summary test.",
    );
  }
  adAccountId = firstAccountId;

  const [admin] = await db
    .insert(usersTable)
    .values({
      email: `mapping-summary-test-admin-${Date.now()}@example.test`,
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
  if (stagedImportIds.length > 0) {
    await supabase.from("manual_imports").delete().in("id", stagedImportIds);
  }
  if (adminUserId !== undefined) {
    await db.delete(userSessionsTable).where(inArray(userSessionsTable.userId, [adminUserId]));
    await db.delete(usersTable).where(inArray(usersTable.id, [adminUserId]));
  }
  await close?.();
  await pool.end();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function postImportUrl(): string {
  return `${baseUrl}/api/metrix/accounts/${adAccountId}/manual-imports`;
}

function getImportsUrl(): string {
  return `${baseUrl}/api/metrix/accounts/${adAccountId}/manual-imports`;
}

async function postCsv(kind: "performance_demo_csv" | "performance_placement_csv", csvText: string) {
  const res = await fetch(postImportUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE}=${adminToken}`,
    },
    body: JSON.stringify({
      kind,
      filename: `test-${kind}-${Date.now()}.csv`,
      content_base64: Buffer.from(csvText, "utf8").toString("base64"),
    }),
  });
  return res;
}

type MappingEntry = {
  canonical: string;
  found_as: string | null;
  confidence: number;
  method: string;
  tier: "exact" | "resolved" | "inferred" | "missing";
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("manual-imports mapping_summary round-trip", () => {
  describe("demographic CSV (performance_demo_csv)", () => {
    let importId: string;
    let postMappingSummary: MappingEntry[];

    it("POST stores mapping_summary including the inferred 'Reach' entry", async () => {
      const csv = buildCsvWithInferredReach(DEMOGRAPHIC_BREAKDOWN_COLUMNS);
      const res = await postCsv("performance_demo_csv", csv);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        import_id: string;
        mapping_summary?: MappingEntry[];
      };

      expect(body.import_id).toBeDefined();
      importId = body.import_id;
      stagedImportIds.push(importId);

      expect(Array.isArray(body.mapping_summary)).toBe(true);
      postMappingSummary = body.mapping_summary!;

      const reachEntry = postMappingSummary.find((e) => e.canonical === "Reach");
      expect(reachEntry).toBeDefined();
      expect(reachEntry!.tier).toBe("inferred");
      expect(reachEntry!.found_as).toBe("Reach impressions");
      expect(reachEntry!.confidence).toBeGreaterThanOrEqual(0.5);
    }, 30_000);

    it("GET /manual-imports returns the same mapping_summary (survived Supabase round-trip)", async () => {
      const res = await fetch(getImportsUrl(), {
        headers: { Cookie: `${SESSION_COOKIE}=${adminToken}` },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        imports: Array<{
          id: string;
          mapping_summary?: MappingEntry[] | null;
        }>;
      };

      const found = body.imports.find((r) => r.id === importId);
      expect(found).toBeDefined();
      expect(Array.isArray(found!.mapping_summary)).toBe(true);

      const getMappingSummary = found!.mapping_summary!;
      // Every canonical from the POST response should appear in the GET
      for (const postEntry of postMappingSummary) {
        const getEntry = getMappingSummary.find((e) => e.canonical === postEntry.canonical);
        expect(getEntry).toBeDefined();
        expect(getEntry!.tier).toBe(postEntry.tier);
        expect(getEntry!.confidence).toBe(postEntry.confidence);
        expect(getEntry!.found_as).toBe(postEntry.found_as);
      }

      // Specifically confirm the inferred "Reach" entry survived
      const reachEntry = getMappingSummary.find((e) => e.canonical === "Reach");
      expect(reachEntry).toBeDefined();
      expect(reachEntry!.tier).toBe("inferred");
      expect(reachEntry!.found_as).toBe("Reach impressions");
    }, 30_000);
  });

  describe("device_placement CSV (performance_placement_csv)", () => {
    let importId: string;
    let postMappingSummary: MappingEntry[];

    it("POST stores mapping_summary including the inferred 'Reach' entry", async () => {
      const csv = buildCsvWithInferredReach(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS);
      const res = await postCsv("performance_placement_csv", csv);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        import_id: string;
        mapping_summary?: MappingEntry[];
      };

      expect(body.import_id).toBeDefined();
      importId = body.import_id;
      stagedImportIds.push(importId);

      expect(Array.isArray(body.mapping_summary)).toBe(true);
      postMappingSummary = body.mapping_summary!;

      const reachEntry = postMappingSummary.find((e) => e.canonical === "Reach");
      expect(reachEntry).toBeDefined();
      expect(reachEntry!.tier).toBe("inferred");
      expect(reachEntry!.found_as).toBe("Reach impressions");
      expect(reachEntry!.confidence).toBeGreaterThanOrEqual(0.5);
    }, 30_000);

    it("GET /manual-imports returns the same mapping_summary (survived Supabase round-trip)", async () => {
      const res = await fetch(getImportsUrl(), {
        headers: { Cookie: `${SESSION_COOKIE}=${adminToken}` },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        imports: Array<{
          id: string;
          mapping_summary?: MappingEntry[] | null;
        }>;
      };

      const found = body.imports.find((r) => r.id === importId);
      expect(found).toBeDefined();
      expect(Array.isArray(found!.mapping_summary)).toBe(true);

      const getMappingSummary = found!.mapping_summary!;
      // Every canonical from the POST response should appear in the GET
      for (const postEntry of postMappingSummary) {
        const getEntry = getMappingSummary.find((e) => e.canonical === postEntry.canonical);
        expect(getEntry).toBeDefined();
        expect(getEntry!.tier).toBe(postEntry.tier);
        expect(getEntry!.confidence).toBe(postEntry.confidence);
        expect(getEntry!.found_as).toBe(postEntry.found_as);
      }

      // Specifically confirm the inferred "Reach" entry survived
      const reachEntry = getMappingSummary.find((e) => e.canonical === "Reach");
      expect(reachEntry).toBeDefined();
      expect(reachEntry!.tier).toBe("inferred");
      expect(reachEntry!.found_as).toBe("Reach impressions");
    }, 30_000);
  });

  describe("auth gates", () => {
    it("POST 401s when unauthenticated", async () => {
      const res = await fetch(postImportUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "performance_demo_csv", filename: "test.csv", content_base64: "aGVsbG8=" }),
      });
      expect(res.status).toBe(401);
    });

    it("GET 401s when unauthenticated", async () => {
      const res = await fetch(getImportsUrl());
      expect(res.status).toBe(401);
    });
  });
});
