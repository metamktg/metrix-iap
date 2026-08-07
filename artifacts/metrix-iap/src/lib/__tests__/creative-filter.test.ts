// ─── Creative filter panel logic unit tests ───────────────────────────
// Covers applyCreativeFilters (spend floor, concept, tier) and
// sortValueForCell across the funnel sort keys.
//
// Tier semantics:
//   sortDir="desc" (higher-is-better, e.g. CTR):
//     top25 = highest values (≥ p75), bottom25 = lowest (≤ p25)
//   sortDir="asc" (lower-is-better, e.g. CPA):
//     top25 = lowest values (≤ p25), bottom25 = highest (≥ p75)

import { describe, it, expect } from "vitest";
import { applyCreativeFilters, sortValueForCell, DEFAULT_FILTER_STATE } from "../../components/creative/CreativeFilterPanel";
import type { CreativeFilterState } from "../../components/creative/CreativeFilterPanel";

// ─── Shared helpers ────────────────────────────────────────────────────

function makeRow(overrides: Partial<ReturnType<typeof baseRow>> = {}) {
  return { ...baseRow(), ...overrides };
}

function baseRow() {
  return {
    cell_id: "TEST",
    "Amount spent (USD)": 500,
    "Link clicks": 100,
    Impressions: 10000,
    Reach: 8000,
    Results: 10,
    CPA_result: 50,
    CTR_link_pct: 1.0,
    Result_per_link_click_pct: 10,
    book2_concept_name: "ConceptA",
  };
}

const ROW_A = makeRow({ cell_id: "A", "Amount spent (USD)": 1000, CTR_link_pct: 2.5, CPA_result: 25 });
const ROW_B = makeRow({ cell_id: "B", "Amount spent (USD)": 200,  CTR_link_pct: 1.0, CPA_result: 100, book2_concept_name: "ConceptB" });
const ROW_C = makeRow({ cell_id: "C", "Amount spent (USD)": 600,  CTR_link_pct: 1.8, CPA_result: 55, book2_concept_name: "ConceptC" });
const ROW_D = makeRow({ cell_id: "D", "Amount spent (USD)": 50,   CTR_link_pct: 0.5, CPA_result: 200, book2_concept_name: "ConceptA" });

// n=4, sorted by CTR ascending: D(0.5), B(1.0), C(1.8), A(2.5)
// p25 = sortedValues[floor(4*0.25)] = sortedValues[1] = 1.0 (B's value)
// p75 = sortedValues[floor(4*0.75)] = sortedValues[3] = 2.5 (A's value)

const ALL = [ROW_A, ROW_B, ROW_C, ROW_D];

// ─── sortValueForCell ──────────────────────────────────────────────────

describe("sortValueForCell", () => {
  it("returns CTR for 'ctr' key", () => {
    expect(sortValueForCell(ROW_A, "ctr")).toBe(2.5);
  });

  it("returns CPA for 'cpa' key", () => {
    expect(sortValueForCell(ROW_A, "cpa")).toBe(25);
  });

  it("returns Infinity for 'cpa' when CPA_result is null", () => {
    const row = makeRow({ CPA_result: null });
    expect(sortValueForCell(row, "cpa")).toBe(Infinity);
  });

  it("returns spend for 'spend' key", () => {
    expect(sortValueForCell(ROW_A, "spend")).toBe(1000);
  });

  it("returns link_clicks for 'link_clicks' key", () => {
    expect(sortValueForCell(ROW_A, "link_clicks")).toBe(100);
  });

  it("returns 0 for 'none' key", () => {
    expect(sortValueForCell(ROW_A, "none")).toBe(0);
  });
});

// ─── applyCreativeFilters — spend floor ───────────────────────────────

describe("applyCreativeFilters · spend floor", () => {
  it("returns all rows when no filters active", () => {
    const result = applyCreativeFilters(ALL, DEFAULT_FILTER_STATE, "spend");
    expect(result).toHaveLength(4);
  });

  it("filters out rows below the spend floor", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, minSpendUsd: 300 };
    const result = applyCreativeFilters(ALL, filters, "spend");
    expect(result.map((r) => r.cell_id)).toEqual(["A", "C"]);
  });

  it("includes rows exactly at the spend floor", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, minSpendUsd: 200 };
    const result = applyCreativeFilters(ALL, filters, "spend");
    expect(result.map((r) => r.cell_id)).toContain("B");
  });

  it("returns empty list when floor exceeds all rows", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, minSpendUsd: 9999 };
    expect(applyCreativeFilters(ALL, filters, "spend")).toHaveLength(0);
  });
});

// ─── applyCreativeFilters — concept group ────────────────────────────

describe("applyCreativeFilters · concept group", () => {
  it("filters to selected concept names only", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, conceptNames: ["ConceptA"] };
    const result = applyCreativeFilters(ALL, filters, "spend");
    expect(result.map((r) => r.cell_id)).toEqual(["A", "D"]);
  });

  it("supports multiple concept selections", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, conceptNames: ["ConceptA", "ConceptB"] };
    const result = applyCreativeFilters(ALL, filters, "spend");
    expect(result.map((r) => r.cell_id)).toEqual(["A", "B", "D"]);
  });

  it("returns empty when no rows match selected concept", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, conceptNames: ["ZZZ"] };
    expect(applyCreativeFilters(ALL, filters, "spend")).toHaveLength(0);
  });
});

// ─── applyCreativeFilters — tier (CTR, higher-is-better, sortDir=desc) ─

describe("applyCreativeFilters · tier · sortDir=desc (CTR, higher-is-better)", () => {
  // n=4 sorted ascending: D(0.5), B(1.0), C(1.8), A(2.5)
  // p25 = sortedValues[1] = 1.0  (B's value)
  // p75 = sortedValues[3] = 2.5  (A's value)
  // higher-is-better → top25 = v >= p75(2.5) → A only
  //                     mid50 = v > p25(1.0) AND v < p75(2.5) → C(1.8)
  //                     bottom25 = v <= p25(1.0) → D(0.5), B(1.0)

  it("top25 keeps the HIGHEST CTR values (≥ p75)", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, tier: "top25" };
    const result = applyCreativeFilters(ALL, filters, "ctr", "desc");
    const ids = result.map((r) => r.cell_id);
    expect(ids).toContain("A"); // 2.5 >= p75=2.5 ✓ (inclusive)
    expect(ids).not.toContain("C"); // 1.8 < p75 ✗
    expect(ids).not.toContain("B"); // 1.0 < p75 ✗
    expect(ids).not.toContain("D"); // 0.5 < p75 ✗
  });

  it("mid50 keeps rows strictly between p25 and p75", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, tier: "mid50" };
    const result = applyCreativeFilters(ALL, filters, "ctr", "desc");
    const ids = result.map((r) => r.cell_id);
    expect(ids).toContain("C"); // 1.8 > 1.0 AND 1.8 < 2.5 ✓
    expect(ids).not.toContain("B"); // 1.0 not strictly > p25 ✗
    expect(ids).not.toContain("A"); // 2.5 not strictly < p75 ✗
    expect(ids).not.toContain("D"); // 0.5 < p25 ✗
  });

  it("bottom25 keeps the LOWEST CTR values (≤ p25)", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, tier: "bottom25" };
    const result = applyCreativeFilters(ALL, filters, "ctr", "desc");
    const ids = result.map((r) => r.cell_id);
    expect(ids).toContain("D"); // 0.5 <= p25=1.0 ✓
    expect(ids).toContain("B"); // 1.0 == p25=1.0 ✓ (inclusive)
    expect(ids).not.toContain("C"); // 1.8 > p25 ✗
    expect(ids).not.toContain("A"); // 2.5 > p25 ✗
  });
});

// ─── applyCreativeFilters — tier (CPA, lower-is-better, sortDir=asc) ──

describe("applyCreativeFilters · tier · sortDir=asc (CPA, lower-is-better)", () => {
  // n=4 rows by CPA ascending: A(25), C(55), B(100), D(200)
  // p25 = sortedValues[1] = 55 (C's value)
  // p75 = sortedValues[3] = 200 (D's value)
  // lower-is-better → top25 = v <= p25(55) → A(25), C(55)
  //                    mid50 = v > p25(55) AND v < p75(200) → B(100)
  //                    bottom25 = v >= p75(200) → D(200)

  it("top25 keeps the LOWEST CPA values (≤ p25) — most efficient", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, tier: "top25" };
    const result = applyCreativeFilters(ALL, filters, "cpa", "asc");
    const ids = result.map((r) => r.cell_id);
    expect(ids).toContain("A"); // CPA=25 <= p25=55 ✓
    expect(ids).toContain("C"); // CPA=55 == p25=55 ✓ (inclusive)
    expect(ids).not.toContain("B"); // CPA=100 > p25 ✗
    expect(ids).not.toContain("D"); // CPA=200 > p25 ✗
  });

  it("mid50 keeps rows strictly between p25 and p75 CPA values", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, tier: "mid50" };
    const result = applyCreativeFilters(ALL, filters, "cpa", "asc");
    const ids = result.map((r) => r.cell_id);
    expect(ids).toContain("B"); // CPA=100 > 55 AND 100 < 200 ✓
    expect(ids).not.toContain("A"); // 25 < p25 ✗
    expect(ids).not.toContain("C"); // 55 == p25 (not strictly greater) ✗
    expect(ids).not.toContain("D"); // 200 == p75 (not strictly less) ✗
  });

  it("bottom25 keeps the HIGHEST CPA values (≥ p75) — least efficient", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, tier: "bottom25" };
    const result = applyCreativeFilters(ALL, filters, "cpa", "asc");
    const ids = result.map((r) => r.cell_id);
    expect(ids).toContain("D"); // CPA=200 >= p75=200 ✓ (inclusive)
    expect(ids).not.toContain("B"); // CPA=100 < p75 ✗
    expect(ids).not.toContain("A"); // CPA=25 < p75 ✗
  });
});

// ─── applyCreativeFilters — tier edge cases ───────────────────────────

describe("applyCreativeFilters · tier edge cases", () => {
  it("returns all rows when tier is 'all'", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, tier: "all" };
    expect(applyCreativeFilters(ALL, filters, "ctr", "desc")).toHaveLength(4);
  });

  it("does not apply tier when only one row remains after other filters", () => {
    const filters: CreativeFilterState = { ...DEFAULT_FILTER_STATE, minSpendUsd: 999, tier: "top25" };
    const result = applyCreativeFilters(ALL, filters, "ctr", "desc");
    expect(result).toHaveLength(1);
    expect(result[0].cell_id).toBe("A");
  });
});

// ─── applyCreativeFilters — combined ─────────────────────────────────

describe("applyCreativeFilters · combined filters", () => {
  it("applies spend floor + concept in sequence", () => {
    const filters: CreativeFilterState = {
      minSpendUsd: 300,
      tier: "all",
      conceptNames: ["ConceptA"],
    };
    const result = applyCreativeFilters(ALL, filters, "spend");
    // A: spend=1000 ✓, concept=ConceptA ✓ → included
    // C: spend=600 ✓, concept=ConceptC ✗ → excluded
    expect(result.map((r) => r.cell_id)).toEqual(["A"]);
  });

  it("applies spend floor + tier (CTR desc) together", () => {
    // After spend floor ≥ 300: A(1000), C(600) remain
    // n=2, sorted ascending: C(1.8), A(2.5)
    // p25 = sortedValues[0] = 1.8, p75 = sortedValues[1] = 2.5
    // top25 (higher-is-better): v >= p75=2.5 → A
    const filters: CreativeFilterState = { minSpendUsd: 300, tier: "top25", conceptNames: [] };
    const result = applyCreativeFilters(ALL, filters, "ctr", "desc");
    expect(result.map((r) => r.cell_id)).toEqual(["A"]);
  });
});
