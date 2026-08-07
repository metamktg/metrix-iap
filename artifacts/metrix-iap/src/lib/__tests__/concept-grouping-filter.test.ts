// ─── Concept grouping + creative filter integration tests ─────────────
// Verifies that when IapLibraryView applies spend-floor / tier / concept
// filters before calling groupByConceptFamily it correctly:
//   1. Uses deduped rows for filter eligibility
//   2. Feeds the FULL multi-result-type rows for surviving cells into the
//      grouping layer so blended KPI totals are correct
//
// These tests mirror the logic in IapLibraryView.tsx grouped-view branch.

import { describe, it, expect } from "vitest";
import { groupByConceptFamily } from "../concept-grouping";
import { applyCreativeFilters, DEFAULT_FILTER_STATE } from "../../components/creative/CreativeFilterPanel";
import type { CellPerformanceRow } from "../data/seedTypes";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeRow(
  cell_id: string,
  resultType: string,
  spend: number,
  results: number,
  conceptName: string,
): CellPerformanceRow {
  return {
    cell_id,
    "Result type": resultType,
    "Amount spent (USD)": spend,
    Results: results,
    Impressions: 10000,
    Reach: 8000,
    "Link clicks": 100,
    CTR_link_pct: 1.0,
    CPA_result: results > 0 ? spend / results : null,
    Result_per_link_click_pct: 10,
    book2_concept_name: conceptName,
    // Required fields with placeholder values
    ad_name: "",
    campaign_name: "",
    adset_name: "",
    cell_code: cell_id,
    ad_id: "",
    campaign_id: "",
    adset_id: "",
    date_start: "2024-01-01",
    date_stop: "2024-01-31",
    tracking_basis: "delivery" as const,
  } as CellPerformanceRow;
}

/** Simulate IapLibraryView grouped-view: filter deduped, then feed full rows. */
function applyGroupedFilter(
  allRows: CellPerformanceRow[],
  filters: typeof DEFAULT_FILTER_STATE,
) {
  // Dedup by cell_id (representative rows for filter eligibility)
  const seen = new Set<string>();
  const deduped = allRows.filter((r) => {
    if (seen.has(r.cell_id)) return false;
    seen.add(r.cell_id);
    return true;
  });

  const filteredDeduped = applyCreativeFilters(deduped, filters, "spend");
  const survivingIds = new Set(filteredDeduped.map((r) => r.cell_id));
  const filteredFullRows = allRows.filter((r) => survivingIds.has(r.cell_id));
  return groupByConceptFamily(filteredFullRows, null);
}

// ─── Test data ────────────────────────────────────────────────────────

// C1A: ConceptAlpha, spend=$500 total (two result types: $300 + $200)
// C1B: ConceptAlpha, spend=$50  total (below $100 floor)
// C2A: ConceptBeta,  spend=$600 (single result type)
const C1A_purchase = makeRow("C1A", "Purchase",    300, 6,  "ConceptAlpha");
const C1A_atc      = makeRow("C1A", "AddToCart",   200, 20, "ConceptAlpha");
const C1B          = makeRow("C1B", "Purchase",    50,  1,  "ConceptAlpha");
const C2A          = makeRow("C2A", "Purchase",    600, 12, "ConceptBeta");

const ALL_ROWS = [C1A_purchase, C1A_atc, C1B, C2A];

// ─── Tests ────────────────────────────────────────────────────────────

describe("concept grouping with multi-result-type cells + creative filters", () => {
  it("without filters: blended spend for ConceptAlpha includes both result-type rows of C1A", () => {
    const groups = applyGroupedFilter(ALL_ROWS, DEFAULT_FILTER_STATE);
    const alpha = groups.find((g) => g.conceptName === "ConceptAlpha")!;
    expect(alpha).toBeDefined();
    // C1A contributes $300 + $200 = $500; C1B contributes $50 → total $550
    expect(alpha.blended.spend).toBe(550);
    expect(alpha.blended.cellCount).toBe(2);
  });

  it("spend floor $100: drops C1B but keeps ALL rows of C1A (multi-result-type)", () => {
    const groups = applyGroupedFilter(ALL_ROWS, { ...DEFAULT_FILTER_STATE, minSpendUsd: 100 });
    const alpha = groups.find((g) => g.conceptName === "ConceptAlpha")!;
    // C1B ($50) filtered out; C1A ($300 + $200) kept
    // Blended spend = 300 + 200 = 500 (NOT just 300 from the representative row)
    expect(alpha.blended.spend).toBe(500);
    expect(alpha.blended.cellCount).toBe(1);
  });

  it("spend floor $100: blended results for C1A include both result-type rows", () => {
    const groups = applyGroupedFilter(ALL_ROWS, { ...DEFAULT_FILTER_STATE, minSpendUsd: 100 });
    const alpha = groups.find((g) => g.conceptName === "ConceptAlpha")!;
    // Purchase: 6 results + AddToCart: 20 results = 26 total
    expect(alpha.blended.results).toBe(26);
  });

  it("spend floor $100: hides ConceptAlpha entirely when all its cells are below the floor", () => {
    // Use only C1B ($50) as the alpha cell — should be hidden
    const rows = [C1B, C2A];
    const groups = applyGroupedFilter(rows, { ...DEFAULT_FILTER_STATE, minSpendUsd: 100 });
    expect(groups.find((g) => g.conceptName === "ConceptAlpha")).toBeUndefined();
    expect(groups.find((g) => g.conceptName === "ConceptBeta")).toBeDefined();
  });

  it("concept filter: keeps only selected concept family with all its result-type rows", () => {
    const groups = applyGroupedFilter(ALL_ROWS, { ...DEFAULT_FILTER_STATE, conceptNames: ["ConceptAlpha"] });
    expect(groups).toHaveLength(1);
    expect(groups[0].conceptName).toBe("ConceptAlpha");
    // Both result-type rows of C1A plus C1B
    expect(groups[0].blended.spend).toBe(550);
  });

  it("combined spend floor + concept filter", () => {
    // Floor $100 + concept=ConceptAlpha: C1B dropped, C1A kept (both result rows)
    const groups = applyGroupedFilter(ALL_ROWS, {
      minSpendUsd: 100,
      tier: "all",
      conceptNames: ["ConceptAlpha"],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].blended.spend).toBe(500);
    expect(groups[0].blended.results).toBe(26);
  });
});
