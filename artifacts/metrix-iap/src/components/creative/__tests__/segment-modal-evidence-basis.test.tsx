// ─── The segment drill-down on an account-grain export with an evidence layer ──
// The modal used to say "attribution can't be honestly computed" for a run
// that had written per-ad demographic rows. It now names the ads and the
// variable tokens, and says what stood in.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import type { AnalysisData } from "@/lib/data/seedTypes";

const account = {
  id: "acct",
  ads: [{ ad_name: "(car detail) hook 1", cell: null, meta_ad_id: "111", meta_ad_ids: ["111"], creative: { headline: "Shine", primary_text: "Detailing that lasts.", description: null, cta_type: "SHOP_NOW", link_destination: null, image_name: null, video_name: null, source: "performance_export" } }],
  iap: { analysis: {} },
  mst: { local_book2_library: [] },
};

vi.mock("@/contexts/AccountContext", () => ({ useScopedAdAccountId: () => "acct" }));
vi.mock("@/contexts/MetrixDataContext", () => ({ useMetrixSeed: () => ({ ad_accounts: [account] }) }));
vi.mock("@workspace/api-client-react", () => ({
  getGetAnalysisSummaryQueryOptions: (accountId: string, preset: string) => ({ queryKey: ["analysis-summary", accountId, preset], queryFn: async () => ({}) }),
  useGetAnalysisSummary: () => ({ data: undefined }),
}));

import { SegmentDrilldownModal } from "../SegmentDrilldownModal";

const analysis = {
  performance_by_cell: [],
  demographic_registration_signal: [
    { cell_id: "ACCOUNT", "Ad name": "All ads (manual demographic upload)", Age: "25-34", Gender: "female", "Result type": "Website purchases", "Amount spent (USD)": 5000, Reach: 90_000, Impressions: 250_000, Results: 400, "Clicks (all)": 6000, "Link clicks": 5000, CPA_result: 12.5, CTR_link_pct: 2, Result_per_link_click_pct: 8 },
  ],
  ad_breakdowns: [
    { breakdown: "demographic", attribution: "direct_segment", ad_identity_kind: "ad_id", ad_identity: "111", meta_ad_id: "111", ad_name: "(car detail) hook 1", segment: { age: "25-34", gender: "female" }, segment_key: "25-34|female", result_type: "Website purchases", date_start: "2026-08-01", date_end: "2026-08-31", spend: 700, impressions: 10_000, reach: null, reach_basis: null, clicks_all: 120, link_clicks: 100, results: 25, metrics: {}, evidence_state: "observed_reconciled", coverage_pct: 100 },
  ],
  variable_segment_performance: [
    { variable_family: "hook", variable_id: "HK_Curiosity", breakdown: "demographic", segment: { age: "25-34", gender: "female" }, segment_key: "25-34|female", result_type: "Website purchases", contributing_ad_ids: ["111"], contributing_asset_keys: [], direct_totals: {}, contextual_totals: { amount_spent: 700, impressions: 10_000, link_clicks: 100, results: 25 }, observed_coverage_pct: 100, modelled_share: 0, result_volume: 25, cost_per_result: 28, raw_rate: null, adjusted_rate: null, interaction_index: null, contributing_ads: 1, evidence_state: "ad_context", confidence: "medium" },
  ],
} as unknown as AnalysisData;

afterEach(cleanup);

describe("SegmentDrilldownModal · evidence-layer basis", () => {
  it("names the ads and the tokens the segment saw instead of refusing attribution", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <SegmentDrilldownModal open onClose={() => {}} segment={{ age: "25-34", gender: "female" }} analysis={analysis} cellIds={null} demoCoverage={null} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("note-attribution-unavailable")).toBeNull();
    expect(screen.getByText("Top ads for this segment")).toBeTruthy();
    expect(screen.getByTestId("row-segment-concept-111").textContent).toMatch(/\(car detail\) hook 1/);
    expect(screen.getByTestId("row-segment-variable-HK_Curiosity")).toBeTruthy();
    expect(screen.getByTestId("note-attribution-basis").textContent).toMatch(/reconciled per-ad rows: 1 ad and 1 variable token/);
  });
});
