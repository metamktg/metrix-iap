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
  isJointPlacementRow,
  scopeJointPlacementRows,
  jointIntersectionTotals,
  computeSegmentPlacementBreakdown,
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

// ─── Joint demographic × placement grain ──────────────────────────────

function demoRow(overrides: Partial<DemographicRow> & { cell_id: string; Age: string; Gender: string }): DemographicRow {
  return {
    "Ad name": "ad",
    "Amount spent (USD)": 0,
    Reach: 0,
    Impressions: 0,
    Results: 0,
    "Clicks (all)": 0,
    "Link clicks": 0,
    CPA_result: null,
    CTR_link_pct: 0,
    Result_per_link_click_pct: 0,
    ...overrides,
  } as DemographicRow;
}

/** Marginal rows for C1 plus joint rows for C1 (overlapping) and C2 (joint-only). */
function jointFixtureRows(): DemographicRow[] {
  return [
    // C1 marginal grain (authoritative for totals)
    demoRow({ cell_id: "C1", Age: "25-34", Gender: "female", "Amount spent (USD)": 100, Impressions: 2000, Results: 10, "Link clicks": 40, "Clicks (all)": 60, Reach: 1500 }),
    // C1 joint grain — overlaps the marginal row above (would double-count if summed)
    demoRow({ cell_id: "C1", Age: "25-34", Gender: "female", Placement: "Feed", Platform: "facebook", "Amount spent (USD)": 60, Impressions: 1200, Results: 6, "Link clicks": 25, "Clicks (all)": 38, Reach: 900 }),
    demoRow({ cell_id: "C1", Age: "25-34", Gender: "female", Placement: "Stories", Platform: "instagram", "Amount spent (USD)": 40, Impressions: 800, Results: 4, "Link clicks": 15, "Clicks (all)": 22, Reach: 600 }),
    // C2 joint-only grain — its joint rows ARE the marginals
    demoRow({ cell_id: "C2", Age: "25-34", Gender: "female", Placement: "Feed", Platform: "facebook", "Amount spent (USD)": 30, Impressions: 500, Results: 2, "Link clicks": 10, "Clicks (all)": 14, Reach: 400 }),
    demoRow({ cell_id: "C2", Age: "35-44", Gender: "male", Placement: "Reels", Platform: "instagram", "Amount spent (USD)": 20, Impressions: 300, Results: 1, "Link clicks": 5, "Clicks (all)": 8, Reach: 250 }),
  ];
}

describe("joint demographic × placement grain", () => {
  it("isJointPlacementRow detects the joint grain", () => {
    const rows = jointFixtureRows();
    expect(isJointPlacementRow(rows[0]!)).toBe(false);
    expect(isJointPlacementRow(rows[1]!)).toBe(true);
  });

  it("fixture accounts carry no joint grain — nothing changes for existing imports", () => {
    for (const id of ["bookster", "littledata"]) {
      const { analysis } = accountData(id);
      const rows = analysis.demographic_registration_signal;
      expect(rows.some(isJointPlacementRow)).toBe(false);
      expect(scopeJointPlacementRows(rows, null)).toHaveLength(0);
      expect(computeSegmentPlacementBreakdown(rows, listSegments(scopeDemographicRows(rows, null))[0]!, null).available).toBe(false);
    }
  });

  it("scopeDemographicRows never double-counts overlapping marginal + joint rows", () => {
    const rows = jointFixtureRows();
    const scoped = scopeDemographicRows(rows, null);
    // C1 uses its single marginal row; C2 uses its joint rows (only grain it has).
    expect(scoped.filter((r) => r.cell_id === "C1")).toHaveLength(1);
    expect(scoped.filter((r) => r.cell_id === "C2")).toHaveLength(2);
    const totals = computeSegmentTotals(scoped);
    expect(totals.spend).toBeCloseTo(100 + 30 + 20, 6); // never 100+60+40+30+20
  });

  it("cell-scoped totals also collapse overlapping grains", () => {
    const rows = jointFixtureRows();
    const c1 = computeSegmentTotals(scopeDemographicRows(rows, ["C1"]));
    expect(c1.spend).toBeCloseTo(100, 6);
    const c2 = computeSegmentTotals(scopeDemographicRows(rows, ["C2"]));
    expect(c2.spend).toBeCloseTo(50, 6);
  });

  it("jointIntersectionTotals returns real numbers for covered intersections and null for gaps", () => {
    const joint = scopeJointPlacementRows(jointFixtureRows(), null);
    const seg = { age: "25-34", gender: "female" };
    const feed = jointIntersectionTotals(joint, seg, "Feed", "facebook");
    expect(feed).not.toBeNull();
    expect(feed!.spend).toBeCloseTo(60 + 30, 6); // C1 + C2 Feed rows
    expect(feed!.results).toBe(8);
    // Case/whitespace-insensitive matching against placement-signal labels.
    expect(jointIntersectionTotals(joint, seg, " feed ", "FACEBOOK")!.spend).toBeCloseTo(90, 6);
    // Uncovered intersection: explicit null, never zero.
    expect(jointIntersectionTotals(joint, seg, "Reels", "instagram")).toBeNull();
    expect(jointIntersectionTotals(joint, { age: "35-44", gender: "male" }, "Feed", "facebook")).toBeNull();
  });

  it("computeSegmentPlacementBreakdown ranks placements within the segment", () => {
    const b = computeSegmentPlacementBreakdown(jointFixtureRows(), { age: "25-34", gender: "female" }, null);
    expect(b.available).toBe(true);
    expect(b.entries.map((e) => `${e.placement}|${e.platform}`)).toEqual(["Feed|facebook", "Stories|instagram"]);
    expect(b.entries[0]!.totals.spend).toBeCloseTo(90, 6);
    expect(b.entries[0]!.derived.cpa).toBeCloseTo(90 / 8, 6);
  });

  it("cell-scoped breakdown only counts joint rows for those cells", () => {
    const b = computeSegmentPlacementBreakdown(jointFixtureRows(), { age: "25-34", gender: "female" }, ["C2"]);
    expect(b.available).toBe(true);
    expect(b.entries).toHaveLength(1);
    expect(b.entries[0]!.totals.spend).toBeCloseTo(30, 6);
  });

  it("ACCOUNT-grain joint rows are the authoritative account breakdown when present", () => {
    const rows = [
      ...jointFixtureRows(),
      demoRow({ cell_id: ACCOUNT_LEVEL_CELL_ID, Age: "25-34", Gender: "female", Placement: "Feed", Platform: "facebook", "Amount spent (USD)": 95, Impressions: 1800, Results: 9, "Link clicks": 37, "Clicks (all)": 55, Reach: 1400 }),
    ];
    const accountScope = scopeJointPlacementRows(rows, null);
    expect(accountScope.every((r) => r.cell_id === ACCOUNT_LEVEL_CELL_ID)).toBe(true);
    // Cell scoping never uses the ACCOUNT grain.
    const cellScope = scopeJointPlacementRows(rows, ["C1", ACCOUNT_LEVEL_CELL_ID]);
    expect(cellScope.every((r) => r.cell_id === "C1")).toBe(true);
  });

  it("computeSegmentDrilldown carries the placement breakdown alongside unchanged totals", () => {
    const { analysis, mst } = accountData("bookster");
    const rows = jointFixtureRows();
    const jointAnalysis: AnalysisData = { ...analysis, demographic_registration_signal: rows };
    const d = computeSegmentDrilldown(jointAnalysis, mst, { age: "25-34", gender: "female" }, null);
    expect(d.placements.available).toBe(true);
    expect(d.placements.entries.length).toBe(2);
    expect(d.totals.spend).toBeCloseTo(130, 6); // marginal-grain totals, no double count
    // Existing imports without the joint grain stay exactly as before.
    const plain = computeSegmentDrilldown(analysis, mst, listSegments(scopeDemographicRows(analysis.demographic_registration_signal, null))[0]!, null);
    expect(plain.placements.available).toBe(false);
    expect(plain.placements.entries).toHaveLength(0);
  });
});

describe("segmentLabel", () => {
  it("renders human labels", () => {
    expect(segmentLabel({ age: "25-34", gender: "female" })).toBe("Women 25-34");
    expect(segmentLabel({ age: "45-54", gender: "male" })).toBe("Men 45-54");
    expect(segmentLabel({ age: "65+", gender: "unknown" })).toBe("Unknown 65+");
  });
});
