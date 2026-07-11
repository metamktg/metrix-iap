// Variable drill-down lib: header totals come from the import's own v3
// variable rows, carrier cells are detected only from real data sources,
// segment KPIs use per-cell demographic grain scoped to carriers, and
// every unavailable section says why instead of estimating.

import { describe, it, expect } from "vitest";
import { computeVariableDrilldown } from "../variable-drilldown";
import type {
  AnalysisData,
  CellPerformanceRow,
  DemographicRow,
  MST,
  VariablePerformanceRow,
} from "../data/seedTypes";

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

function varRow(over: Partial<VariablePerformanceRow> & { variable_id: string }): VariablePerformanceRow {
  return {
    variable_family: "hook",
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

function demoRow(over: Partial<DemographicRow> & { cell_id: string }): DemographicRow {
  return {
    "Ad name": "ad",
    Age: "25-34",
    Gender: "female",
    "Result type": "checkout",
    "Amount spent (USD)": 40,
    Reach: 400,
    Impressions: 800,
    Results: 4,
    "Clicks (all)": 24,
    "Link clicks": 20,
    CPA_result: 10,
    CTR_link_pct: 2.5,
    Result_per_link_click_pct: 20,
    ...over,
  } as DemographicRow;
}

function analysisWith(over: Partial<AnalysisData>): AnalysisData {
  return {
    performance_by_cell: [],
    v3_variable_performance: [],
    top_checkout_cells: [],
    top_checkout_variables: [],
    demographic_registration_signal: [],
    v3_placement_signal: [],
    c4e_placement_signal: [],
    ...over,
  } as unknown as AnalysisData;
}

function mstWithLibrary(cells: Array<Record<string, unknown>>): MST {
  return { local_book2_library: cells } as unknown as MST;
}

describe("computeVariableDrilldown — header totals", () => {
  it("sums v3 rows across result types; unique_ads is max, not sum", () => {
    const rows = [
      varRow({ variable_id: "HK_Curiosity", "Result type": "a", "Amount spent (USD)": 100, Results: 5, Impressions: 1000, "Link clicks": 20, unique_ads: 3 }),
      varRow({ variable_id: "HK_Curiosity", "Result type": "b", "Amount spent (USD)": 50, Results: 5, Impressions: 1000, "Link clicks": 30, unique_ads: 2 }),
      varRow({ variable_id: "HK_Other" }),
    ];
    const d = computeVariableDrilldown("HK_Curiosity", {
      analysis: analysisWith({}),
      mst: null,
      variableRows: rows,
    });
    expect(d.totals).not.toBeNull();
    expect(d.totals!.spend).toBe(150);
    expect(d.totals!.results).toBe(10);
    expect(d.totals!.cpa).toBe(15);
    expect(d.totals!.ctrPct).toBe((50 / 2000) * 100);
    expect(d.totals!.uniqueAds).toBe(3);
    expect(d.totals!.resultTypes.sort()).toEqual(["a", "b"]);
  });

  it("totals are null (never zeroed) when no v3 row matches", () => {
    const d = computeVariableDrilldown("HK_Missing", {
      analysis: analysisWith({}),
      mst: null,
      variableRows: [varRow({ variable_id: "HK_Other" })],
    });
    expect(d.totals).toBeNull();
  });

  it("null CPA/CTR when denominators are zero", () => {
    const d = computeVariableDrilldown("HK_X", {
      analysis: analysisWith({}),
      mst: null,
      variableRows: [varRow({ variable_id: "HK_X", Results: 0, Impressions: 0 })],
    });
    expect(d.totals!.cpa).toBeNull();
    expect(d.totals!.ctrPct).toBeNull();
  });
});

describe("computeVariableDrilldown — carrier cells", () => {
  it("detects carriers from perf-row codes and ranks by results then spend", () => {
    const analysis = analysisWith({
      performance_by_cell: [
        perfRow({ cell_id: "C1A", hook_variable: "HK_X", Results: 2, "Amount spent (USD)": 50 }),
        perfRow({ cell_id: "C1B", hook_variable: "HK_X", Results: 8, "Amount spent (USD)": 200 }),
        perfRow({ cell_id: "C2A", hook_variable: "HK_Other" }),
      ],
    });
    const d = computeVariableDrilldown("HK_X", { analysis, mst: null, variableRows: [] });
    expect(d.carrierCellIds).toEqual(["C1A", "C1B"]);
    expect(d.rankedCells.map((c) => c.cellId)).toEqual(["C1B", "C1A"]);
    expect(d.rankedCells[0]!.cpa).toBe(25);
  });

  it("falls back to the MST library stack ONLY when perf rows carry no codes", () => {
    const analysis = analysisWith({
      performance_by_cell: [
        perfRow({ cell_id: "C1A" }), // no codes → library decides
        perfRow({ cell_id: "C1B", hook_variable: "HK_Other" }), // has codes → library ignored
      ],
    });
    const mst = mstWithLibrary([
      { cell_id: "C1A", hook_variable: "HK_X", primary_message: "", secondary_message: "", cta: "" },
      { cell_id: "C1B", hook_variable: "HK_X", primary_message: "", secondary_message: "", cta: "" },
    ]);
    const d = computeVariableDrilldown("HK_X", { analysis, mst, variableRows: [] });
    expect(d.carrierCellIds).toEqual(["C1A"]);
  });

  it("scopes carrier cells, ranked totals, and segments to selectedResultTypes", () => {
    const analysis = analysisWith({
      performance_by_cell: [
        // C1A carries HK_X in both events; only "checkout" should count when selected
        perfRow({ cell_id: "C1A", "Result type": "checkout", hook_variable: "HK_X", "Amount spent (USD)": 100, Results: 10 }),
        perfRow({ cell_id: "C1A", "Result type": "install", hook_variable: "HK_X", "Amount spent (USD)": 999, Results: 99 }),
        // C1B carries HK_X only in the deselected event → not a carrier at all
        perfRow({ cell_id: "C1B", "Result type": "install", hook_variable: "HK_X" }),
      ],
      demographic_registration_signal: [
        demoRow({ cell_id: "C1A", Age: "25-34", Gender: "female", "Amount spent (USD)": 60, Results: 6 }),
        demoRow({ cell_id: "C1B", Age: "25-34", Gender: "female", "Amount spent (USD)": 500, Results: 50 }),
      ],
    });
    const d = computeVariableDrilldown("HK_X", {
      analysis,
      mst: null,
      variableRows: [],
      selectedResultTypes: ["checkout"],
    });
    // Deselected-event rows never leak into carrier detection or rollups
    expect(d.carrierCellIds).toEqual(["C1A"]);
    expect(d.rankedCells).toHaveLength(1);
    expect(d.rankedCells[0]!.spend).toBe(100);
    expect(d.rankedCells[0]!.results).toBe(10);
    // Segment scope follows the filtered carrier set (C1B's rows excluded)
    expect(d.segments.available).toBe(true);
    expect(d.segments.rows[0]!.totals.spend).toBe(60);
  });

  it("no filtering when selectedResultTypes is omitted (all rows count)", () => {
    const analysis = analysisWith({
      performance_by_cell: [
        perfRow({ cell_id: "C1A", "Result type": "checkout", hook_variable: "HK_X", "Amount spent (USD)": 100 }),
        perfRow({ cell_id: "C1B", "Result type": "install", hook_variable: "HK_X", "Amount spent (USD)": 50 }),
      ],
    });
    const d = computeVariableDrilldown("HK_X", { analysis, mst: null, variableRows: [] });
    expect(d.carrierCellIds).toEqual(["C1A", "C1B"]);
  });

  it("unions codes across a cell's multiple result-type rows", () => {
    const analysis = analysisWith({
      performance_by_cell: [
        perfRow({ cell_id: "C1A", "Result type": "a", hook_variable: "HK_X" }),
        perfRow({ cell_id: "C1A", "Result type": "b", concept_variable: "CN_Y" }),
      ],
    });
    const d = computeVariableDrilldown("CN_Y", { analysis, mst: null, variableRows: [] });
    expect(d.carrierCellIds).toEqual(["C1A"]);
  });
});

describe("computeVariableDrilldown — segment KPIs", () => {
  it("aggregates per-cell demographic grain scoped to carrier cells only", () => {
    const analysis = analysisWith({
      performance_by_cell: [
        perfRow({ cell_id: "C1A", hook_variable: "HK_X" }),
        perfRow({ cell_id: "C2A", hook_variable: "HK_Other" }),
      ],
      demographic_registration_signal: [
        demoRow({ cell_id: "C1A", Age: "25-34", Gender: "female", "Amount spent (USD)": 60, Results: 6 }),
        demoRow({ cell_id: "C1A", Age: "35-44", Gender: "male", "Amount spent (USD)": 40, Results: 1 }),
        demoRow({ cell_id: "C2A", Age: "25-34", Gender: "female", "Amount spent (USD)": 999, Results: 99 }), // other cell — excluded
      ],
    });
    const d = computeVariableDrilldown("HK_X", { analysis, mst: null, variableRows: [] });
    expect(d.segments.available).toBe(true);
    expect(d.segments.rows).toHaveLength(2);
    const top = d.segments.rows[0]!;
    expect(top.segment).toEqual({ age: "25-34", gender: "female" });
    expect(top.totals.spend).toBe(60);
    expect(top.derived.cpa).toBe(10);
  });

  it("excludes ACCOUNT-grain rows — never double-counts the account marginal", () => {
    const analysis = analysisWith({
      performance_by_cell: [perfRow({ cell_id: "C1A", hook_variable: "HK_X" })],
      demographic_registration_signal: [
        demoRow({ cell_id: "ACCOUNT", Age: "25-34", Gender: "female", "Amount spent (USD)": 500 }),
        demoRow({ cell_id: "C1A", Age: "25-34", Gender: "female", "Amount spent (USD)": 60 }),
      ],
    });
    const d = computeVariableDrilldown("HK_X", { analysis, mst: null, variableRows: [] });
    expect(d.segments.available).toBe(true);
    expect(d.segments.rows[0]!.totals.spend).toBe(60);
  });

  it("unavailable with a reason when the export has no per-cell grain", () => {
    const analysis = analysisWith({
      performance_by_cell: [perfRow({ cell_id: "C1A", hook_variable: "HK_X" })],
      demographic_registration_signal: [
        demoRow({ cell_id: "ACCOUNT", Age: "25-34", Gender: "female" }),
      ],
    });
    const d = computeVariableDrilldown("HK_X", { analysis, mst: null, variableRows: [] });
    expect(d.segments.available).toBe(false);
    expect(d.segments.rows).toEqual([]);
    expect(d.segments.unavailableReason).toMatch(/doesn't break down by creative cell/);
  });

  it("unavailable when no cell carries the variable", () => {
    const d = computeVariableDrilldown("HK_Nowhere", {
      analysis: analysisWith({ performance_by_cell: [perfRow({ cell_id: "C1A", hook_variable: "HK_X" })] }),
      mst: null,
      variableRows: [],
    });
    expect(d.segments.available).toBe(false);
    expect(d.segments.unavailableReason).toMatch(/No creative cell/);
  });
});

describe("computeVariableDrilldown — text variants & family", () => {
  it("collects copy only from library cells carrying the code, dropping empty copy", () => {
    const mst = mstWithLibrary([
      { cell_id: "C1A", book2_concept_name: "Alpha", hook_variable: "HK_X", primary_message: "P1", secondary_message: "S1", cta: "Go" },
      { cell_id: "C1B", book2_concept_name: "Beta", hook_variable: "HK_Other", primary_message: "P2", secondary_message: "", cta: "" },
      { cell_id: "C1C", book2_concept_name: "Gamma", hook_variable: "HK_X", primary_message: "", secondary_message: "", cta: "" },
    ]);
    const d = computeVariableDrilldown("HK_X", { analysis: analysisWith({}), mst, variableRows: [] });
    expect(d.textVariants).toHaveLength(1);
    expect(d.textVariants[0]).toEqual({ cellId: "C1A", conceptName: "Alpha", primary: "P1", secondary: "S1", cta: "Go" });
  });

  it("family: account data first, canonical prefix fallback, never invented", () => {
    const withData = computeVariableDrilldown("WEIRD_Code", {
      analysis: analysisWith({ v3_variable_performance: [varRow({ variable_id: "WEIRD_Code", variable_family: "tone" })] }),
      mst: null,
      variableRows: [],
    });
    expect(withData.family).toBe("tone");

    const byPrefix = computeVariableDrilldown("HK_Anything", { analysis: analysisWith({}), mst: null, variableRows: [] });
    expect(byPrefix.family).toBe("hook");

    const unknown = computeVariableDrilldown("ZZ_What", { analysis: analysisWith({}), mst: null, variableRows: [] });
    expect(unknown.family).toBeNull();
  });
});
