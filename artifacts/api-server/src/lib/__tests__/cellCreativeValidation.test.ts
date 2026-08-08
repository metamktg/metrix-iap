// ─── Cell-scoped creative upload validation ─────────────────────────────
// Regression guard for the composite-DNA comparison bug: library_cells
// variable fields are frequently composite ("TN_bold + TN_playful"), and
// the model reports one code per family. Matching must be membership-based
// (detected code ∈ expected set), not string equality against the whole
// field — otherwise no upload could ever match a multi-code family, and a
// confirmed override would silently collapse the field to a single code.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let idCounter = 0;

function builder(table: string) {
  const filters: Array<{ field: string; value: any }> = [];
  let action: "select" | "insert" | "upsert" | "update" = "select";
  let payload: Row | null = null;
  let onConflict: string[] | null = null;

  const rowsMatching = () =>
    (db[table] ?? []).filter((r) => filters.every((f) => String(r[f.field]) === String(f.value)));

  const exec = () => {
    db[table] ??= [];
    if (action === "select") return { data: rowsMatching().map((r) => ({ ...r })), error: null };
    if (action === "update") {
      const hit = rowsMatching();
      for (const r of hit) Object.assign(r, payload);
      return { data: null, error: null };
    }
    // insert / upsert
    if (action === "upsert" && onConflict) {
      const existing = db[table]!.find((r) => onConflict!.every((c) => String(r[c]) === String(payload![c])));
      if (existing) {
        Object.assign(existing, payload);
        return { data: [{ ...existing }], error: null };
      }
    }
    const row = { id: `row-${++idCounter}`, ...payload };
    db[table]!.push(row);
    return { data: [{ ...row }], error: null };
  };

  const api: any = {
    select: () => api,
    insert: (p: any) => ((action = "insert"), (payload = p), api),
    upsert: (p: any, opts?: { onConflict?: string }) => (
      (action = "upsert"), (payload = p), (onConflict = opts?.onConflict?.split(",").map((s) => s.trim()) ?? null), api
    ),
    update: (p: any) => ((action = "update"), (payload = p), api),
    eq: (field: string, value: any) => (filters.push({ field, value }), api),
    order: () => api,
    limit: () => api,
    then: (resolve: (v: any) => any, reject?: (e: any) => any) => Promise.resolve(exec()).then(resolve, reject),
  };
  return api;
}

vi.mock("../supabase", () => ({
  getSupabase: () => ({ from: (t: string) => builder(t) }),
}));

let modelImpl: () => Promise<any> = async () => ({
  variables: [{ family: "tonality", code: "TN_bold", confidence: 0.95, evidence: "bold headline" }],
  primary_message: "Look bold.",
  secondary_message: null,
  cta: "Shop now",
  visual_system: "high-contrast",
});

vi.mock("../generationEngine", () => ({
  GENERATION_MODEL: "test-model",
  IAP_VARIABLE_TAXONOMY: "TAXONOMY",
  GenerationError: class GenerationError extends Error {},
  generateValidated: vi.fn(() => modelImpl()),
  sanitizeGeneratedText: (v: any) => v,
}));

vi.mock("../metrixSeedAssembly", () => ({ invalidateMetrixSeedCache: vi.fn() }));
vi.mock("../videoKeyframes", () => ({ extractVideoKeyframes: vi.fn() }));

import { classifyCellCreative, fileCellCreativeOverride } from "../deconstructionEngine";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  idCounter = 0;
  modelImpl = async () => ({
    variables: [{ family: "tonality", code: "TN_bold", confidence: 0.95, evidence: "bold headline" }],
    primary_message: "Look bold.",
    secondary_message: null,
    cta: "Shop now",
    visual_system: "high-contrast",
  });
});

function seedLibraryCell(overrides: Row = {}) {
  db["library_cells"] = [
    {
      id: "cell-1",
      account_id: "acct_1",
      cell_id: "C1A",
      row_index: 0,
      payload: { tone_variable: "TN_bold + TN_playful", cell_id: "C1A" },
      ...overrides,
    },
  ];
}

describe("classifyCellCreative — composite DNA matching", () => {
  it("matches when the detected code is a member of a composite expected field", async () => {
    seedLibraryCell();
    const result = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(result.status).toBe("matched");
    expect(result.missing).toEqual([]);
    expect(result.conflicting).toEqual([]);
  });

  it("flags a conflict when the detected code is not in the composite expected set", async () => {
    seedLibraryCell();
    modelImpl = async () => ({
      variables: [{ family: "tonality", code: "TN_serious", confidence: 0.95, evidence: "serious tone" }],
      primary_message: null,
      secondary_message: null,
      cta: null,
      visual_system: null,
    });
    const result = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(result.status).toBe("mismatch");
    expect(result.conflicting).toEqual(["TN_bold + TN_playful → TN_serious"]);
    expect(result.missing).toEqual([]);
  });

  it("flags missing when a recorded family has no corresponding detection at all", async () => {
    seedLibraryCell({ payload: { tone_variable: "TN_bold", concept_variable: "CN_ProductDemo", cell_id: "C1A" } });
    // model only ever reports tonality in this test's default impl — concept_variable has no match.
    const result = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(result.status).toBe("mismatch");
    expect(result.missing).toEqual(["CN_ProductDemo"]);
    expect(result.conflicting).toEqual([]);
  });
});

describe("fileCellCreativeOverride — composite DNA preservation", () => {
  it("leaves a matching composite field untouched (does not collapse it to the single detected code)", async () => {
    seedLibraryCell();
    const validation = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    await fileCellCreativeOverride({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
      validation,
      overridden: false,
    });
    const row = db["library_cells"]!.find((r) => r["cell_id"] === "C1A")!;
    expect(row["payload"]["tone_variable"]).toBe("TN_bold + TN_playful");
  });

  it("replaces the field with the detected code once the user confirms an explicit override", async () => {
    seedLibraryCell();
    modelImpl = async () => ({
      variables: [{ family: "tonality", code: "TN_serious", confidence: 0.95, evidence: "serious tone" }],
      primary_message: null,
      secondary_message: null,
      cta: null,
      visual_system: null,
    });
    const validation = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(validation.status).toBe("mismatch");
    await fileCellCreativeOverride({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
      validation,
      overridden: true,
    });
    const row = db["library_cells"]!.find((r) => r["cell_id"] === "C1A")!;
    expect(row["payload"]["tone_variable"]).toBe("TN_serious");
    expect(row["qa_mapping_status"]).toBe("user_overridden");
  });

  it("flags a conflict on the funnel_stage family (ST_) and persists the confirmed code into payload.funnel_stage_variable on override — never touching the display `stage` label", async () => {
    seedLibraryCell({
      payload: {
        tone_variable: "TN_bold + TN_playful",
        funnel_stage_variable: "ST_Upper",
        stage: "TOF", // real display label (e.g. "TOF"/"MOF") — must never be read/overwritten as a registry code
        cell_id: "C1A",
      },
    });
    modelImpl = async () => ({
      variables: [
        { family: "tonality", code: "TN_bold", confidence: 0.95, evidence: "bold" },
        { family: "funnel_stage", code: "ST_Lower", confidence: 0.9, evidence: "retargeting copy" },
      ],
      primary_message: null,
      secondary_message: null,
      cta: null,
      visual_system: null,
    });
    const validation = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(validation.status).toBe("mismatch");
    expect(validation.conflicting).toEqual(["ST_Upper → ST_Lower"]);

    await fileCellCreativeOverride({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
      validation,
      overridden: true,
    });
    const row = db["library_cells"]!.find((r) => r["cell_id"] === "C1A")!;
    expect(row["payload"]["funnel_stage_variable"]).toBe("ST_Lower");
    expect(row["payload"]["stage"]).toBe("TOF"); // display label must survive untouched
  });

  it("flags missing on the awareness family (AW_) and persists a fresh detection under awareness_variable", async () => {
    seedLibraryCell({ payload: { tone_variable: "TN_bold", awareness_variable: "AW_ProblemAware", cell_id: "C1A" } });
    // default modelImpl only reports tonality — awareness has no detection at all.
    const validation = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(validation.status).toBe("mismatch");
    expect(validation.missing).toEqual(["AW_ProblemAware"]);

    modelImpl = async () => ({
      variables: [
        { family: "tonality", code: "TN_bold", confidence: 0.95, evidence: "bold" },
        { family: "awareness", code: "AW_SolutionAware", confidence: 0.9, evidence: "solution framing" },
      ],
      primary_message: null,
      secondary_message: null,
      cta: null,
      visual_system: null,
    });
    const overrideValidation = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(overrideValidation.conflicting).toEqual(["AW_ProblemAware → AW_SolutionAware"]);
    await fileCellCreativeOverride({
      accountId: "acct_1",
      cellId: "C1A",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
      validation: overrideValidation,
      overridden: true,
    });
    const row = db["library_cells"]!.find((r) => r["cell_id"] === "C1A")!;
    expect(row["payload"]["awareness_variable"]).toBe("AW_SolutionAware");
  });

  it("creates a fresh library_cells row (with row_index) when the cell has no prior DNA", async () => {
    const validation = await classifyCellCreative({
      accountId: "acct_1",
      cellId: "C9Z",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    expect(validation.status).toBe("matched"); // no expected DNA => confidence gate only
    await fileCellCreativeOverride({
      accountId: "acct_1",
      cellId: "C9Z",
      filename: "new.png",
      contentType: "image/png",
      bytes: PNG_BYTES,
      validation,
      overridden: false,
    });
    const row = db["library_cells"]!.find((r) => r["cell_id"] === "C9Z")!;
    expect(row).toBeTruthy();
    expect(row["payload"]["tone_variable"]).toBe("TN_bold");
    expect(row["row_index"]).toBe(0);
  });
});
