// ─── Ad-grain performance rows ─────────────────────────────────────────
// A run the engine analysed has no creative cell library, so the Library's
// tiles read 0 cells · $0 · 0 results for a run with 586 ads behind it.
// The per-ad totals stand in, one cell-shaped row per ad, and what they do
// not carry is named rather than zero-filled.

import { describe, it, expect } from "vitest";
import { adGrainPerformanceRows, NO_CONCEPT_CODE } from "../ad-grain-rows";
import type { AdRecord } from "@/lib/data/seedTypes";

const ad = (name: string, perf: Partial<NonNullable<AdRecord["performance"]>> | null, extra: Partial<AdRecord> = {}): AdRecord => ({
  ad_name: name,
  performance: perf === null ? null : { spend: 0, results: 0, impressions: 0, link_clicks: 0, result_type: "Website purchases", ...perf },
  ...extra,
});

describe("adGrainPerformanceRows", () => {
  it("one row per ad with totals, in the cell row's shape, keyed by the ad name", () => {
    const { rows } = adGrainPerformanceRows([
      ad("(car detail) hook 1", { spend: 1000, results: 40, impressions: 50_000, link_clicks: 500 }),
      ad("Silent ad", null),
    ]);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.cell_id).toBe("(car detail) hook 1");
    expect(r["Result type"]).toBe("Website purchases");
    expect(r["Amount spent (USD)"]).toBe(1000);
    expect(r.Results).toBe(40);
    expect(r.CPA_result).toBe(25);
    expect(r.CTR_link_pct).toBe(1);
    expect(r.Result_per_link_click_pct).toBe(8);
    expect(r.book2_concept_name).toBe(NO_CONCEPT_CODE);
    expect(r.concept_variable).toBeUndefined();
  });

  it("names the fields the per-ad totals never carried instead of reading 0 for them", () => {
    const { rows, unmeasured } = adGrainPerformanceRows([ad("A", { spend: 10, results: 1, impressions: 100, link_clicks: 10 })]);
    expect(unmeasured.sort()).toEqual(["clicks_all", "reach"]);
    expect(rows[0]!.Reach).toBe(0);
    expect(rows[0]!["Clicks (all)"]).toBe(0);
  });

  it("carries reach and clicks (all) once the totals carry them, and reports nothing unmeasured", () => {
    const { rows, unmeasured } = adGrainPerformanceRows([ad("A", { spend: 10, results: 1, impressions: 100, link_clicks: 10, reach: 80, clicks_all: 14 })]);
    expect(unmeasured).toEqual([]);
    expect(rows[0]!.Reach).toBe(80);
    expect(rows[0]!["Clicks (all)"]).toBe(14);
  });

  it("no cost per result without spend or without results", () => {
    const { rows } = adGrainPerformanceRows([
      ad("No spend", { spend: 0, results: 5, impressions: 10, link_clicks: 2 }),
      ad("No results", { spend: 50, results: 0, impressions: 10, link_clicks: 2 }),
    ]);
    expect(rows.map((r) => r.CPA_result)).toEqual([null, null]);
  });

  it("a blank result type reads as unknown; an ad's concept code becomes its concept and its hint", () => {
    const { rows } = adGrainPerformanceRows([
      ad("A", { spend: 1, results: 1, impressions: 1, link_clicks: 1, result_type: "" }),
      ad("B", { spend: 1, results: 1, impressions: 1, link_clicks: 1 }, { concept: "C2" }),
    ]);
    expect(rows[0]!["Result type"]).toBe("unknown");
    expect(rows[1]!.book2_concept_name).toBe("C2");
    expect(rows[1]!.concept_variable).toBe("C2");
  });

  it("skips cell-override placeholders and a repeated ad name", () => {
    const { rows } = adGrainPerformanceRows([
      ad("__cell_override_C2B", { spend: 1, results: 1, impressions: 1, link_clicks: 1 }),
      ad("Twice", { spend: 1, results: 1, impressions: 1, link_clicks: 1 }),
      ad("Twice", { spend: 9, results: 9, impressions: 9, link_clicks: 9 }),
    ]);
    expect(rows.map((r) => r.cell_id)).toEqual(["Twice"]);
    expect(rows[0]!["Amount spent (USD)"]).toBe(1);
  });

  it("empty in, empty out", () => {
    expect(adGrainPerformanceRows(undefined)).toEqual({ rows: [], unmeasured: [] });
  });
});
