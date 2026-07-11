// ─── Segment analytics integrity tests ────────────────────────────────
// Runs against the checked-in seed fixture (captured from the live seed
// endpoint) so the math is verified on real demographic rows from both a
// per-cell-grain account (bookster) and a manual-upload account with an
// ACCOUNT aggregate grain (littledata).

import { describe, it, expect } from "vitest";
import seed from "../test-fixtures/metrix_seed_bundle.json";
import type { AnalysisData, DemographicRow, MetrixSeed, MST } from "@/lib/data/seedTypes";
import {
  ACCOUNT_LEVEL_CELL_ID,
  scopeDemographicRows,
  cellGrainRows,
  listSegments,
  rowsForSegment,
  computeSegmentTotals,
  deriveSegmentMetrics,
  assessSegmentSignal,
  computeSegmentAttribution,
  computeSegmentDrilldown,
  segmentLabel,
  LOW_SIGNAL_IMPRESSIONS,
} from "./segment-analytics";

const bundle = seed as unknown as MetrixSeed;

function accountData(id: string): { analysis: AnalysisData; mst: MST | null } {
  const acct = bundle.ad_accounts.find((a) => a.id === id);
  if (!acct?.iap?.analysis) throw new Error(`fixture account ${id} missing analysis`);
  return { analysis: acct.iap.analysis, mst: acct.mst ?? null };
}

describe("scopeDemographicRows", () => {
  it("uses only ACCOUNT rows for account-level totals when that grain exists (no double counting)", () => {
    const { analysis } = accountData("littledata");
    const all = analysis.demographic_registration_signal;
    const scoped = scopeDemographicRows(all, null);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((r) => r.cell_id === ACCOUNT_LEVEL_CELL_ID)).toBe(true);
    // Per-cell rows overlap the ACCOUNT grain — scoped totals must be the
    // ACCOUNT totals, strictly less than the naive all-rows sum.
    const naive = all.reduce((n, r) => n + r["Amount spent (USD)"], 0);
    const honest = computeSegmentTotals(scoped).spend!;
    expect(honest).toBeLessThan(naive);
  });

  it("uses all rows when no ACCOUNT grain exists", () => {
    const { analysis } = accountData("bookster");
    const all = analysis.demographic_registration_signal;
    expect(scopeDemographicRows(all, null)).toHaveLength(all.length);
  });

  it("never includes the ACCOUNT grain when scoping to cells", () => {
    const { analysis } = accountData("littledata");
    const scoped = scopeDemographicRows(analysis.demographic_registration_signal, ["9 Image + Discount", ACCOUNT_LEVEL_CELL_ID]);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((r) => r.cell_id === "9 Image + Discount")).toBe(true);
  });
});

describe("computeSegmentTotals", () => {
  it("segment totals reconcile with the scoped marginals (sum over segments == sum over rows)", () => {
    for (const id of ["bookster", "littledata"]) {
      const { analysis } = accountData(id);
      const scoped = scopeDemographicRows(analysis.demographic_registration_signal, null);
      const whole = computeSegmentTotals(scoped);
      const segs = listSegments(scoped);
      let spend = 0;
      let results = 0;
      let impressions = 0;
      let linkClicks = 0;
      for (const seg of segs) {
        const t = computeSegmentTotals(rowsForSegment(scoped, seg));
        spend += t.spend!;
        results += t.results!;
        impressions += t.impressions!;
        linkClicks += t.linkClicks!;
      }
      expect(spend).toBeCloseTo(whole.spend!, 6);
      expect(results).toBe(whole.results);
      expect(impressions).toBe(whole.impressions);
      expect(linkClicks).toBe(whole.linkClicks);
    }
  });

  it("returns null (never 0) when any row lacks a field — littledata reach is null", () => {
    const { analysis } = accountData("littledata");
    const scoped = scopeDemographicRows(analysis.demographic_registration_signal, null);
    const totals = computeSegmentTotals(scoped);
    expect(totals.reach).toBeNull();
    expect(totals.spend).toBeGreaterThan(0);
  });

  it("returns all-null totals for an empty row set", () => {
    const t = computeSegmentTotals([]);
    expect(t.rowCount).toBe(0);
    expect(t.spend).toBeNull();
    expect(t.results).toBeNull();
    expect(t.reach).toBeNull();
  });
});

describe("deriveSegmentMetrics", () => {
  const base = { rowCount: 2, spend: 100, results: 4, reach: 500, impressions: 1000, linkClicks: 50, clicksAll: 80 };

  it("derives from raw inputs", () => {
    const d = deriveSegmentMetrics(base);
    expect(d.cpa).toBeCloseTo(25);
    expect(d.ctr).toBeCloseTo(5);
    expect(d.cpm).toBeCloseTo(100);
    expect(d.cpc).toBeCloseTo(2);
    expect(d.frequency).toBeCloseTo(2);
    expect(d.cvr).toBeCloseTo(8);
  });

  it("stays null when an input is missing", () => {
    const d = deriveSegmentMetrics({ ...base, reach: null, linkClicks: null });
    expect(d.frequency).toBeNull();
    expect(d.cpc).toBeNull();
    expect(d.cvr).toBeNull();
    expect(d.cpa).toBeCloseTo(25); // unaffected inputs still derive
  });

  it("stays null on zero denominators (never Infinity)", () => {
    const d = deriveSegmentMetrics({ ...base, results: 0, impressions: 0 });
    expect(d.cpa).toBeNull();
    expect(d.ctr).toBeNull();
    expect(d.cpm).toBeNull();
  });
});

describe("assessSegmentSignal", () => {
  it("flags low impressions and tiny spend share", () => {
    const scoped = { rowCount: 10, spend: 10000, results: 100, reach: null, impressions: 1e6, linkClicks: 1000, clicksAll: null };
    const sparse = { rowCount: 1, spend: 50, results: 1, reach: null, impressions: LOW_SIGNAL_IMPRESSIONS - 1, linkClicks: 3, clicksAll: null };
    const s = assessSegmentSignal(sparse, scoped);
    expect(s.low).toBe(true);
    expect(s.reasons.length).toBe(2);
  });

  it("does not flag a well-funded segment", () => {
    const scoped = { rowCount: 10, spend: 1000, results: 50, reach: null, impressions: 100000, linkClicks: 900, clicksAll: null };
    const seg = { rowCount: 3, spend: 300, results: 12, reach: null, impressions: 40000, linkClicks: 300, clicksAll: null };
    expect(assessSegmentSignal(seg, scoped).low).toBe(false);
  });
});

describe("computeSegmentAttribution", () => {
  it("bookster: attributes a segment to real cells with concept names and variable codes", () => {
    const { analysis, mst } = accountData("bookster");
    const segs = listSegments(scopeDemographicRows(analysis.demographic_registration_signal, null));
    const seg = segs[0]!;
    const attr = computeSegmentAttribution(analysis, mst, seg, null);
    expect(attr.available).toBe(true);
    expect(attr.cells.length).toBeGreaterThan(0);
    for (const cell of attr.cells) {
      expect(cell.cellId).not.toBe(ACCOUNT_LEVEL_CELL_ID);
      expect(cell.conceptName).toBeTruthy();
      expect(cell.variableCodes.length).toBeGreaterThan(0);
      // No unsplit compound codes.
      expect(cell.variableCodes.every((c) => !c.includes("+"))).toBe(true);
    }
    expect(attr.variables.length).toBeGreaterThan(0);
    // Cell attributions reconcile with the segment's cell-grain totals.
    const grain = rowsForSegment(cellGrainRows(analysis.demographic_registration_signal, null), seg);
    const whole = computeSegmentTotals(grain);
    const spendSum = attr.cells.reduce((n, c) => n + (c.totals.spend ?? 0), 0);
    expect(spendSum).toBeCloseTo(whole.spend!, 6);
  });

  it("littledata: per-cell attribution works and excludes the ACCOUNT grain", () => {
    const { analysis, mst } = accountData("littledata");
    const grain = cellGrainRows(analysis.demographic_registration_signal, null);
    const seg = listSegments(grain)[0]!;
    const attr = computeSegmentAttribution(analysis, mst, seg, null);
    expect(attr.available).toBe(true);
    expect(attr.cells.every((c) => c.cellId !== ACCOUNT_LEVEL_CELL_ID)).toBe(true);
  });

  it("reports honestly unavailable when only account-level grain covers the segment", () => {
    const { mst } = accountData("littledata");
    const accountOnly: AnalysisData = {
      performance_by_cell: [],
      v3_variable_performance: [],
      demographic_registration_signal: [
        {
          cell_id: ACCOUNT_LEVEL_CELL_ID,
          "Ad name": "All ads",
          Age: "25-34",
          Gender: "female",
          "Amount spent (USD)": 100,
          Reach: 1000,
          Impressions: 2000,
          Results: 5,
          "Clicks (all)": 60,
          "Link clicks": 40,
          CPA_result: 20,
          CTR_link_pct: 2,
          Result_per_link_click_pct: 12.5,
        } as DemographicRow,
      ],
      v3_placement_signal: [],
      c4e_placement_signal: [],
      top_checkout_cells: [],
      top_checkout_variables: [],
    };
    const attr = computeSegmentAttribution(accountOnly, mst, { age: "25-34", gender: "female" }, null);
    expect(attr.available).toBe(false);
    expect(attr.unavailableReason).toMatch(/account-level/i);
    expect(attr.cells).toHaveLength(0);
    expect(attr.variables).toHaveLength(0);
  });
});

describe("computeSegmentDrilldown", () => {
  it("drill-down totals match the avatar grid marginals for the same segment", () => {
    const { analysis, mst } = accountData("bookster");
    const scoped = scopeDemographicRows(analysis.demographic_registration_signal, null);
    for (const seg of listSegments(scoped)) {
      const d = computeSegmentDrilldown(analysis, mst, seg, null);
      const expected = computeSegmentTotals(rowsForSegment(scoped, seg));
      expect(d.totals).toEqual(expected);
    }
  });

  it("cell-scoped drill-down only counts rows for those cells", () => {
    const { analysis, mst } = accountData("bookster");
    const cellIds = ["C2B"];
    const scoped = scopeDemographicRows(analysis.demographic_registration_signal, cellIds);
    const seg = listSegments(scoped)[0]!;
    const d = computeSegmentDrilldown(analysis, mst, seg, cellIds);
    expect(d.totals).toEqual(computeSegmentTotals(rowsForSegment(scoped, seg)));
    expect(d.attribution.cells.every((c) => c.cellId === "C2B")).toBe(true);
  });
});

describe("segmentLabel", () => {
  it("renders human labels", () => {
    expect(segmentLabel({ age: "25-34", gender: "female" })).toBe("Women 25-34");
    expect(segmentLabel({ age: "45-54", gender: "male" })).toBe("Men 45-54");
    expect(segmentLabel({ age: "65+", gender: "unknown" })).toBe("Unknown 65+");
  });
});
