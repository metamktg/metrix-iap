// Creative DNA lib: cell→column attribution follows the canonical MST
// cell-code scheme, only measured cells contribute numbers, and family
// rollups aggregate the account's variable rows honestly.

import { describe, it, expect } from "vitest";
import {
  buildVariableFamilyMap,
  familyForCode,
  columnIdForCell,
  computeAvatarDna,
  mergeAvatarDna,
  rollupDnaFamilies,
} from "../creative-dna";
import type { AnalysisData, CellPerformanceRow, MSTMatrix, VariablePerformanceRow } from "../data/seedTypes";

function perfRow(over: Partial<CellPerformanceRow> & { cell_id: string }): CellPerformanceRow {
  return {
    "Result type": "checkout",
    "Amount spent (USD)": 100,
    Reach: 1000,
    Impressions: 2000,
    Results: 10,
    "Clicks (all)": 60,
    "Link clicks": 50,
    CPA_result: 10,
    CTR_link_pct: 2.5,
    Result_per_link_click_pct: 20,
    book2_concept_name: "Concept",
    ...over,
  };
}

function varRow(over: Partial<VariablePerformanceRow> & { variable_family: string; variable_id: string }): VariablePerformanceRow {
  return {
    "Result type": "checkout",
    "Amount spent (USD)": 100,
    Reach: 1000,
    Impressions: 2000,
    Results: 10,
    "Clicks (all)": 60,
    "Link clicks": 50,
    unique_ads: 2,
    CPA_result: 10,
    CTR_link_pct: 2.5,
    Result_per_link_click_pct: 20,
    ...over,
  };
}

const matrix: MSTMatrix = {
  columns: [
    { id: "C1", name: "Achiever", icp: "CN_ICP_A" },
    { id: "C2", name: "Seeker", icp: "CN_ICP_B" },
  ],
  rows: [],
  diagonal_down: [],
  diagonal_up: [],
  cells: [
    {
      cell_id: "C2A",
      column_id: "C2",
      row_id: "A",
      column_label: "Seeker",
      row_shared_variable: "HK_Benefit",
      concept_code: "CN_Comparison",
      variable_stack: { hk: "HK_Benefit", fw: "FW_BAB", cn: "CN_Comparison" },
      plain_text: {},
    },
    {
      cell_id: "C2B",
      column_id: "C2",
      row_id: "B",
      column_label: "Seeker",
      row_shared_variable: "HK_Curiosity",
      concept_code: "CN_UGC",
      variable_stack: { hk: "HK_Curiosity", cn: "CN_UGC" },
      plain_text: {},
    },
  ],
};

function analysisWith(perf: CellPerformanceRow[], vars: VariablePerformanceRow[] = []): AnalysisData {
  return {
    performance_by_cell: perf,
    v3_variable_performance: vars,
    top_checkout_cells: [],
    top_checkout_variables: [],
    demographic_registration_signal: [],
    v3_placement_signal: [],
    c4e_placement_signal: [],
  } as unknown as AnalysisData;
}

describe("columnIdForCell", () => {
  it("maps <Col><Row> codes to existing grid columns, incl. extension rows", () => {
    expect(columnIdForCell("C2B", ["C1", "C2"])).toBe("C2");
    expect(columnIdForCell("C2E", ["C1", "C2"])).toBe("C2"); // extension row
  });

  it("never attributes to a column that is not in the grid", () => {
    expect(columnIdForCell("C7A", ["C1", "C2"])).toBeNull();
  });

  it("rejects non-canonical codes", () => {
    expect(columnIdForCell("ACCOUNT", ["C1", "C2"])).toBeNull();
    expect(columnIdForCell("X2B", ["C1", "C2"])).toBeNull();
  });
});

describe("familyForCode", () => {
  it("prefers the account's own variable_family over the prefix", () => {
    const map = buildVariableFamilyMap(
      analysisWith([], [varRow({ variable_family: "hook", variable_id: "WEIRD_Code" })])
    );
    expect(familyForCode("WEIRD_Code", map)).toBe("hook");
  });

  it("falls back to the canonical taxonomy prefix", () => {
    const map = new Map<string, string>();
    expect(familyForCode("HK_Benefit", map)).toBe("hook");
    expect(familyForCode("HP_Time", map)).toBe("pain_proof");
    expect(familyForCode("CTA_StartFree", map)).toBe("cta");
  });

  it("returns null for unknown prefixes — never invents a family", () => {
    expect(familyForCode("ZZ_What", new Map())).toBeNull();
  });
});

describe("computeAvatarDna", () => {
  it("aggregates only measured cells attributed to the column", () => {
    const analysis = analysisWith([
      perfRow({ cell_id: "C2B", hook_variable: "HK_Curiosity", concept_variable: "CN_UGC", "Amount spent (USD)": 200, Results: 4 }),
      perfRow({ cell_id: "C2E", hook_variable: "HK_Curiosity", "Amount spent (USD)": 100, Results: 6 }),
      perfRow({ cell_id: "C1A", hook_variable: "HK_Benefit" }), // other column
    ]);
    const dna = computeAvatarDna("C2", matrix, analysis, null);

    expect(dna.plannedCellIds).toEqual(["C2A", "C2B"]);
    expect(dna.measuredCellIds).toEqual(["C2B", "C2E"]);
    expect(dna.extensionCellIds).toEqual(["C2E"]); // beyond the planned grid

    const hook = dna.variables.find((v) => v.code === "HK_Curiosity")!;
    expect(hook.cellIds).toEqual(["C2B", "C2E"]);
    expect(hook.spend).toBe(300);
    expect(hook.results).toBe(10);
    expect(hook.cpa).toBe(30);

    // Planned-but-unmeasured C2A's stack (HK_Benefit) contributes nothing.
    expect(dna.variables.find((v) => v.code === "HK_Benefit")).toBeUndefined();
  });

  it("sums a cell's rows once per variable across multiple result-type rows", () => {
    const analysis = analysisWith([
      perfRow({ cell_id: "C2B", "Result type": "a", hook_variable: "HK_Curiosity", "Amount spent (USD)": 50, Results: 1 }),
      perfRow({ cell_id: "C2B", "Result type": "b", hook_variable: "HK_Curiosity", "Amount spent (USD)": 70, Results: 2 }),
    ]);
    const dna = computeAvatarDna("C2", matrix, analysis, null);
    const hook = dna.variables.find((v) => v.code === "HK_Curiosity")!;
    expect(hook.spend).toBe(120);
    expect(hook.results).toBe(3);
  });

  it("unions codes across a cell's rows when code fields are inconsistently populated", () => {
    const analysis = analysisWith([
      perfRow({ cell_id: "C2B", "Result type": "a", hook_variable: "HK_Curiosity", "Amount spent (USD)": 60, Results: 2 }),
      perfRow({ cell_id: "C2B", "Result type": "b", concept_variable: "CN_UGC", "Amount spent (USD)": 40, Results: 1 }),
    ]);
    const dna = computeAvatarDna("C2", matrix, analysis, null);
    expect(dna.variables.map((v) => v.code).sort()).toEqual(["CN_UGC", "HK_Curiosity"]);
    // Both codes get the full cell aggregate (attribution view, not additive).
    for (const v of dna.variables) {
      expect(v.spend).toBe(100);
      expect(v.results).toBe(3);
    }
  });

  it("falls back to the planned matrix stack when perf rows carry no codes", () => {
    const analysis = analysisWith([perfRow({ cell_id: "C2A" })]);
    const dna = computeAvatarDna("C2", matrix, analysis, null);
    expect(dna.variables.map((v) => v.code).sort()).toEqual(["CN_Comparison", "FW_BAB", "HK_Benefit"]);
  });

  it("null CPA when a variable has zero results", () => {
    const analysis = analysisWith([perfRow({ cell_id: "C2B", hook_variable: "HK_Curiosity", Results: 0 })]);
    const dna = computeAvatarDna("C2", matrix, analysis, null);
    expect(dna.variables[0]!.cpa).toBeNull();
  });

  it("empty when the column has no measured cells", () => {
    const dna = computeAvatarDna("C1", matrix, analysisWith([perfRow({ cell_id: "C2B", hook_variable: "HK_X" })]), null);
    expect(dna.measuredCellIds).toEqual([]);
    expect(dna.variables).toEqual([]);
  });
});

describe("mergeAvatarDna", () => {
  it("merges by code and re-derives CPA/CTR", () => {
    const a1 = computeAvatarDna(
      "C2",
      matrix,
      analysisWith([perfRow({ cell_id: "C2B", hook_variable: "HK_Curiosity", "Amount spent (USD)": 100, Results: 2 })]),
      null
    );
    const a2 = computeAvatarDna(
      "C1",
      matrix,
      analysisWith([perfRow({ cell_id: "C1A", hook_variable: "HK_Curiosity", "Amount spent (USD)": 50, Results: 3 })]),
      null
    );
    const merged = mergeAvatarDna([a1, a2]);
    const hook = merged.find((v) => v.code === "HK_Curiosity")!;
    expect(hook.spend).toBe(150);
    expect(hook.results).toBe(5);
    expect(hook.cpa).toBe(30);
    expect(hook.cellIds).toEqual(["C1A", "C2B"]);
  });
});

describe("rollupDnaFamilies", () => {
  it("aggregates per family, ranks by spend, and picks the lowest-CPA top variable", () => {
    const rollups = rollupDnaFamilies([
      varRow({ variable_family: "hook", variable_id: "HK_A", "Amount spent (USD)": 300, Results: 10 }), // cpa 30
      varRow({ variable_family: "hook", variable_id: "HK_B", "Amount spent (USD)": 100, Results: 5 }), // cpa 20 ← best
      varRow({ variable_family: "cta", variable_id: "CTA_X", "Amount spent (USD)": 50, Results: 0 }),
    ]);
    expect(rollups.map((r) => r.family)).toEqual(["hook", "cta"]);
    const hook = rollups[0]!;
    expect(hook.spend).toBe(400);
    expect(hook.results).toBe(15);
    expect(hook.variableCount).toBe(2);
    expect(hook.top?.variableId).toBe("HK_B");
  });

  it("sums multiple result-type rows for the same variable before ranking", () => {
    const rollups = rollupDnaFamilies([
      varRow({ variable_family: "hook", variable_id: "HK_A", "Result type": "a", "Amount spent (USD)": 100, Results: 10 }),
      varRow({ variable_family: "hook", variable_id: "HK_A", "Result type": "b", "Amount spent (USD)": 100, Results: 10 }),
    ]);
    expect(rollups[0]!.variableCount).toBe(1);
    expect(rollups[0]!.top?.spend).toBe(200);
    expect(rollups[0]!.top?.cpa).toBe(10);
  });

  it("zero-result family: top falls back to most spend, CPA stays null", () => {
    const rollups = rollupDnaFamilies([
      varRow({ variable_family: "cta", variable_id: "CTA_X", "Amount spent (USD)": 50, Results: 0 }),
      varRow({ variable_family: "cta", variable_id: "CTA_Y", "Amount spent (USD)": 80, Results: 0 }),
    ]);
    expect(rollups[0]!.cpa).toBeNull();
    expect(rollups[0]!.top?.variableId).toBe("CTA_Y");
  });
});
