// Creative evidence joins — Ad ID first, cell second (spec §14) — and the
// grid / drill / funnel / ledger helpers the surfaces render from.
import { describe, expect, it } from "vitest";
import type { AdBreakdownRow, AdRecord, LedgerRow } from "@/lib/data/seedTypes";
import {
  adIdentityForCreative,
  breakdownRowsFor,
  demographicGridFor,
  evidenceSummaryFor,
  funnelRowFromAds,
  ledgerMetricsFor,
  measureValue,
  placementTreeFor,
  reconciliationRowsFor,
  variablesForCreative,
  worstEvidenceState,
} from "../creative-evidence";

const ads: AdRecord[] = [
  { ad_name: "C8A_HK_Question", cell: "C8A", meta_ad_id: "111", meta_ad_ids: ["111", "112"], performance: { spend: 60, results: 3, impressions: 6000, link_clicks: 120, result_type: "Purchases" } },
  { ad_name: "C9A_HK_Story", cell: null, meta_ad_id: "221", meta_ad_ids: ["221"], performance: { spend: 40, results: 1, impressions: 4000, link_clicks: 60, result_type: "Purchases" } },
  { ad_name: "__cell_override_C8A", cell: "C8A", meta_ad_id: null },
];

const row = (over: Partial<AdBreakdownRow>): AdBreakdownRow => ({
  breakdown: "demographic",
  attribution: "direct_segment",
  ad_identity_kind: "ad_id",
  ad_identity: "111",
  meta_ad_id: "111",
  ad_name: "C8A_HK_Question",
  segment: { gender: "female", age: "25-34" },
  segment_key: "age=25-34gender=female",
  result_type: "Purchases",
  date_start: "2026-08-01",
  date_end: "2026-08-30",
  spend: 30,
  impressions: 3000,
  reach: null,
  reach_basis: null,
  clicks_all: 70,
  link_clicks: 60,
  results: 2,
  metrics: { amount_spent: 30, impressions: 3000, link_clicks: 60, results: 2 },
  evidence_state: "observed_partial",
  coverage_pct: 60,
  ...over,
});

const rows: AdBreakdownRow[] = [
  row({}),
  row({ ad_identity: "112", meta_ad_id: "112", segment: { gender: "male", age: "25-34" }, segment_key: "age=25-34gender=male", spend: 20, results: 1, impressions: 2000, link_clicks: 40, metrics: { amount_spent: 20 }, evidence_state: "observed_reconciled", coverage_pct: 100 }),
  row({ ad_identity: "221", meta_ad_id: "221", ad_name: "C9A_HK_Story", spend: 10, metrics: { amount_spent: 10 } }),
  row({ breakdown: "placement", segment: { platform: "instagram", placement: "instagram_reels", device: "iphone" }, segment_key: "device=iphoneplacement=instagram_reelsplatform=instagram", spend: 25 }),
  row({ breakdown: "placement", ad_identity: "112", meta_ad_id: "112", segment: { platform: "instagram", placement: "feed", device: "android_smartphone" }, segment_key: "x", spend: 15 }),
];

describe("adIdentityForCreative", () => {
  it("resolves every instance under the cell's ad name, ignoring override placeholders", () => {
    const id = adIdentityForCreative(ads, "C8A");
    expect(id.via).toBe("cell");
    expect(id.adIds).toEqual(["111", "112"]);
    expect(id.adNames).toEqual(["C8A_HK_Question"]);
  });
  it("falls back to the MST cell's mapped names when no ad carries the cell code", () => {
    const id = adIdentityForCreative(ads, "C9A", ["C9A_HK_Story"]);
    expect(id.via).toBe("mapped_names");
    expect(id.adIds).toEqual(["221"]);
  });
  it("is empty, not a guess, when nothing matches", () => {
    expect(adIdentityForCreative(ads, "C1A").via).toBe("none");
    expect(adIdentityForCreative(ads, "C1A").adIds).toEqual([]);
  });
});

describe("breakdownRowsFor / grid / drill", () => {
  const id = adIdentityForCreative(ads, "C8A");
  it("selects rows by Ad ID (acceptance 10: no cell assignment needed)", () => {
    const demo = breakdownRowsFor(rows, "demographic", id);
    expect(demo.map((r) => r.ad_identity)).toEqual(["111", "112"]);
    expect(breakdownRowsFor(rows, "placement", id)).toHaveLength(2);
    expect(breakdownRowsFor(rows, "demographic", { adIds: [], adNames: [] })).toEqual([]);
  });
  it("sums the grid from the rows, derives rates, and shows the unattributed spend once", () => {
    const grid = demographicGridFor(breakdownRowsFor(rows, "demographic", id));
    expect(grid.ages).toEqual(["25-34"]);
    expect(grid.genders).toEqual(["female", "male"]);
    const f = grid.segments.find((s) => s.gender === "female")!;
    expect(f.spend).toBe(30);
    expect(measureValue(f, "cost_per_result")).toBe(15);
    expect(f.evidence_state).toBe("observed_partial");
    expect(f.coverage_pct).toBe(60);
    // truth = 30/0.6 + 20/1.0 = 70; observed 50 → 20 unattributed
    expect(grid.unattributed_spend).toBe(20);
    const summary = evidenceSummaryFor(breakdownRowsFor(rows, "demographic", id));
    expect(summary.state).toBe("observed_partial");
    expect(summary.coverage_pct).toBe(71);
    expect(summary.ads).toBe(2);
  });
  it("builds the platform → placement → device tree with sums at each level", () => {
    const tree = placementTreeFor(breakdownRowsFor(rows, "placement", id));
    expect(tree).toHaveLength(1);
    expect(tree[0]!.label).toBe("instagram");
    expect(tree[0]!.spend).toBe(40);
    expect(tree[0]!.children.map((c) => c.label)).toEqual(["instagram_reels", "feed"]);
    expect(tree[0]!.children[0]!.children[0]!.label).toBe("iphone");
  });
  it("worst state wins", () => {
    expect(worstEvidenceState(["observed_reconciled", "observed_partial"])).toBe("observed_partial");
    expect(worstEvidenceState(["direct_asset", "unreconciled"])).toBe("unreconciled");
    expect(worstEvidenceState([])).toBeNull();
  });
});

describe("funnelRowFromAds", () => {
  const id = adIdentityForCreative(ads, "C8A");
  const ledger: LedgerRow[] = [
    { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "111", ad_name: "C8A_HK_Question", meta_ad_id: "111", report_class: "demographic", metric: "amount_spent", grain: "", truth_source: "ad_summary", truth_value: 50, observed_value: 30, coverage_pct: 60, residual: 20, direct_share: 1, modelled_share: 0, evidence_state: "observed_partial", compatibility_failures: [] },
    { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "111", ad_name: "C8A_HK_Question", meta_ad_id: "111", report_class: "demographic", metric: "purchases", grain: "", truth_source: "ad_summary", truth_value: 5, observed_value: 2, coverage_pct: 40, residual: 3, direct_share: 1, modelled_share: 0, evidence_state: "observed_partial", compatibility_failures: [] },
    { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "112", ad_name: "C8A_HK_Question", meta_ad_id: "112", report_class: "demographic", metric: "amount_spent", grain: "", truth_source: "ad_summary", truth_value: 20, observed_value: 20, coverage_pct: 100, residual: 0, direct_share: 1, modelled_share: 0, evidence_state: "observed_reconciled", compatibility_failures: [] },
  ];
  it("uses the Ad Summary truth for the mapped Ad IDs when the ledger has it", () => {
    const f = funnelRowFromAds(id, ledger, "C8A")!;
    expect(f.source).toBe("ad_summary");
    expect(f.row["Amount spent (USD)"]).toBe(70);
    expect(f.row.purchases).toBe(5);
    expect(f.row.cell_id).toBe("C8A");
    expect(f.evidence_state).toBe("observed_reconciled");
  });
  it("falls back to the ads registry's own totals as ad context", () => {
    const f = funnelRowFromAds(id, [], "C8A")!;
    expect(f.source).toBe("ad_totals");
    expect(f.row["Amount spent (USD)"]).toBe(60);
    expect(f.row.CPA_result).toBe(20);
    expect(f.evidence_state).toBe("ad_context");
    expect(funnelRowFromAds(adIdentityForCreative(ads, "C1A"), ledger, "C1A")).toBeNull();
  });
  it("lists ledger metrics spend-first and builds the per-ad table sorted by residual", () => {
    expect(ledgerMetricsFor(ledger.map((r) => ({ ...r, scope: "account" as const })), "demographic")).toEqual(["amount_spent", "purchases"]);
    const t = reconciliationRowsFor(ledger, "demographic", "amount_spent");
    expect(t.account).toBeNull();
    expect(t.ads.map((r) => r.ad_identity)).toEqual(["111", "112"]);
    expect(t.ads[0]!.residual).toBe(20);
  });
});

describe("variablesForCreative", () => {
  it("dedupes variables across sources, direct before contextual, with their segment rows", () => {
    const vars = variablesForCreative(
      [
        { variable_family: "hook", variable_id: "HK_Question", source_kind: "deconstruction", source_ref: "d1", asset_key: null, ad_identity_kind: "ad_id", ad_identity: "111", meta_ad_id: "111", ad_name: "x", relationship: "ad_context", confidence: 0.9 },
        { variable_family: "hook", variable_id: "HK_Question", source_kind: "ad_name_token", source_ref: "x", asset_key: null, ad_identity_kind: "ad_id", ad_identity: "112", meta_ad_id: "112", ad_name: "x", relationship: "ad_context", confidence: null },
        { variable_family: "framework", variable_id: "FW_PAS", source_kind: "deconstruction", source_ref: "d1", asset_key: "k", ad_identity_kind: "ad_id", ad_identity: "111", meta_ad_id: "111", ad_name: "x", relationship: "direct_asset", confidence: 0.8 },
      ],
      [{ variable_family: "hook", variable_id: "HK_Question", breakdown: "all", segment: {}, segment_key: "", result_type: "Purchases", contributing_ad_ids: ["111"], contributing_asset_keys: [], direct_totals: {}, contextual_totals: { amount_spent: 60 }, observed_coverage_pct: 60, modelled_share: 0, result_volume: 3, cost_per_result: 20, raw_rate: null, adjusted_rate: null, interaction_index: null, contributing_ads: 1, evidence_state: "ad_context", confidence: "validation_required" }],
    );
    expect(vars.map((v) => v.variable_id)).toEqual(["FW_PAS", "HK_Question"]);
    expect(vars[1]!.sources).toEqual(["deconstruction", "ad_name_token"]);
    expect(vars[1]!.segments).toHaveLength(1);
  });
});
