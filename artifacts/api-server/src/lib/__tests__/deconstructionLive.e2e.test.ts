// ─── Creative deconstruction — LIVE end-to-end round-trip (opt-in) ─────
//
// Exercises the full path that the unit tests can't: a real fixture PNG is
// uploaded through POST /metrix/accounts/:id/manual-imports (real bytea
// staging), POST /metrix/accounts/:id/deconstruct-creatives triggers a real
// vision-model classification, the run is polled to completion, and the
// resulting creative_deconstructions row (and, when the 80% gate is
// cleared, the library_cells filing with provenance keys) is asserted.
//
// OPT-IN because every run costs model tokens:
//     LIVE_DECONSTRUCT_E2E=1 pnpm --filter @workspace/api-server run test:live-deconstruct
// Without the env var the whole suite is skipped (no cost in CI/workflows).
//
// Failure taxonomy — each assertion labels its failure domain so a break is
// immediately attributable:
//   [STAGING]     upload/bytea path broke (manual-imports POST)
//   [RUN/MODEL]   the generation run errored — model call, image block
//                 encoding, or JSON parsing (run.error_message included)
//   [PERSISTENCE] the run succeeded but the classification/library rows are
//                 missing or malformed in Supabase
//
// All rows are created under a throwaway ad account and deleted afterwards.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { db, pool, usersTable, userSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../app";
import { createSession, SESSION_COOKIE } from "../../lib/sessions";
import { getSupabase } from "../supabase";
import { CONFIDENCE_GATE, isRegistryValidVariable, type DetectedVariable } from "../deconstructionEngine";

const LIVE = process.env["LIVE_DECONSTRUCT_E2E"] === "1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "deconstruction-fixture.png");

// A model round-trip over an image can take a while; the run also boots
// in the background, so poll generously.
const RUN_POLL_TIMEOUT_MS = 180_000;
const RUN_POLL_INTERVAL_MS = 3_000;

describe.skipIf(!LIVE)("creative deconstruction — live end-to-end (opt-in)", () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let adminUserId: number;
  let adminToken: string;
  let importId: string;

  const accountId = `act_test_deconstruct_e2e_${Date.now()}`;

  beforeAll(async () => {
    // Boot the real app in-process.
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));

    // Admin user + session (custom cookie auth).
    const [admin] = await db
      .insert(usersTable)
      .values({
        email: `deconstruct-e2e-${Date.now()}@example.test`,
        passwordHash: "test-not-a-real-hash",
        role: "admin",
      })
      .returning({ id: usersTable.id });
    adminUserId = admin!.id;
    adminToken = (await createSession(adminUserId)).token;

    // Throwaway ad account — keeps library_cells writes away from real data.
    // Retried to ride out transient Supabase/Cloudflare 5xx errors.
    const supabase = getSupabase();
    let lastErr: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabase
        .from("ad_accounts")
        .insert({ id: accountId, name: "Deconstruction E2E (test)", status: "unconfigured" });
      if (!error) { lastErr = null; break; }
      lastErr = error.message;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    if (lastErr) throw new Error(`[STAGING] Could not create test ad account: ${lastErr.slice(0, 500)}`);
  }, 120_000);

  afterAll(async () => {
    const supabase = getSupabase();
    // Order matters only for the FK back to ad_accounts.
    for (const table of [
      "creative_deconstructions",
      "library_cells",
      "generation_runs",
      "manual_imports",
    ]) {
      const { error } = await supabase.from(table).delete().eq("account_id", accountId);
      if (error) console.error(`Cleanup of ${table} failed: ${error.message}`);
    }
    const { error: accErr } = await supabase.from("ad_accounts").delete().eq("id", accountId);
    if (accErr) console.error(`Cleanup of ad_accounts failed: ${accErr.message}`);
    if (adminUserId) {
      await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, adminUserId));
      await db.delete(usersTable).where(eq(usersTable.id, adminUserId));
    }
    await close?.();
    await pool.end();
  }, 120_000);

  const authed = (init?: RequestInit): RequestInit => ({
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE}=${adminToken}`,
      ...(init?.headers ?? {}),
    },
  });

  it("stages the fixture PNG through the real upload endpoint", async () => {
    const png = await readFile(FIXTURE);
    const res = await fetch(`${baseUrl}/api/metrix/accounts/${accountId}/manual-imports`, authed({
      method: "POST",
      body: JSON.stringify({
        kind: "creative_asset",
        filename: "deconstruction-fixture.png",
        content_type: "image/png",
        content_base64: png.toString("base64"),
      }),
    }));
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    expect(res.status, `[STAGING] upload failed: ${JSON.stringify(body)}`).toBe(200);
    expect(body?.["status"], "[STAGING] unexpected upload response").toBe("staged");
    importId = String(body!["import_id"]);

    // Round-trip check on the bytea path: the stored content must decode
    // back to the exact bytes we uploaded (hex `\x` PostgREST encoding).
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("manual_imports")
      .select("content, size_bytes")
      .eq("id", importId)
      .single();
    expect(error, `[STAGING] could not read staged import back: ${error?.message}`).toBeNull();
    expect(Number(data!["size_bytes"]), "[STAGING] stored size mismatch").toBe(png.length);
    const raw = String(data!["content"]);
    const decoded = Buffer.from(raw.startsWith("\\x") ? raw.slice(2) : raw, "hex");
    expect(decoded.equals(png), "[STAGING] bytea round-trip corrupted the image bytes").toBe(true);
  }, 60_000);

  it("runs a real deconstruction and lands a registry-valid classification", async () => {
    expect(importId, "[STAGING] no staged import from the previous step").toBeTruthy();

    // Trigger the run.
    const start = await fetch(
      `${baseUrl}/api/metrix/accounts/${accountId}/deconstruct-creatives`,
      authed({ method: "POST", body: JSON.stringify({ import_ids: [importId] }) }),
    );
    const startBody = (await start.json().catch(() => null)) as Record<string, unknown> | null;
    expect(start.status, `[RUN/MODEL] deconstruct endpoint rejected: ${JSON.stringify(startBody)}`).toBe(202);
    const runId = String(startBody!["run_id"]);

    // Poll the run to completion.
    const deadline = Date.now() + RUN_POLL_TIMEOUT_MS;
    let run: Record<string, unknown> | null = null;
    while (Date.now() < deadline) {
      const res = await fetch(
        `${baseUrl}/api/metrix/accounts/${accountId}/generation-runs/deconstruct/latest`,
        authed(),
      );
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      run = (body?.["run"] as Record<string, unknown> | null) ?? null;
      if (run && String(run["id"]) === runId && run["status"] !== "running") break;
      await new Promise((r) => setTimeout(r, RUN_POLL_INTERVAL_MS));
    }
    expect(run, "[RUN/MODEL] run never appeared via the latest-run endpoint").toBeTruthy();
    expect(
      run!["status"],
      `[RUN/MODEL] deconstruction run failed (model call / image encoding / JSON parsing): ${String(run!["error_message"] ?? "(timed out while still running)")}`,
    ).toBe("success");

    // ── Classification row: exists, registry-valid, correctly linked. ──
    const list = await fetch(
      `${baseUrl}/api/metrix/accounts/${accountId}/creative-deconstructions`,
      authed(),
    );
    const listBody = (await list.json().catch(() => null)) as Record<string, unknown> | null;
    expect(list.status, "[PERSISTENCE] could not list deconstructions").toBe(200);
    const dec = (((listBody?.["deconstructions"] as Array<Record<string, unknown>> | undefined) ?? [])).find(
      (d: Record<string, unknown>) => String(d["manual_import_id"]) === importId,
    );
    expect(dec, "[PERSISTENCE] run succeeded but no classification row exists for the import").toBeTruthy();
    if (!dec) throw new Error("[PERSISTENCE] classification row missing");
    expect(String(dec["generation_run_id"] ?? ""), "[PERSISTENCE] classification not linked to the run").toBe(runId);
    expect(
      ["auto_filed", "needs_review"],
      "[PERSISTENCE] unexpected classification status",
    ).toContain(String(dec["status"]));

    const variables = dec["variables"] as DetectedVariable[];
    expect(variables.length, "[PERSISTENCE] classification has no variables").toBeGreaterThan(0);
    for (const v of variables) {
      expect(
        isRegistryValidVariable(v),
        `[PERSISTENCE] non-registry-valid variable persisted: ${v.family}/${v.code}`,
      ).toBe(true);
      expect(v.confidence).toBeGreaterThanOrEqual(0);
      expect(v.confidence).toBeLessThanOrEqual(1);
    }
    const overall = Number(dec["overall_confidence"]);
    expect(Number.isFinite(overall), "[PERSISTENCE] overall_confidence missing").toBe(true);

    // ── Gate consequence: at/above 80% must be filed with provenance. ──
    const supabase = getSupabase();
    const { data: cells, error: cellErr } = await supabase
      .from("library_cells")
      .select("cell_id, payload")
      .eq("account_id", accountId);
    expect(cellErr, `[PERSISTENCE] could not read library_cells: ${cellErr?.message}`).toBeNull();

    if (String(dec["status"]) === "auto_filed") {
      expect(overall).toBeGreaterThanOrEqual(CONFIDENCE_GATE);
      const filed = (cells ?? []).find(
        (c) => (c["payload"] as Record<string, unknown> | null)?.["deconstruction_of"] === importId,
      );
      expect(filed, "[PERSISTENCE] auto_filed classification has no derived library_cells row").toBeTruthy();
      const payload = filed!["payload"] as Record<string, unknown>;
      expect(payload["source"], "[PERSISTENCE] provenance source key wrong").toBe("deconstructed");
      expect(payload["deconstruction_run_id"], "[PERSISTENCE] provenance run key wrong").toBe(runId);
      expect(String(dec["cell_id"] ?? ""), "[PERSISTENCE] cell_id not stamped on classification").toBe(
        String(filed!["cell_id"]),
      );
      expect(String(filed!["cell_id"])).toMatch(/^C\d+[A-Z]$/);
    } else {
      // Below the gate nothing may be filed — the review queue owns it.
      expect(overall).toBeLessThan(CONFIDENCE_GATE);
      const filed = (cells ?? []).find(
        (c) => (c["payload"] as Record<string, unknown> | null)?.["deconstruction_of"] === importId,
      );
      expect(filed, "[PERSISTENCE] needs_review classification must not be filed").toBeUndefined();
    }
  }, RUN_POLL_TIMEOUT_MS + 60_000);
});
