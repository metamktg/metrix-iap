// ─── Manual analysis run: signal-table output + source guard ──────────
// The manual analysis engine must (a) refuse to run against accounts whose
// rows are owned by another pipeline (offline importer / live Meta pulls),
// and (b) besides the *_performance tables, write the importer-shaped
// demographic_signal / placement_signal rows the Analysis UI (Audience,
// Placements) and the strategy evidence pack actually read — without them a
// manual account's analysis populates totals but leaves those surfaces
// permanently empty. It must also register the account's IAP loop status
// (iap_runs, stage=analysis_core) so the loop reflects a real run happened.
//
// Runs against an in-memory Supabase stub (no DB needed) driving the REAL
// engine end to end: staged CSVs (the canonical sample exports) → run →
// output rows. Table/column shapes here are verified against the CURRENT
// schema (scripts/src/metrix-supabase/schema.sql), the CURRENT seed
// assembly read paths (metrixSeedAssembly.ts), and the CURRENT frontend
// payload types (DemographicRow/PlacementRow in seedTypes.ts) — not copied
// from the stale reference diff.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory Supabase stub ───────────────────────────────────────────

const db = new Map<string, Record<string, any>[]>();
let idCounter = 0;

type Filter = (r: Record<string, any>) => boolean;

class Builder {
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private conflictKeys: string[] = [];
  private ignoreDup = false;

  constructor(private table: string) {
    if (!db.has(table)) db.set(table, []);
  }

  select(_cols?: string) {
    return this;
  }
  insert(rows: any) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: any) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  upsert(rows: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictKeys = (opts?.onConflict ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.ignoreDup = Boolean(opts?.ignoreDuplicates);
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push((r) => String(r[col]) === String(val));
    return this;
  }
  in(col: string, vals: any[]) {
    const set = new Set(vals.map(String));
    this.filters.push((r) => set.has(String(r[col])));
    return this;
  }
  not(col: string, op: string, val: any) {
    if (op === "is" && val === null) this.filters.push((r) => r[col] !== null && r[col] !== undefined);
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push((r) => r[col] >= val);
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push((r) => r[col] <= val);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    return this.then((res: any) => ({ ...res, data: res.data?.[0] ?? null }));
  }

  private exec(): { data: any; error: null } {
    const rows = db.get(this.table)!;
    const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "insert") {
      const inserted = this.payload.map((row: Record<string, any>) => ({
        id: `${this.table}_${++idCounter}`,
        ...(this.table === "manual_analysis_runs" ? { started_at: new Date().toISOString() } : {}),
        ...row,
      }));
      rows.push(...inserted);
      return { data: inserted, error: null };
    }
    if (this.op === "update") {
      const matched = matches();
      for (const r of matched) Object.assign(r, this.payload);
      return { data: matched, error: null };
    }
    if (this.op === "delete") {
      const matched = new Set(matches());
      db.set(
        this.table,
        rows.filter((r) => !matched.has(r)),
      );
      return { data: [...matched], error: null };
    }
    if (this.op === "upsert") {
      const out: Record<string, any>[] = [];
      for (const row of this.payload) {
        const existing =
          this.conflictKeys.length > 0
            ? rows.find((r) => this.conflictKeys.every((k) => String(r[k]) === String(row[k])))
            : undefined;
        if (existing) {
          if (!this.ignoreDup) Object.assign(existing, row);
          out.push(existing);
        } else {
          const inserted = { id: `${this.table}_${++idCounter}`, ...row };
          rows.push(inserted);
          out.push(inserted);
        }
      }
      return { data: out, error: null };
    }
    let result = matches();
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      result = [...result].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.limitN !== null) result = result.slice(0, this.limitN);
    return { data: result, error: null };
  }

  then(onFulfilled?: any, onRejected?: any) {
    return Promise.resolve(this.exec()).then(onFulfilled, onRejected);
  }
}

vi.mock("../supabase", () => ({
  getSupabase: () => ({ from: (table: string) => new Builder(table) }),
}));

import { startManualAnalysis, AnalysisError } from "../analysisEngine";
import { buildIapCsvClassFormat } from "../iapCsvSpec";

const ACCOUNT = "manual_test1";

const stagedHex = (csv: string) => `\\x${Buffer.from(csv, "utf8").toString("hex")}`;

function seedManualAccount(sourceStatus = "manual_reports") {
  db.get("ad_accounts")!.push({ id: ACCOUNT, name: "Test Manual", status: "unconfigured", source_status: sourceStatus });
}

function stageBothCsvs() {
  db.get("manual_imports")!.push(
    {
      id: "imp_demo",
      account_id: ACCOUNT,
      kind: "performance_demo_csv",
      status: "staged",
      filename: "demo.csv",
      content: stagedHex(buildIapCsvClassFormat("demographic").sample_csv),
      ad_names: [],
    },
    {
      id: "imp_place",
      account_id: ACCOUNT,
      kind: "performance_placement_csv",
      status: "staged",
      filename: "placements.csv",
      content: stagedHex(buildIapCsvClassFormat("device_placement").sample_csv),
      ad_names: [],
    },
  );
}

async function waitForRunToSettle(index = 0): Promise<Record<string, any>> {
  for (let i = 0; i < 200; i++) {
    const runs = db.get("manual_analysis_runs")!;
    const run = runs[index];
    if (run && run["status"] !== "running") return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("analysis run never settled");
}

beforeEach(() => {
  db.clear();
  idCounter = 0;
  for (const table of [
    "ad_accounts",
    "manual_imports",
    "manual_analysis_runs",
    "ad_performance",
    "concept_performance",
    "variable_performance",
    "demographic_performance",
    "placement_performance",
    "platform_performance",
    "device_performance",
    "demographic_signal",
    "placement_signal",
    "iap_runs",
    "library_cells",
    "ads",
  ]) {
    db.set(table, []);
  }
});

describe("startManualAnalysis · source guard", () => {
  it("refuses accounts owned by another pipeline (importer/live)", async () => {
    seedManualAccount("seeded_from_uploaded_json");
    stageBothCsvs();
    await expect(startManualAnalysis(ACCOUNT, "all", "tester")).rejects.toMatchObject({
      name: "AnalysisError",
      statusCode: 422,
    });
    // Nothing was staged/started for the foreign-owned account.
    expect(db.get("manual_analysis_runs")).toHaveLength(0);
    expect(db.get("demographic_signal")).toHaveLength(0);
    expect(db.get("placement_signal")).toHaveLength(0);
  });

  it("refuses a live Meta account (no source_status at all defaults to non-manual)", async () => {
    db.get("ad_accounts")!.push({ id: ACCOUNT, name: "Live Meta Acct", status: "configured" });
    stageBothCsvs();
    await expect(startManualAnalysis(ACCOUNT, "all", "tester")).rejects.toBeInstanceOf(AnalysisError);
    expect(db.get("manual_analysis_runs")).toHaveLength(0);
  });

  it("still requires both CSV exports before starting", async () => {
    seedManualAccount();
    await expect(startManualAnalysis(ACCOUNT, "all", "tester")).rejects.toBeInstanceOf(AnalysisError);
  });
});

describe("startManualAnalysis · signal-table output", () => {
  it("writes the demographic/placement signal rows the UI and strategy evidence read", async () => {
    seedManualAccount();
    stageBothCsvs();

    const runId = await startManualAnalysis(ACCOUNT, "all", "tester");
    expect(runId).toBeTruthy();
    const run = await waitForRunToSettle();
    expect(run["error_message"] ?? null).toBeNull();
    expect(run["status"]).toBe("success");
    expect(run["date_start"]).toBe("2026-06-01");
    expect(run["date_end"]).toBe("2026-06-01");

    // Performance rows exist and are tied to this run.
    const adPerf = db.get("ad_performance")!;
    expect(adPerf.length).toBeGreaterThan(0);
    expect(adPerf.every((r) => r["manual_analysis_run_id"] === runId)).toBe(true);

    // Audience surface: ACCOUNT-grain demographic signal, importer shape
    // (DemographicRow in seedTypes.ts).
    const demoSignal = db.get("demographic_signal")!;
    expect(demoSignal).toHaveLength(2); // female 25-34, male 35-44 (sample CSV)
    for (const row of demoSignal) {
      expect(row["account_id"]).toBe(ACCOUNT);
      expect(row["cell_id"]).toBe("ACCOUNT");
      const p = row["payload"];
      expect(p["cell_id"]).toBe("ACCOUNT");
      expect(typeof p["Amount spent (USD)"]).toBe("number");
      expect(typeof p["Impressions"]).toBe("number");
      expect(typeof p["Link clicks"]).toBe("number");
      expect(typeof p["Results"]).toBe("number");
      expect(p["CTR_link_pct"]).not.toBeUndefined();
    }
    const female = demoSignal.find((r) => r["gender"] === "female")!;
    expect(female["payload"]["Age"]).toBe("25-34");
    expect(female["payload"]["Amount spent (USD)"]).toBeCloseTo(42.5);
    expect(female["payload"]["Results"]).toBe(3);
    expect(female["payload"]["CPA_result"]).toBeCloseTo(42.5 / 3);
    expect(female["payload"]["CTR_link_pct"]).toBeCloseTo((180 / 5100) * 100);

    // Placements surface: v3-scoped placement×platform signal, importer
    // shape (PlacementRow in seedTypes.ts).
    const placementSignal = db.get("placement_signal")!;
    expect(placementSignal).toHaveLength(2); // feed/facebook, story/instagram
    for (const row of placementSignal) {
      expect(row["signal_scope"]).toBe("v3");
      const p = row["payload"];
      expect(typeof p["Placement"]).toBe("string");
      expect(typeof p["Platform"]).toBe("string");
      expect(typeof p["Amount spent (USD)"]).toBe("number");
      expect(p["CPA"]).not.toBeUndefined();
    }
    const feed = placementSignal.find((r) => r["placement"] === "feed")!;
    expect(feed["payload"]["Platform"]).toBe("facebook");
    expect(feed["payload"]["CPA"]).toBeCloseTo(42.5 / 3);

    // Loop status registers the analysis stage (iap_runs, PK account_id+stage).
    const loop = db.get("iap_runs")!;
    expect(loop).toHaveLength(1);
    expect(loop[0]!["stage"]).toBe("analysis_core");
    expect(loop[0]!["status"]).toBe("complete");
    expect(loop[0]!["window_start"]).toBe("2026-06-01");
    expect(loop[0]!["window_end"]).toBe("2026-06-01");

    // The account is promoted honestly.
    expect(db.get("ad_accounts")![0]!["status"]).toBe("configured");
  });

  it("re-running replaces the signal rows instead of duplicating or accumulating them", async () => {
    seedManualAccount();
    stageBothCsvs();
    await startManualAnalysis(ACCOUNT, "all", "tester");
    await waitForRunToSettle(0);
    const firstDemoCount = db.get("demographic_signal")!.length;
    const firstPlacementCount = db.get("placement_signal")!.length;

    // Re-stage the same exports (the first run's imports were destaged to
    // 'processed') and run again.
    stageBothCsvs();
    await startManualAnalysis(ACCOUNT, "all", "tester");
    for (let i = 0; i < 200; i++) {
      const runs = db.get("manual_analysis_runs")!;
      if (runs.length === 2 && runs.every((r) => r["status"] !== "running")) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(db.get("manual_analysis_runs")!.every((r) => r["status"] === "success")).toBe(true);
    // Same window re-analyzed → same bucket count, not doubled.
    expect(db.get("demographic_signal")!.length).toBe(firstDemoCount);
    expect(db.get("placement_signal")!.length).toBe(firstPlacementCount);
    // iap_runs stays a single upserted row for this account+stage, not two.
    expect(db.get("iap_runs")!.length).toBe(1);
  });
});
