// Signal classification with coverage as context — and cause-specific
// creative empty states — the client half of the honesty layer.
//
// Owner direction (2026-09-02): coverage is context, never a wall. A
// segment's own rows are observed evidence whatever share of the account
// the demographic export covers; the measured coverage travels beside the
// classification so a surface can show it once, quietly. A strong segment
// therefore stays HIGH under partial coverage, and the coverage figure is
// there for the surface to state.

import { describe, expect, it } from "vitest";
import {
  assessSegmentSignal,
  demographicCoverageOf,
  type SegmentRawTotals,
} from "@/lib/segment-analytics";
import {
  demographicEmptyReasonFor,
  placementsEmptyReasonFor,
  funnelEmptyReasonFor,
  creativeEmptyReasonsFor,
  ACCOUNT_GRAIN_CELL_ID,
} from "@/lib/creative-empty-reasons";
import type { CellPerformanceRow, DemographicRow } from "@/lib/data/seedTypes";

const strongTotals: SegmentRawTotals = {
  spend: 400, results: 20, impressions: 50_000, reach: 40_000,
  linkClicks: 900, clicksAll: 1200,
  addsToCart: null, checkoutsInitiated: null, purchases: null, addsToCartValue: null,
};
const scopedTotals: SegmentRawTotals = { ...strongTotals, spend: 850, impressions: 60_000 };

describe("assessSegmentSignal · bands and coverage as context", () => {
  it("classifies a strong segment on its own volume without coverage info (legacy runs)", () => {
    const s = assessSegmentSignal(strongTotals, scopedTotals, null);
    expect(s.state).toBe("ok"); // $400 / 20 results: the documented medium band
    expect(s.band).toBe("medium");
    expect(s.low).toBe(false);
    expect(s.coverage).toBeNull();
  });

  it("emphasises a segment that clears the documented high band", () => {
    const s = assessSegmentSignal({ ...strongTotals, spend: 1400, results: 120 }, { ...scopedTotals, spend: 3000 }, null);
    expect(s.state).toBe("high");
    expect(s.band).toBe("high");
    expect(s.reasons).toEqual([]);
  });

  it("keeps a strong segment HIGH under partial coverage and carries the coverage beside it", () => {
    const s = assessSegmentSignal({ ...strongTotals, spend: 1400, results: 120 }, { ...scopedTotals, spend: 3000 }, {
      spend_coverage_pct: 59.3,
      below_threshold: true,
      note: "Demographic rows carry $1,257.34 of the $2,121.74 daily-attributable spend (59.3%)…",
    });
    expect(s.state).toBe("high");
    expect(s.low).toBe(false);
    expect(s.reasons).toEqual([]); // no caveat prose on the read itself
    expect(s.coverage).toEqual({ pct: 59.3, partial: true, note: expect.stringContaining("59.3%") });
  });

  it("marks a thin read low with the documented band as the reason", () => {
    const s = assessSegmentSignal({ ...strongTotals, spend: 30, results: 0, impressions: 400 }, scopedTotals, null);
    expect(s.state).toBe("low");
    expect(s.band).toBe("insufficient");
    expect(s.reasons.join(" ")).toContain("400 impressions");
    expect(s.reasons.join(" ")).toContain("documented floor");
  });

  it("carries measured, above-threshold coverage without marking it partial", () => {
    const s = assessSegmentSignal(strongTotals, scopedTotals, {
      spend_coverage_pct: 97.2,
      below_threshold: false,
      note: null,
    });
    expect(s.state).toBe("ok");
    expect(s.coverage).toEqual({ pct: 97.2, partial: false, note: null });
  });
});

describe("demographicCoverageOf", () => {
  it("extracts the demographic class from a summary data_coverage object", () => {
    const cov = demographicCoverageOf({
      classes: [
        { report_class: "device_placement", spend_coverage_pct: 100, below_threshold: false, note: null },
        { report_class: "demographic", spend_coverage_pct: 1.3, below_threshold: true, note: "cause" },
      ],
    });
    expect(cov).toEqual({ spend_coverage_pct: 1.3, below_threshold: true, note: "cause" });
  });

  it("returns null when coverage is unmeasured", () => {
    expect(demographicCoverageOf(null)).toBeNull();
    expect(demographicCoverageOf({ classes: [] })).toBeNull();
  });
});

// ── Creative popup empty-state reasons (§1.4) ─────────────────────────

function demoRow(cellId: string): DemographicRow {
  return {
    cell_id: cellId, "Ad name": "x", Age: "25-34", Gender: "female",
    "Amount spent (USD)": 1, Reach: 1, Impressions: 1, Results: 0,
    "Clicks (all)": 0, "Link clicks": 0, CPA_result: null, CTR_link_pct: 0,
    Result_per_link_click_pct: 0,
  } as DemographicRow;
}

describe("creative empty-state reasons", () => {
  it("distinguishes never-imported from account-level-grain from no-rows-for-cell", () => {
    expect(demographicEmptyReasonFor([], "C8A")).toContain("No demographic export has been imported");
    expect(demographicEmptyReasonFor([demoRow(ACCOUNT_GRAIN_CELL_ID)], "C8A")).toContain("Account-level demographic evidence exists");
    expect(demographicEmptyReasonFor([demoRow("C1A")], "C8A")).toContain("no rows that join to this creative");
    expect(demographicEmptyReasonFor([demoRow("C8A")], "C8A")).toBeNull();
  });

  it("placements reason only when nothing is imported", () => {
    expect(placementsEmptyReasonFor([])).toContain("No device × placement export");
    expect(placementsEmptyReasonFor([{}])).toBeNull();
  });

  it("funnel reason distinguishes no-mapping-at-all from no-rows-for-this-cell", () => {
    // The reason names the join order (mapped Ad IDs first, then the cell code) and the remedy.
    expect(funnelEmptyReasonFor(undefined, "C8A")).toContain("mapped Ad IDs first");
    expect(funnelEmptyReasonFor([], "C8A")).toContain("Map the creative to its ad and re-run analysis");
    const perfRow = { cell_id: "C1A" } as CellPerformanceRow;
    expect(funnelEmptyReasonFor([perfRow], "C8A")).toContain("don't appear in the imported performance exports");
    expect(funnelEmptyReasonFor([perfRow], "C1A")).toBeNull();
  });
});

// ─── Derivation used by every creative popup ────────────────────────────
// The per-tab rules above were previously applied by each <CreativeCard>
// call site, and seven of ten did not apply them (and none supplied a funnel
// reason), so most creative popups still told users to import a file they
// had already imported. CreativeExpandDialog now derives all three from the
// scoped account via this function — these cases pin that derivation.

describe("creativeEmptyReasonsFor", () => {
  const analysis = {
    demographic_registration_signal: [demoRow(ACCOUNT_GRAIN_CELL_ID)],
    v3_placement_signal: [],
    c4e_placement_signal: [],
    performance_by_cell: [{ cell_id: "C1A" } as CellPerformanceRow],
  };

  it("derives all three tab reasons for a cell with no joined rows", () => {
    const r = creativeEmptyReasonsFor(analysis, "C8A");
    expect(r.demographic).toContain("Account-level demographic evidence exists");
    expect(r.placements).toContain("No device × placement export");
    expect(r.funnel).toContain("don't appear in the imported performance exports");
  });

  it("returns null per tab that genuinely has rows for the cell", () => {
    const r = creativeEmptyReasonsFor(
      { ...analysis, c4e_placement_signal: [{}] as never[] },
      "C1A",
    );
    expect(r.placements).toBeNull();
    expect(r.funnel).toBeNull();
  });

  it("stays silent without a cell id rather than guessing a cause", () => {
    expect(creativeEmptyReasonsFor(analysis, null)).toEqual({
      demographic: null, placements: null, funnel: null,
    });
  });

  it("reports never-imported (not account-grain) when the account has no demographic rows", () => {
    const r = creativeEmptyReasonsFor({ ...analysis, demographic_registration_signal: [] }, "C8A");
    expect(r.demographic).toContain("No demographic export has been imported");
  });
});
