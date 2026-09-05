// ─── Account totals and coverage shares ────────────────────────────────
// Audit round 5: the Creative DNA tiles summed variable rows (an ad once
// per token), the Overview donut read cell rows an engine-analysed account
// has none of, and the demographic surfaces said "this result scope" where
// the difference from the account was coverage. Everything here reads the
// campaign summary's per-event totals and says where a share came from.

import { describe, it, expect } from "vitest";
import { breakdownSpendShare, countCells, resultTypeSpendSplit, scopedAccountTotals, spendShareLabel } from "../account-totals";
import type { AnalysisData, CampaignSummary } from "@/lib/data/seedTypes";

const event = (spend: number, results: number, impressions: number, link_clicks: number, reach = 0, clicks_all = 0) =>
  ({ spend, results, impressions, link_clicks, reach, clicks_all });

const summary: CampaignSummary = {
  bottom_line_totals: {
    "Website purchases": event(3000, 30, 100_000, 2_000, 60_000, 2_400),
    "Leads (form)": event(1000, 50, 40_000, 1_000, 30_000, 1_100),
    "Mobile app installs": event(500, 25, 20_000, 400, 15_000, 450),
  },
  total_spend_usd: 4500,
  total_impressions: 160_000,
  total_link_clicks: 3_400,
  overall_link_ctr_pct: 2.125,
  data_caveat: "",
};

describe("scopedAccountTotals", () => {
  it("sums every event when no scope is given", () => {
    const t = scopedAccountTotals(summary, null)!;
    expect(t.spend).toBe(4500);
    expect(t.impressions).toBe(160_000);
    expect(t.linkClicks).toBe(3_400);
    expect(t.reach).toBe(105_000);
    expect(t.clicksAll).toBe(3_950);
    expect(t.linkCtrPct).toBeCloseTo(2.125, 3);
    expect(t.isMultiEvent).toBe(true);
    expect(t.resultEvents.map((e) => e.key)).toEqual(["Website purchases", "Leads (form)", "Mobile app installs"]);
  });

  it("restricts to the scope's raw result types", () => {
    const t = scopedAccountTotals(summary, ["Leads (form)"])!;
    expect(t.spend).toBe(1000);
    expect(t.impressions).toBe(40_000);
    expect(t.isMultiEvent).toBe(false);
    expect(t.resultEvents).toHaveLength(1);
    expect(t.resultEvents[0]!.results).toBe(50);
  });

  it("a blended scope sums its terminal events only", () => {
    const t = scopedAccountTotals(summary, ["Website purchases", "Leads (form)"])!;
    expect(t.spend).toBe(4000);
    expect(t.isMultiEvent).toBe(true);
  });

  it("is null without a summary or when no event survives the scope", () => {
    expect(scopedAccountTotals(null, null)).toBeNull();
    expect(scopedAccountTotals(summary, ["ThruPlays"])).toBeNull();
  });

  it("reads a null CTR when there are no impressions, never a division by zero", () => {
    const t = scopedAccountTotals({ ...summary, bottom_line_totals: { unknown: event(10, 0, 0, 0) } }, null)!;
    expect(t.linkCtrPct).toBeNull();
  });
});

describe("resultTypeSpendSplit", () => {
  it("lists every event with spend, largest first, under its readable label", () => {
    const split = resultTypeSpendSplit(summary.bottom_line_totals);
    expect(split.map((s) => s.value)).toEqual([3000, 1000, 500]);
    // Through the platform's event labels: "Website purchases" reads "Purchases".
    expect(split.map((s) => s.name)).toEqual(["Purchases", "Leads (form)", "Mobile app installs"]);
  });

  it("drops an event without spend and reads empty for no totals", () => {
    expect(resultTypeSpendSplit({ a: event(0, 0, 0, 0), b: event(5, 1, 1, 1) })).toEqual([{ name: "b", value: 5 }]);
    expect(resultTypeSpendSplit(null)).toEqual([]);
    expect(resultTypeSpendSplit(undefined)).toEqual([]);
  });
});

const demoRow = (spend: number) => ({ "Amount spent (USD)": spend }) as AnalysisData["demographic_registration_signal"][number];
const placementRow = (spend: number) => ({ "Amount spent (USD)": spend }) as AnalysisData["v3_placement_signal"][number];

function analysisWith(over: Partial<Pick<AnalysisData, "reconciliation" | "demographic_registration_signal" | "v3_placement_signal" | "c4e_placement_signal">>) {
  return {
    reconciliation: null,
    demographic_registration_signal: [],
    v3_placement_signal: [],
    c4e_placement_signal: [],
    ...over,
  } as Pick<AnalysisData, "reconciliation" | "demographic_registration_signal" | "v3_placement_signal" | "c4e_placement_signal">;
}

describe("breakdownSpendShare", () => {
  it("prefers the run's reconciliation summary for the class", () => {
    const a = analysisWith({
      demographic_registration_signal: [demoRow(100)],
      reconciliation: {
        ledger: [],
        summary: {
          truth_source: "ad_summary",
          truth_identity_kind: "ad_id",
          breakdowns: [
            { report_class: "demographic", by_metric: [{ metric: "amount_spent", truth_value: 1000, observed_value: 630, coverage_pct: 63, residual: -370, evidence_state: "reconciled" }], ads_total: 10, ads_reconciled: 10, ads_partial: 0, ads_overcounted: 0, ads_unreconciled: 0, ads_incompatible: 0, ads_missing_from_breakdown: 0 },
          ],
          notes: [],
        },
      } as unknown as AnalysisData["reconciliation"],
    });
    expect(breakdownSpendShare(a, summary, "demographic")).toEqual({ pct: 63, basis: "reconciliation" });
    // The placement class has no reconciled row: the rows would decide, and there are none.
    expect(breakdownSpendShare(a, summary, "placement")).toBeNull();
  });

  it("falls back to the rows' spend against the summary total", () => {
    const a = analysisWith({ demographic_registration_signal: [demoRow(1000), demoRow(800)], v3_placement_signal: [placementRow(4500)] });
    expect(breakdownSpendShare(a, summary, "demographic")).toEqual({ pct: 40, basis: "rows" });
    expect(breakdownSpendShare(a, summary, "placement")).toEqual({ pct: 100, basis: "rows" });
  });

  it("says nothing when the rows exceed the account total beyond rounding (the duplicate-ingestion signature), never 100%", () => {
    const a = analysisWith({ demographic_registration_signal: [demoRow(6000)] });
    expect(breakdownSpendShare(a, summary, "demographic")).toBeNull();
    // Within rounding of the total is still a share.
    expect(breakdownSpendShare(analysisWith({ demographic_registration_signal: [demoRow(4520)] }), summary, "demographic")).toEqual({ pct: 100, basis: "rows" });
  });

  it("is null without a summary total, without rows, or without analysis", () => {
    const a = analysisWith({ demographic_registration_signal: [demoRow(10)] });
    expect(breakdownSpendShare(a, null, "demographic")).toBeNull();
    expect(breakdownSpendShare(a, { total_spend_usd: 0 }, "demographic")).toBeNull();
    expect(breakdownSpendShare(analysisWith({}), summary, "demographic")).toBeNull();
    expect(breakdownSpendShare(null, summary, "demographic")).toBeNull();
  });

  it("reads as a rounded label", () => {
    expect(spendShareLabel({ pct: 62.6, basis: "rows" })).toBe("63% of spend");
    expect(spendShareLabel(null)).toBeNull();
  });
});

describe("countCells", () => {
  it("counts distinct cells, not cell × event rows", () => {
    expect(countCells([{ cell_id: "C1A" }, { cell_id: "C1A" }, { cell_id: "C2B" }])).toBe(2);
    expect(countCells([])).toBe(0);
    expect(countCells(null)).toBe(0);
  });
});
