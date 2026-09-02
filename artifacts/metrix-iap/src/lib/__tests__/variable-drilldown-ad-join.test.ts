// A variable whose header counts 30 unique ads can never say "no creative
// carries this variable": manual runs write no performance_by_cell, so the
// carriers are the ADS the evidence layer links by Ad ID and name, and the
// segment / placement sections read their ad-grain rows. The relationship
// stays contextual — an ad-name token is evidence on the ad, not on an asset.
import { describe, expect, it } from "vitest";
import { computeVariableDrilldown } from "@/lib/variable-drilldown";
import type { AdBreakdownRow, AdRecord, AnalysisData, VariableEvidenceRow, VariablePerformanceRow, VariableSegmentRow } from "@/lib/data/seedTypes";

const CODE = "C3A SKOV2";

const analysis = {
  performance_by_cell: [],
  demographic_registration_signal: [],
  v3_variable_performance: [],
  v3_placement_signal: [],
  c4e_placement_signal: [],
  latest_analysis_run_id: "run-1",
} as unknown as AnalysisData;

const v3: VariablePerformanceRow[] = [
  {
    variable_family: "raw_token",
    variable_id: CODE,
    "Result type": "Purchases",
    "Amount spent (USD)": 1350,
    Reach: 0,
    Impressions: 0,
    "Clicks (all)": 0,
    "Link clicks": 300,
    Results: 7,
    unique_ads: 2,
    CPA_result: 192.81,
    CTR_link_pct: null,
    Result_per_link_click_pct: 2.3,
  } as unknown as VariablePerformanceRow,
];

const ads: AdRecord[] = [
  { ad_name: `${CODE}_HOOK1`, cell: null, meta_ad_id: "111", meta_ad_ids: ["111"], performance: { spend: 800, results: 5, impressions: 60000, link_clicks: 200, result_type: "Purchases" } },
  { ad_name: `${CODE}_HOOK2`, cell: null, meta_ad_id: "112", meta_ad_ids: ["112", "113"], performance: { spend: 550, results: 2, impressions: 40000, link_clicks: 100, result_type: "Purchases" } },
  { ad_name: "C1A OTHER_HOOK1", cell: null, meta_ad_id: "999", meta_ad_ids: ["999"], performance: { spend: 300, results: 1, impressions: 10000, link_clicks: 30, result_type: "Purchases" } },
];

const evidence: VariableEvidenceRow[] = [
  { variable_family: "raw_token", variable_id: CODE, source_kind: "ad_name_token", source_ref: `${CODE}_HOOK1`, asset_key: null, ad_identity_kind: "ad_id", ad_identity: "111", meta_ad_id: "111", ad_name: `${CODE}_HOOK1`, relationship: "ad_context", confidence: null },
  { variable_family: "raw_token", variable_id: CODE, source_kind: "ad_name_token", source_ref: `${CODE}_HOOK2`, asset_key: null, ad_identity_kind: "ad_id", ad_identity: "112", meta_ad_id: "112", ad_name: `${CODE}_HOOK2`, relationship: "ad_context", confidence: null },
];

const br = (over: Partial<AdBreakdownRow>): AdBreakdownRow => ({
  breakdown: "demographic",
  attribution: "direct_segment",
  ad_identity_kind: "ad_id",
  ad_identity: "111",
  meta_ad_id: "111",
  ad_name: `${CODE}_HOOK1`,
  segment: { gender: "female", age: "55-64" },
  segment_key: "f55",
  result_type: "Purchases",
  date_start: "2026-08-01",
  date_end: "2026-08-30",
  spend: 500,
  impressions: 30000,
  reach: null,
  reach_basis: null,
  clicks_all: 150,
  link_clicks: 120,
  results: 4,
  metrics: {},
  evidence_state: "observed_partial",
  coverage_pct: 60,
  ...over,
});

const breakdowns: AdBreakdownRow[] = [
  br({}),
  br({ ad_identity: "112", meta_ad_id: "112", ad_name: `${CODE}_HOOK2`, segment: { gender: "female", age: "55-64" }, spend: 300, results: 2, evidence_state: "observed_reconciled" }),
  br({ ad_identity: "112", meta_ad_id: "112", ad_name: `${CODE}_HOOK2`, segment: { gender: "male", age: "25-34" }, segment_key: "m25", spend: 40, results: 0, impressions: 400 }),
  br({ ad_identity: "999", meta_ad_id: "999", ad_name: "C1A OTHER_HOOK1", segment: { gender: "male", age: "25-34" }, segment_key: "m25", spend: 999 }),
  br({ breakdown: "placement", segment: { platform: "instagram", placement: "instagram_reels", device: "iphone" }, segment_key: "p1", spend: 420 }),
  br({ breakdown: "placement", ad_identity: "999", meta_ad_id: "999", segment: { platform: "facebook", placement: "feed", device: "android_smartphone" }, segment_key: "p2", spend: 5 }),
];

describe("variable drill-down joins carriers through the evidence layer", () => {
  it("names the carrier ads by Ad ID, ranked by results, and keeps the relationship contextual", () => {
    const d = computeVariableDrilldown(CODE, { analysis, mst: null, variableRows: v3, ads, variableEvidence: evidence, breakdownRows: breakdowns });
    expect(d.carrierCellIds).toEqual([]);
    expect(d.carrierAds.map((a) => a.adName)).toEqual([`${CODE}_HOOK1`, `${CODE}_HOOK2`]);
    expect(d.carrierIdentity.adIds.sort()).toEqual(["111", "112", "113"]);
    expect(d.attribution).toBe("ad_context");
    expect(d.carrierAds[0].cpa).toBe(160);
  });

  it("reads segments from the carrier ads' own ad-grain rows, never the other ads'", () => {
    const d = computeVariableDrilldown(CODE, { analysis, mst: null, variableRows: v3, ads, variableEvidence: evidence, breakdownRows: breakdowns });
    expect(d.segments.available).toBe(true);
    expect(d.segments.source).toBe("ad_breakdowns");
    const women = d.segments.rows.find((r) => r.segment.gender === "female")!;
    expect(women.totals.spend).toBe(800); // 500 + 300, not 999 from the unrelated ad
    expect(women.totals.results).toBe(6);
    expect(women.band).toBe("medium");
    expect(women.evidenceState).toBe("observed_partial"); // the worse of the two rows
    const men = d.segments.rows.find((r) => r.segment.gender === "male")!;
    expect(men.totals.spend).toBe(40);
    expect(men.band).toBe("insufficient");
    expect(d.evidenceState).toBe("observed_partial");
  });

  it("shows the carrier ads' placement rows and not another ad's", () => {
    const d = computeVariableDrilldown(CODE, { analysis, mst: null, variableRows: v3, ads, variableEvidence: evidence, breakdownRows: breakdowns });
    expect(d.placementRows.map((r) => r.segment.platform)).toEqual(["instagram"]);
  });

  it("prefers the run's variable × segment rows when it wrote them, using contextual totals for contextual evidence", () => {
    const segmentRows: VariableSegmentRow[] = [
      {
        variable_family: "raw_token",
        variable_id: CODE,
        breakdown: "demographic",
        segment: { gender: "female", age: "55-64" },
        segment_key: "f55",
        result_type: "Purchases",
        contributing_ad_ids: ["111", "112"],
        contributing_asset_keys: [],
        direct_totals: {},
        contextual_totals: { amount_spent: 1200, results: 110, impressions: 90000, link_clicks: 400 },
        observed_coverage_pct: 60,
        modelled_share: 0,
        result_volume: 110,
        cost_per_result: 10.9,
        raw_rate: 0.12,
        adjusted_rate: 0.11,
        interaction_index: 1.2,
        contributing_ads: 2,
        evidence_state: "observed_partial",
        confidence: "high",
      },
    ];
    const d = computeVariableDrilldown(CODE, { analysis, mst: null, variableRows: v3, ads, variableEvidence: evidence, breakdownRows: breakdowns, segmentRows });
    expect(d.segments.source).toBe("variable_rows");
    expect(d.segments.rows).toHaveLength(1);
    expect(d.segments.rows[0].totals.spend).toBe(1200);
    expect(d.segments.rows[0].band).toBe("high");
  });

  it("falls back to the server's raw-token rule for a run older than the evidence layer, and says so when nothing joins", () => {
    // The tester's shape: an account-level demographic export exists, but the run predates ad-grain evidence.
    const withAccountRows = { ...analysis, demographic_registration_signal: [{ cell_id: "ACCOUNT", Age: "55-64", Gender: "female" }] } as unknown as AnalysisData;
    const old = computeVariableDrilldown(CODE, { analysis: withAccountRows, mst: null, variableRows: v3, ads, variableEvidence: [], breakdownRows: [] });
    expect(old.carrierAds.map((a) => a.adName)).toEqual([`${CODE}_HOOK1`, `${CODE}_HOOK2`]);
    expect(old.segments.available).toBe(false);
    expect(old.segments.unavailableReason).toMatch(/Re-run analysis/);

    const none = computeVariableDrilldown(CODE, { analysis, mst: null, variableRows: v3, ads: [], variableEvidence: [], breakdownRows: [] });
    expect(none.carrierAds).toEqual([]);
    expect(none.segments.unavailableReason).toContain("count 2 ads");
    expect(none.evidenceState).toBeNull();
  });
});
