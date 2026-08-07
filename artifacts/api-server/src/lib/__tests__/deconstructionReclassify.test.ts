// ─── Re-classification must never destroy a prior successful result ────
// Regression guard for the destructive-ordering bug: an earlier version
// deleted the prior classification + its filed library entry BEFORE calling
// the model, so a transient model failure permanently erased existing
// library content. Replacement is now atomic per import: the old row is
// only replaced (single upsert) after the new classification succeeded.
//
// Covers:
//   1. Prior auto_filed classification + library cell survive a re-run
//      whose model call fails.
//   2. Mid-batch failure: import A's successful replacement commits, import
//      B's prior result stays untouched.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── in-memory supabase stub ────────────────────────────────────────────
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let idCounter = 0;

function matches(row: Row, field: string, value: any, op: "eq" | "in"): boolean {
  let actual: any;
  const arrow = field.match(/^(\w+)->>(\w+)$/);
  if (arrow) actual = row[arrow[1]!]?.[arrow[2]!];
  else actual = row[field];
  return op === "eq" ? String(actual) === String(value) : (value as any[]).map(String).includes(String(actual));
}

function builder(table: string) {
  const filters: Array<{ field: string; value: any; op: "eq" | "in" }> = [];
  let action: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  let onConflict: string[] | null = null;
  let wantRows = false;

  const rowsMatching = () => (db[table] ?? []).filter((r) => filters.every((f) => matches(r, f.field, f.value, f.op)));

  const exec = () => {
    db[table] ??= [];
    if (action === "select") return { data: rowsMatching().map((r) => ({ ...r })), error: null };
    if (action === "delete") {
      const doomed = new Set(rowsMatching());
      db[table] = db[table]!.filter((r) => !doomed.has(r));
      return { data: null, error: null };
    }
    if (action === "update") {
      const hit = rowsMatching();
      for (const r of hit) Object.assign(r, payload);
      return { data: wantRows ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    // insert / upsert
    const rows = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `row-${++idCounter}`, ...p }));
    const out: Row[] = [];
    for (const row of rows) {
      if (action === "upsert" && onConflict) {
        const existing = db[table]!.find((r) => onConflict!.every((c) => String(r[c]) === String(row[c])));
        if (existing) {
          const keepId = existing["id"];
          Object.assign(existing, row, { id: keepId });
          out.push({ ...existing });
          continue;
        }
      }
      db[table]!.push(row);
      out.push({ ...row });
    }
    return { data: wantRows ? out : null, error: null };
  };

  const api: any = {
    select: (..._a: any[]) => {
      if (action === "select") return api;
      wantRows = true;
      return api;
    },
    insert: (p: any) => ((action = "insert"), (payload = p), api),
    upsert: (p: any, opts?: { onConflict?: string }) => (
      (action = "upsert"), (payload = p), (onConflict = opts?.onConflict?.split(",").map((s) => s.trim()) ?? null), api
    ),
    update: (p: any) => ((action = "update"), (payload = p), api),
    delete: () => ((action = "delete"), api),
    eq: (field: string, value: any) => (filters.push({ field, value, op: "eq" }), api),
    in: (field: string, value: any[]) => (filters.push({ field, value, op: "in" }), api),
    not: () => api,
    order: () => api,
    limit: () => api,
    then: (resolve: (v: any) => any, reject?: (e: any) => any) => Promise.resolve(exec()).then(resolve, reject),
  };
  return api;
}

// ── atomic replacement RPC stub ────────────────────────────────────────
// Mirrors metrix_replace_deconstruction_filing: a single transaction that
// upserts the classification, swaps the derived library cells, and stamps
// cell_id. `rpcFailMode` simulates a mid-transaction failure — like
// Postgres, it rolls back completely (mutates NOTHING, then throws).
let rpcFailMode = false;

function replaceDeconstructionFiling(args: {
  p_account_id: string;
  p_import_id: string;
  p_classification: Row;
  p_cell_id: string | null;
  p_library_row: Row | null;
}) {
  if (rpcFailMode) {
    return { data: null, error: { message: "simulated transaction failure (rolled back)" } };
  }
  const { p_account_id, p_import_id, p_classification, p_cell_id, p_library_row } = args;
  db["creative_deconstructions"] ??= [];
  db["library_cells"] ??= [];
  const key = (r: Row) => String(r["account_id"]) === p_account_id && String(r["manual_import_id"]) === p_import_id;
  let row = db["creative_deconstructions"]!.find(key);
  const values = { ...p_classification, account_id: p_account_id, manual_import_id: p_import_id, cell_id: p_cell_id };
  if (row) Object.assign(row, values);
  else {
    row = { id: `row-${++idCounter}`, ...values };
    db["creative_deconstructions"]!.push(row);
  }
  db["library_cells"] = db["library_cells"]!.filter(
    (r) => !(String(r["account_id"]) === p_account_id && String(r["payload"]?.["deconstruction_of"]) === p_import_id),
  );
  if (p_library_row) {
    db["library_cells"]!.push({
      id: `cell-${++idCounter}`,
      account_id: p_account_id,
      ...p_library_row,
      payload: { ...p_library_row["payload"], deconstruction_id: row["id"] },
    });
    row["cell_id"] = p_cell_id;
  }
  return { data: { ...row }, error: null };
}

vi.mock("../supabase", () => ({
  getSupabase: () => ({
    from: (t: string) => builder(t),
    rpc: async (name: string, args: any) => {
      if (name !== "metrix_replace_deconstruction_filing") throw new Error(`unexpected rpc ${name}`);
      return replaceDeconstructionFiling(args);
    },
  }),
}));

// ── generation engine mock: model behavior controlled per-test ────────
const finishCalls: Array<{ status: string; message?: string }> = [];
let modelImpl: (content: unknown) => Promise<any> = async () => {
  throw new Error("model exploded (simulated)");
};

vi.mock("../generationEngine", () => ({
  GENERATION_MODEL: "test-model",
  IAP_VARIABLE_TAXONOMY: "TAXONOMY",
  GenerationError: class GenerationError extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
  startRun: vi.fn(async () => "run-new"),
  finishRun: vi.fn(async (_id: string, status: string, message?: string) => {
    finishCalls.push({ status, message });
  }),
  generateValidated: vi.fn((content: unknown) => modelImpl(content)),
  sanitizeGeneratedText: (v: any) => v,
}));

vi.mock("../metrixSeedAssembly", () => ({ invalidateMetrixSeedCache: vi.fn() }));

import { startCreativeDeconstruction } from "../deconstructionEngine";

const ACCOUNT = "acct_1";

/** Wait until the background run settles (finishRun recorded). */
async function waitForRun(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (finishCalls.length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("run never settled");
}

function seedPrior(importId: string, cellId: string) {
  db["creative_deconstructions"]!.push({
    id: `prior-${importId}`,
    account_id: ACCOUNT,
    manual_import_id: importId,
    generation_run_id: "run-old",
    filename: `${importId}.png`,
    ad_names: ["ad_1"],
    status: "auto_filed",
    variables: [{ family: "concept", code: "CN_UGC", confidence: 0.9 }],
    overall_confidence: 0.9,
    cell_id: cellId,
  });
  db["library_cells"]!.push({
    id: `cell-${importId}`,
    account_id: ACCOUNT,
    cell_id: cellId,
    row_index: 1,
    payload: { cell_id: cellId, source: "deconstructed", deconstruction_of: importId, deconstruction_run_id: "run-old" },
  });
}

beforeEach(() => {
  finishCalls.length = 0;
  rpcFailMode = false;
  for (const k of Object.keys(db)) delete db[k];
  db["ad_accounts"] = [{ id: ACCOUNT, name: "Test Account" }];
  db["ads"] = [];
  db["imported_creative_briefs"] = [];
  db["variable_registry"] = [];
  db["generation_runs"] = [];
  db["creative_deconstructions"] = [];
  db["library_cells"] = [];
  db["manual_imports"] = [];
});

describe("re-classification preserves prior results on failure", () => {
  it("a failed model call leaves the prior classification AND its library cell intact", async () => {
    seedPrior("imp-1", "C1A");
    db["manual_imports"]!.push({
      id: "imp-1", account_id: ACCOUNT, kind: "creative_asset",
      filename: "imp-1.png", content_type: "image/png", content: "\\x89504e47", ad_names: ["ad_1"],
    });
    modelImpl = async () => {
      throw new Error("model exploded (simulated)");
    };

    await startCreativeDeconstruction(ACCOUNT, "tester", ["imp-1"]);
    await waitForRun();

    expect(finishCalls[0]!.status).toBe("error");
    // Prior classification untouched — same row, same run provenance.
    const dec = db["creative_deconstructions"]!.filter((r) => r["manual_import_id"] === "imp-1");
    expect(dec).toHaveLength(1);
    expect(dec[0]!["generation_run_id"]).toBe("run-old");
    expect(dec[0]!["status"]).toBe("auto_filed");
    // Filed library entry untouched.
    const cells = db["library_cells"]!.filter((r) => r["payload"]?.["deconstruction_of"] === "imp-1");
    expect(cells).toHaveLength(1);
    expect(cells[0]!["cell_id"]).toBe("C1A");
  });

  it("a failed commit/swap transaction (library delete/insert/cell_id update) leaves the prior result intact", async () => {
    seedPrior("imp-1", "C1A");
    db["manual_imports"]!.push({
      id: "imp-1", account_id: ACCOUNT, kind: "creative_asset",
      filename: "imp-1.png", content_type: "image/png", content: "\\x00", ad_names: ["ad_1"],
    });
    // Model succeeds with a confident classification…
    modelImpl = async () => ({
      variables: [{ family: "concept", code: "CN_Testimonial", confidence: 0.95 }],
      primary_message: "New read",
    });
    // …but the atomic replacement transaction fails (rolls back everything:
    // classification upsert, prior-cell delete, new-cell insert, cell_id stamp).
    rpcFailMode = true;

    await startCreativeDeconstruction(ACCOUNT, "tester", ["imp-1"]);
    await waitForRun();

    expect(finishCalls[0]!.status).toBe("error");
    const dec = db["creative_deconstructions"]!.filter((r) => r["manual_import_id"] === "imp-1");
    expect(dec).toHaveLength(1);
    expect(dec[0]!["generation_run_id"]).toBe("run-old");
    expect(dec[0]!["status"]).toBe("auto_filed");
    expect(dec[0]!["cell_id"]).toBe("C1A");
    const cells = db["library_cells"]!.filter((r) => r["payload"]?.["deconstruction_of"] === "imp-1");
    expect(cells).toHaveLength(1);
    expect(cells[0]!["payload"]["deconstruction_run_id"]).toBe("run-old");
  });

  it("mid-batch failure: earlier import's replacement commits, later import's prior result survives", async () => {
    seedPrior("imp-a", "C1A");
    seedPrior("imp-b", "C2A");
    db["manual_imports"]!.push(
      { id: "imp-a", account_id: ACCOUNT, kind: "creative_asset", filename: "a.png", content_type: "image/png", content: "\\x00", ad_names: [] },
      { id: "imp-b", account_id: ACCOUNT, kind: "creative_asset", filename: "b.png", content_type: "image/png", content: "\\x00", ad_names: [] },
    );
    let call = 0;
    modelImpl = async () => {
      call++;
      if (call === 1) {
        return {
          variables: [
            { family: "concept", code: "CN_Testimonial", confidence: 0.95 },
            { family: "tonality", code: "TN_Warm", confidence: 0.9 },
          ],
          primary_message: "New read",
        };
      }
      throw new Error("second import fails");
    };

    await startCreativeDeconstruction(ACCOUNT, "tester", ["imp-a", "imp-b"]);
    await waitForRun();

    expect(finishCalls[0]!.status).toBe("error");

    // imp-a: replaced (still exactly one row — the upsert replaced in place).
    const aRows = db["creative_deconstructions"]!.filter((r) => r["manual_import_id"] === "imp-a");
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!["generation_run_id"]).toBe("run-new");
    expect(aRows[0]!["variables"][0]["code"]).toBe("CN_Testimonial");
    // Its library entry was swapped, not duplicated.
    const aCells = db["library_cells"]!.filter((r) => r["payload"]?.["deconstruction_of"] === "imp-a");
    expect(aCells).toHaveLength(1);
    expect(aCells[0]!["payload"]["deconstruction_run_id"]).toBe("run-new");

    // imp-b: prior classification and cell completely untouched.
    const bRows = db["creative_deconstructions"]!.filter((r) => r["manual_import_id"] === "imp-b");
    expect(bRows).toHaveLength(1);
    expect(bRows[0]!["generation_run_id"]).toBe("run-old");
    const bCells = db["library_cells"]!.filter((r) => r["payload"]?.["deconstruction_of"] === "imp-b");
    expect(bCells).toHaveLength(1);
    expect(bCells[0]!["payload"]["deconstruction_run_id"]).toBe("run-old");
  });
});
