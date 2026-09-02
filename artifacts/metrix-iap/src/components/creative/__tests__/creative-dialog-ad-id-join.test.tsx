// Acceptance 10: a creative whose ads carry NO cell code reaches its
// demographic, placement and funnel evidence through mapped Ad IDs. The
// seed here is synthetic — an account whose latest run wrote the evidence
// layer — and the dialog is rendered exactly as the call sites render it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import type { AdBreakdownRow } from "@/lib/data/seedTypes";

const row = (over: Partial<AdBreakdownRow>): AdBreakdownRow => ({
  breakdown: "demographic",
  attribution: "direct_segment",
  ad_identity_kind: "ad_id",
  ad_identity: "111",
  meta_ad_id: "111",
  ad_name: "WC #3 - Copy 2",
  segment: { gender: "female", age: "25-34" },
  segment_key: "a",
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
  metrics: { amount_spent: 30 },
  evidence_state: "observed_partial",
  coverage_pct: 60,
  ...over,
});

const seed = {
  ad_accounts: [
    {
      id: "acct",
      name: "Tester",
      status: "configured",
      platform: "meta",
      // The ad has NO cell code — the join is through the MST cell's mapped name → meta_ad_ids.
      ads: [{ ad_name: "WC #3 - Copy 2", cell: null, meta_ad_id: "111", meta_ad_ids: ["111", "112"], performance: { spend: 100, results: 5, impressions: 10000, link_clicks: 200, result_type: "Purchases" } }],
      mst: { local_book2_library: [{ cell_id: "C8A", mapped_ad_names: ["WC #3 - Copy 2"] }] },
      iap: {
        analysis: {
          performance_by_cell: [],
          v3_variable_performance: [],
          demographic_registration_signal: [{ cell_id: "ACCOUNT", "Ad name": "All ads (manual demographic upload)", Age: "25-34", Gender: "female", "Amount spent (USD)": 1, Reach: 1, Impressions: 1, Results: 0, "Clicks (all)": 0, "Link clicks": 0, CPA_result: null, CTR_link_pct: 0, Result_per_link_click_pct: 0 }],
          v3_placement_signal: [],
          c4e_placement_signal: [],
          top_checkout_cells: [],
          top_checkout_variables: [],
          latest_analysis_run_id: "run-1",
          ad_breakdowns: [
            row({}),
            row({ ad_identity: "112", meta_ad_id: "112", segment: { gender: "male", age: "35-44" }, segment_key: "b", spend: 20, results: 1, evidence_state: "observed_reconciled", coverage_pct: 100 }),
            row({ breakdown: "placement", segment: { platform: "instagram", placement: "instagram_reels", device: "iphone" }, segment_key: "p", spend: 25 }),
          ],
          reconciliation: {
            summary: null,
            ledger: [
              { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "111", ad_name: "WC #3 - Copy 2", meta_ad_id: "111", report_class: "demographic", metric: "amount_spent", grain: "", truth_source: "ad_summary", truth_value: 50, observed_value: 30, coverage_pct: 60, residual: 20, direct_share: 1, modelled_share: 0, evidence_state: "observed_partial", compatibility_failures: [] },
              { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "111", ad_name: "WC #3 - Copy 2", meta_ad_id: "111", report_class: "demographic", metric: "purchases", grain: "", truth_source: "ad_summary", truth_value: 4, observed_value: 2, coverage_pct: 50, residual: 2, direct_share: 1, modelled_share: 0, evidence_state: "observed_partial", compatibility_failures: [] },
              { scope: "ad", ad_identity_kind: "ad_id", ad_identity: "112", ad_name: "WC #3 - Copy 2", meta_ad_id: "112", report_class: "demographic", metric: "amount_spent", grain: "", truth_source: "ad_summary", truth_value: 20, observed_value: 20, coverage_pct: 100, residual: 0, direct_share: 1, modelled_share: 0, evidence_state: "observed_reconciled", compatibility_failures: [] },
            ],
          },
          variable_segment_performance: [],
        },
      },
      creative_assets: [
        { id: "a1", ad_identity_kind: "ad_id", ad_identity: "111", meta_ad_id: "111", ad_name: "WC #3 - Copy 2", asset_type: "headline", raw_value: "50% off your first box", normalized_value: "50% off your first box", content_hash: "h", provenance: "configured", source_column: "Ad creative headline" },
      ],
      variable_evidence: [
        { variable_family: "hook", variable_id: "HK_Question", source_kind: "deconstruction", source_ref: "d1", asset_key: null, ad_identity_kind: "ad_id", ad_identity: "111", meta_ad_id: "111", ad_name: "WC #3 - Copy 2", relationship: "ad_context", confidence: 0.9 },
      ],
    },
  ],
};

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/contexts/AccountContext", () => ({
  useScopedAdAccountId: () => "acct",
  useAccount: () => ({ selectedAccountType: "ad_account", activeAdAccountId: "acct" }),
}));

import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { CreativeExpandDialog } from "../CreativeExpandDialog";

function open() {
  return render(
    <TooltipProvider>
      <CreativeExpandDialog open onOpenChange={() => {}} data={{ conceptCode: "C8A", title: "WC #3 - Copy 2", tags: [] }} />
    </TooltipProvider>,
  );
}
function clickTab(label: string) {
  const tab = screen.getAllByText(label).find((el) => el.closest("button"));
  fireEvent.click(tab!.closest("button")!);
}

beforeEach(() => cleanup());

describe("creative dialog joins evidence through mapped Ad IDs", () => {
  it("Demographics shows the ad-grain heat grid with its evidence state, not the cell-only empty state", () => {
    open();
    clickTab("Demographics");
    const grid = screen.getByTestId("demographic-heat-grid");
    expect(within(grid).getAllByTestId("evidence-chip")[0].getAttribute("data-state")).toBe("observed_partial");
    expect(screen.queryByText(/No demographic data for this cell/)).toBeNull();
  });

  it("Placements shows the platform drill", () => {
    open();
    clickTab("Placements");
    expect(screen.getByTestId("placement-drill")).toBeTruthy();
    expect(screen.queryByText(/account-level — not scoped/)).toBeNull();
  });

  it("Funnel is built from the Ad Summary truth of the mapped Ad IDs and says so", () => {
    open();
    clickTab("Funnel");
    expect(screen.getByTestId("funnel-evidence-chip").getAttribute("data-state")).toBe("observed_reconciled");
    expect(screen.getByTestId("funnel-evidence").textContent ?? "").toContain("2 mapped Ad IDs");
    expect(screen.queryByText(/No performance data/)).toBeNull();
  });

  it("Evidence lists the configured bundle and the deconstructed variable with their relationship", () => {
    open();
    clickTab("Evidence");
    const tab = screen.getByTestId("evidence-tab");
    expect(tab.textContent ?? "").toContain("2 Ad IDs under 1 name");
    expect(within(tab).getByTestId("asset-evidence").getAttribute("data-state")).toBe("ad_context");
    expect(within(tab).getByTestId("variable-evidence").getAttribute("data-state")).toBe("ad_context");
  });
});
