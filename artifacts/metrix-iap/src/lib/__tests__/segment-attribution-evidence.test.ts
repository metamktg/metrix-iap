// ─── Segment attribution through the reconciliation layer ────────────────
// An engine-analysed account writes its demographic signal at ACCOUNT
// grain by construction, so the Audience drill-down said concept and
// variable attribution "can't be honestly computed" for a run that had
// written 20,618 per-ad demographic rows and 12,605 per-variable segment
// rows (Pure Path, 2026-09-05). Those rows are the honest attribution:
// which ads the segment saw, ranked by results, and which variable tokens
// those ads carried.

import { describe, it, expect } from "vitest";
import { computeSegmentAttribution, computeSegmentDrilldown } from "../segment-analytics";
import type { AdBreakdownRow, AdRecord, AnalysisData, DemographicRow, VariableSegmentRow } from "@/lib/data/seedTypes";

const SEG = { age: "25-34", gender: "female" };

const accountRow = (over: Partial<DemographicRow> = {}): DemographicRow => ({
  cell_id: "ACCOUNT",
  "Ad name": "All ads (manual demographic upload)",
  Age: "25-34",
  Gender: "female",
  "Result type": "Website purchases",
  "Amount spent (USD)": 1000,
  Reach: 5000,
  Impressions: 6000,
  Results: 40,
  "Clicks (all)": 100,
  "Link clicks": 80,
  CPA_result: 25,
  CTR_link_pct: 1.3,
  Result_per_link_click_pct: 50,
  ...over,
});

const adRow = (id: string, name: string, spend: number, results: number, over: Partial<AdBreakdownRow> = {}): AdBreakdownRow => ({
  breakdown: "demographic",
  attribution: "direct_segment",
  ad_identity_kind: "ad_id",
  ad_identity: id,
  meta_ad_id: id,
  ad_name: name,
  segment: { age: "25-34", gender: "female" },
  segment_key: "25-34|female",
  result_type: "Website purchases",
  date_start: "2026-08-01",
  date_end: "2026-08-31",
  spend,
  impressions: 10_000,
  reach: null,
  reach_basis: null,
  clicks_all: 120,
  link_clicks: 100,
  results,
  metrics: {},
  evidence_state: "observed_reconciled",
  coverage_pct: 100,
  ...over,
} as AdBreakdownRow);

const varRow = (code: string, adIds: string[], spend: number, results: number, over: Partial<VariableSegmentRow> = {}): VariableSegmentRow => ({
  variable_family: "hook",
  variable_id: code,
  breakdown: "demographic",
  segment: { age: "25-34", gender: "female" },
  segment_key: "25-34|female",
  result_type: "Website purchases",
  contributing_ad_ids: adIds,
  contributing_asset_keys: [],
  direct_totals: {},
  contextual_totals: { amount_spent: spend, impressions: 5000, link_clicks: 50, results },
  observed_coverage_pct: 100,
  modelled_share: 0,
  result_volume: results,
  cost_per_result: results > 0 ? spend / results : null,
  raw_rate: null,
  adjusted_rate: null,
  interaction_index: null,
  contributing_ads: adIds.length,
  evidence_state: "ad_context",
  confidence: "medium",
  ...over,
});

const ads: AdRecord[] = [
  { ad_name: "(car detail) hook 1", cell: null, meta_ad_id: "111", meta_ad_ids: ["111"], creative: { headline: "Shine", primary_text: "Detailing that lasts.", description: null, cta_type: "SHOP_NOW", link_destination: null, image_name: null, video_name: null, source: "performance_export" } },
  { ad_name: "(car detail) hook 2", cell: "C2B", meta_ad_id: "222", meta_ad_ids: ["222"] },
  { ad_name: "Older run ad", cell: null, meta_ad_id: "333", meta_ad_ids: ["333"] },
];

function analysisWith(over: Partial<AnalysisData> = {}): AnalysisData {
  return {
    performance_by_cell: [],
    demographic_registration_signal: [accountRow()],
    ad_breakdowns: [
      adRow("111", "(car detail) hook 1", 700, 25),
      adRow("222", "(car detail) hook 2", 300, 15),
      adRow("333", "Older run ad", 50, 2, { result_type: "Link clicks" }),
      adRow("444", "Other segment", 900, 90, { segment: { age: "45-54", gender: "male" }, segment_key: "45-54|male" }),
    ],
    variable_segment_performance: [
      varRow("HK_Curiosity", ["111", "222"], 600, 30),
      varRow("HK_Proof", ["222"], 300, 15),
      varRow("HK_Other", ["444"], 900, 90, { segment: { age: "45-54", gender: "male" }, segment_key: "45-54|male" }),
    ],
    ...over,
  } as unknown as AnalysisData;
}

describe("computeSegmentAttribution · evidence layer", () => {
  it("attributes an account-grain segment through its per-ad rows, ranked by results, named from the registry", () => {
    const a = computeSegmentAttribution(analysisWith(), null, SEG, null, ads);
    expect(a.available).toBe(true);
    expect(a.basis).toBe("evidence_layer");
    expect(a.cells.map((c) => c.conceptName)).toEqual(["(car detail) hook 1", "(car detail) hook 2"]);
    expect(a.cells[0]!.cellId).toBe("111");
    expect(a.cells[0]!.totals.spend).toBe(700);
    expect(a.cells[0]!.totals.results).toBe(25);
    expect(a.cells[0]!.derived.cpa).toBe(28);
    expect(a.cells[0]!.copy).toEqual({ primary: "Detailing that lasts.", secondary: "Shine", cta: "SHOP_NOW" });
    expect(a.cells[1]!.copy).toBeNull();
    expect(a.basisNote).toMatch(/2 ads and 2 variable tokens/);
  });

  it("a row under a result type the segment's own rows do not carry is left out", () => {
    const a = computeSegmentAttribution(analysisWith(), null, SEG, null, ads);
    expect(a.cells.some((c) => c.conceptName === "Older run ad")).toBe(false);
  });

  it("ranks the segment's variable tokens from the per-variable rows and chips each ad with the tokens it carried", () => {
    const a = computeSegmentAttribution(analysisWith(), null, SEG, null, ads);
    expect(a.variables.map((v) => v.code)).toEqual(["HK_Curiosity", "HK_Proof"]);
    expect(a.variables[0]!.totals.spend).toBe(600);
    expect(a.variables[0]!.totals.results).toBe(30);
    expect(a.variables[0]!.derived.cpa).toBe(20);
    expect(a.variables[0]!.cellIds.sort()).toEqual(["111", "222"]);
    expect(a.cells[0]!.variableCodes).toEqual(["HK_Curiosity"]);
    expect(a.cells[1]!.variableCodes).toEqual(["HK_Curiosity", "HK_Proof"]);
  });

  it("a cell scope narrows to the ads the registry files under those cells", () => {
    const a = computeSegmentAttribution(analysisWith(), null, SEG, ["C2B"], ads);
    expect(a.available).toBe(true);
    expect(a.cells.map((c) => c.conceptName)).toEqual(["(car detail) hook 2"]);
    expect(a.variables.map((v) => v.code).sort()).toEqual(["HK_Curiosity", "HK_Proof"]);
  });

  it("a cell scope without a registry cannot be resolved and stays honestly unavailable", () => {
    const a = computeSegmentAttribution(analysisWith(), null, SEG, ["C2B"], null);
    expect(a.available).toBe(false);
  });

  it("without evidence rows for the segment the old account-level reason stands", () => {
    const a = computeSegmentAttribution(analysisWith({ ad_breakdowns: [], variable_segment_performance: [] }), null, SEG, null, ads);
    expect(a.available).toBe(false);
    expect(a.basis).toBeNull();
    expect(a.unavailableReason).toMatch(/account-level only/);
  });

  it("cell-grain rows still win over the evidence layer", () => {
    const cellGrain = accountRow({ cell_id: "C2B", "Ad name": "(car detail) hook 2", book2_concept_name: "Detail" });
    const a = computeSegmentAttribution(analysisWith({ demographic_registration_signal: [accountRow(), cellGrain] }), null, SEG, null, ads);
    expect(a.basis).toBe("cell_grain");
    expect(a.cells.map((c) => c.cellId)).toEqual(["C2B"]);
  });

  it("the drill-down carries the basis through", () => {
    const d = computeSegmentDrilldown(analysisWith(), null, SEG, null, undefined, ads);
    expect(d.attribution.basis).toBe("evidence_layer");
    expect(d.totals.results).toBe(40);
  });

  it("an ad the registry does not know is named from the row itself", () => {
    const a = computeSegmentAttribution(analysisWith({ ad_breakdowns: [adRow("999", "Unregistered", 10, 1)] }), null, SEG, null, ads);
    expect(a.cells[0]!.conceptName).toBe("Unregistered");
    expect(a.cells[0]!.cellId).toBe("999");
  });
});
