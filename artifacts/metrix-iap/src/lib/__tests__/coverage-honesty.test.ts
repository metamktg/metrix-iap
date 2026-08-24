// Coverage-gated signal classification + cause-specific creative empty
// states — the client half of the degraded-data honesty layer.
//
// A "signal ✓" badge computed from 1% of account spend is fabricated
// confidence (the AAFE bug): when the analysis run's measured demographic
// join coverage is below the server threshold, NO segment may classify as
// signal — the state is "insufficient_coverage", regardless of per-segment
// impressions/spend-share heuristics.

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
  ACCOUNT_GRAIN_CELL_ID,
} from "@/lib/creative-empty-reasons";
import type { CellPerformanceRow, DemographicRow } from "@/lib/data/seedTypes";

const strongTotals: SegmentRawTotals = {
  spend: 400, results: 20, impressions: 50_000, reach: 40_000,
  linkClicks: 900, clicksAll: 1200,
  addsToCart: null, checkoutsInitiated: null, purchases: null, addsToCartValue: null,
};
const scopedTotals: SegmentRawTotals = { ...strongTotals, spend: 850, impressions: 60_000 };

describe("assessSegmentSignal coverage gating", () => {
  it("classifies a strong segment as ok without coverage info (legacy runs)", () => {
    const s = assessSegmentSignal(strongTotals, scopedTotals, null);
    expect(s.state).toBe("ok");
    expect(s.low).toBe(false);
  });

  it("downgrades EVERY segment to insufficient_coverage below the threshold — even statistically strong ones", () => {
    const s = assessSegmentSignal(strongTotals, scopedTotals, {
      spend_coverage_pct: 1.3,
      below_threshold: true,
      note: "Demographic rows carry $856.52 of spend…",
    });
    expect(s.state).toBe("insufficient_coverage");
    expect(s.low).toBe(true); // existing warn-styling call sites stay conservative
    expect(s.reasons.join(" ")).toContain("1.3%");
  });

  it("does not gate when coverage is measured and above threshold", () => {
    const s = assessSegmentSignal(strongTotals, scopedTotals, {
      spend_coverage_pct: 97.2,
      below_threshold: false,
      note: null,
    });
    expect(s.state).toBe("ok");
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
    expect(demographicEmptyReasonFor([demoRow(ACCOUNT_GRAIN_CELL_ID)], "C8A")).toContain("account-level");
    expect(demographicEmptyReasonFor([demoRow("C1A")], "C8A")).toContain("no rows that join to this creative");
    expect(demographicEmptyReasonFor([demoRow("C8A")], "C8A")).toBeNull();
  });

  it("placements reason only when nothing is imported", () => {
    expect(placementsEmptyReasonFor([])).toContain("No device × placement export");
    expect(placementsEmptyReasonFor([{}])).toBeNull();
  });

  it("funnel reason distinguishes no-mapping-at-all from no-rows-for-this-cell", () => {
    expect(funnelEmptyReasonFor(undefined, "C8A")).toContain("creative-to-ad mapping");
    expect(funnelEmptyReasonFor([], "C8A")).toContain("creative-to-ad mapping");
    const perfRow = { cell_id: "C1A" } as CellPerformanceRow;
    expect(funnelEmptyReasonFor([perfRow], "C8A")).toContain("don't appear in the imported performance exports");
    expect(funnelEmptyReasonFor([perfRow], "C1A")).toBeNull();
  });
});
