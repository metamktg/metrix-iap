// ─── rollupDnaFamilies · scale-aware (awareness never scored on cost) ──
// The family roll-up picked the "best read" by lowest CPA for every row
// set, so under an awareness scope a ThruPlay token wore a cost verdict.
// A communication scale leaves CPA null and ranks by results; the scale is
// the caller's, else read off the rows (stored intent_class, else the raw
// result type).

import { describe, it, expect } from "vitest";
import { rollupDnaFamilies, variableRowScale } from "../creative-dna";
import type { VariablePerformanceRow } from "@/lib/data/seedTypes";

function row(over: Partial<VariablePerformanceRow>): VariablePerformanceRow {
  return {
    variable_id: "HK_A",
    variable_family: "hook",
    "Result type": "Website purchases",
    "Amount spent (USD)": 100,
    Reach: 0, Impressions: 0, "Clicks (all)": 0, "Link clicks": 10,
    unique_ads: 1,
    Results: 5,
    CPA_result: 20,
    CTR_link_pct: 1,
    Result_per_link_click_pct: 50,
    ...over,
  };
}

describe("variableRowScale", () => {
  it("prefers the stored intent_class over the raw string", () => {
    expect(variableRowScale({ "Result type": "ThruPlays", intent_class: "conversion" })).toBe("cost_per_result");
    expect(variableRowScale({ "Result type": "Website purchases", intent_class: "awareness" })).toBe("communication");
  });
  it("classifies the raw result type when no class is stored", () => {
    expect(variableRowScale({ "Result type": "ThruPlays", intent_class: null })).toBe("communication");
    expect(variableRowScale({ "Result type": "Leads (form)" })).toBe("cost_per_result");
    expect(variableRowScale({ "Result type": "unknown" })).toBeNull();
  });
});

describe("rollupDnaFamilies · cost scale", () => {
  it("keeps CPA and picks the cheapest variable with results as the best read", () => {
    const [fam] = rollupDnaFamilies([
      row({ variable_id: "HK_A", "Amount spent (USD)": 100, Results: 5 }),
      row({ variable_id: "HK_B", "Amount spent (USD)": 100, Results: 10 }),
    ]);
    expect(fam!.scale).toBe("cost_per_result");
    expect(fam!.cpa).toBeCloseTo(200 / 15);
    expect(fam!.top!.variableId).toBe("HK_B");
    expect(fam!.top!.basis).toBe("lowest_cost_per_result");
  });
});

describe("rollupDnaFamilies · communication scale", () => {
  it("leaves every CPA null and ranks the best read by results when the caller passes the scope's scale", () => {
    const [fam] = rollupDnaFamilies(
      [
        row({ variable_id: "HK_A", "Result type": "ThruPlays", "Amount spent (USD)": 10, Results: 500 }),
        row({ variable_id: "HK_B", "Result type": "ThruPlays", "Amount spent (USD)": 100, Results: 900 }),
      ],
      null,
      "communication",
    );
    expect(fam!.scale).toBe("communication");
    expect(fam!.cpa).toBeNull();
    expect(fam!.top!.cpa).toBeNull();
    expect(fam!.top!.variableId).toBe("HK_B");
    expect(fam!.top!.basis).toBe("most_results");
  });

  it("reads the scale off the rows when the caller passes none", () => {
    const [fam] = rollupDnaFamilies([row({ "Result type": "ThruPlays", intent_class: "awareness" })]);
    expect(fam!.scale).toBe("communication");
    expect(fam!.cpa).toBeNull();
  });

  it("gives a family whose rows sit on mixed scales no cost verdict", () => {
    const [fam] = rollupDnaFamilies([
      row({ variable_id: "HK_A", "Result type": "ThruPlays" }),
      row({ variable_id: "HK_B", "Result type": "Website purchases" }),
    ]);
    expect(fam!.scale).toBeNull();
    expect(fam!.cpa).toBeNull();
  });

  it("falls back to most spend when no variable has results", () => {
    const [fam] = rollupDnaFamilies([row({ variable_id: "HK_A", Results: 0, "Amount spent (USD)": 5 }), row({ variable_id: "HK_B", Results: 0, "Amount spent (USD)": 50 })]);
    expect(fam!.top!.variableId).toBe("HK_B");
    expect(fam!.top!.basis).toBe("most_spend");
  });
});
