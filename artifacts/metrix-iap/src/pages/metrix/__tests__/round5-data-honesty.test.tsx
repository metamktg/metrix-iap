// ─── Audit round 5 · data honesty across the analysis surfaces ───────────
// 204 route shots reconciled against the code (2026-09-05) found surfaces
// that summed the wrong rows or named the wrong cause for data the account
// has. This renders the fixture's no-cell manual account with a synthetic
// campaign summary and variable rows built so that every wrong figure is
// distinguishable from the right one, and asserts each surface reads the
// right one:
//
//   · Creative DNA's tiles are ACCOUNT totals from the campaign summary
//     (the variable rows sum an ad once per token and carry no impressions).
//   · Analysis Overview's "By result type" donut is the split of the
//     account's spend by event, from the ad rows, and says so; the IAP
//     Library module counts ads with performance when there is no cell
//     library, and the Audience module carries the demographic export's
//     share of spend.
//   · Budget names the missing cell library, not a metric selection.
//   · Ad Performance and Placements carry the export's share of spend.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_OLD = "run-old-0000-0000-0000-000000000002";
const ACCOUNT_ID = "manual_9JGXU_AQJjxJ";

const seed = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
);
const account = (seed.ad_accounts as Record<string, any>[]).find((a) => a.id === ACCOUNT_ID)!;
// The fixture's own current run, so its dated concept rollup (which Ad
// Performance's date range reads) stays in scope.
const RUN_NEW: string = account.iap.analysis.latest_analysis_run_id;
{
  const variable = (id: string, run: string, spend: number, results: number) => ({
    variable_id: id, variable_family: "hook", "Result type": "Website purchases",
    "Amount spent (USD)": spend, Results: results, Impressions: null, Reach: null, "Clicks (all)": null, "Link clicks": 200,
    CPA_result: results > 0 ? spend / results : null, CTR_link_pct: 2, Result_per_link_click_pct: 5, unique_ads: 2,
    manual_analysis_run_id: run, date_start: "2026-08-01", date_end: "2026-08-31",
  });
  const ad = (name: string, spend: number, results: number, metaAdId: string) => ({
    ad_name: name, book: null, cell: null, concept: null, variation: null, test_id: null,
    meta_ad_id: metaAdId, meta_ad_ids: [metaAdId], creative_asset_url: null, asset_filename: null, asset_servable: false,
    performance: { spend, results, impressions: 40_000, link_clicks: 800, result_type: "Website purchases" },
    creative: null,
  });
  account.ads = [ad("hook 1", 3000, 30, "111"), ad("hook 2", 1000, 10, "222"), ad("hook 3", 321, 3, "333")];
  // The account spent $4,321 on purchases and $1,234 on leads. The current
  // run's variable rows sum to $8,642 (two tokens on the same ads) and the
  // older run's to $8,642 again.
  account.iap.campaign_summary = {
    bottom_line_totals: {
      "Website purchases": { spend: 4321, results: 43, impressions: 210_000, reach: 150_000, clicks_all: 5_000, link_clicks: 4_000 },
      "Leads (form)": { spend: 1234, results: 12, impressions: 60_000, reach: 40_000, clicks_all: 1_500, link_clicks: 1_200 },
    },
    total_spend_usd: 5555,
    total_impressions: 270_000,
    total_link_clicks: 5_200,
    overall_link_ctr_pct: 1.93,
    data_caveat: "",
    // The date range context reads the account's window off the summary.
    window_start: "2026-08-01",
    window_end: "2026-08-31",
  };
  const analysis = account.iap.analysis;
  analysis.performance_by_cell = [];
  analysis.top_checkout_cells = [];
  analysis.v3_variable_performance = [
    variable("HK_Curiosity", RUN_NEW, 5000, 30), variable("HK_Proof", RUN_NEW, 3642, 13),
    variable("HK_Curiosity", RUN_OLD, 5000, 30), variable("HK_Proof", RUN_OLD, 3642, 13),
  ];
  analysis.top_checkout_variables = analysis.v3_variable_performance.filter((r: { manual_analysis_run_id: string }) => r.manual_analysis_run_id === RUN_NEW);
  analysis.reconciliation = null;
  // Ad Performance reads its window off the dated concept rollup; the
  // fixture account has none, so one row stands in for the current run.
  analysis.concept_rollup = [{
    book: "BOOK0", concept: "C1", result_type: "Website purchases", intent_class: "conversion", lift_basis: "cpa", impressions: 270_000,
    date_start: "2026-08-01", date_end: "2026-08-31", manual_analysis_run_id: RUN_NEW,
    spend: 5555, link_clicks: 5_200, results: 55, cpa: 101, cvr_link_pct: 1.06, confidence: "medium", mapped_in_library: false,
  }];
  // Nineteen demographic rows spending $1,111 of the $5,555: 20%.
  analysis.demographic_registration_signal = Array.from({ length: 19 }, (_, i) => ({
    cell_id: "ACCOUNT", "Ad name": "All ads", Age: i % 2 ? "25-34" : "35-44", Gender: i % 3 ? "female" : "male", "Result type": "Website purchases",
    "Amount spent (USD)": i === 0 ? 1111 - 18 * 10 : 10, Reach: 500, Impressions: 600, Results: 2, "Clicks (all)": 10, "Link clicks": 8, CPA_result: null, CTR_link_pct: 1.3, Result_per_link_click_pct: 0,
  }));
  analysis.v3_placement_signal = [
    { Placement: "feed", Platform: "facebook", "Result type": "Website purchases", "Amount spent (USD)": 2000, Impressions: 100_000, "Link clicks": 2_000, Results: 20, CPA: 100 },
    { Placement: "reels", Platform: "instagram", "Result type": "Website purchases", "Amount spent (USD)": 777.5, Impressions: 50_000, "Link clicks": 900, Results: 9, CPA: 86.4 },
  ];
  analysis.c4e_placement_signal = [];
}

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useSyncCreativeLinks: () => ({ mutateAsync: vi.fn(), isPending: false }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
    getAuthMeQueryKey: () => ["auth", "me"],
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AnalysisDnaView } from "../analysis/AnalysisDnaView";
import { AnalysisOverview } from "../analysis/AnalysisOverview";
import { BudgetView } from "../analysis/BudgetView";
import { AdPerformanceView } from "../analysis/AdPerformanceView";
import { PlacementsView } from "../analysis/PlacementsView";

function renderView(View: () => React.JSX.Element, route: string) {
  window.history.replaceState({}, "", route);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <View />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem("metrix_active_account_v1", JSON.stringify({ type: "ad_account", adAccountId: ACCOUNT_ID }));
});

describe("Creative DNA · the tiles are account totals", () => {
  it("reads the campaign summary's spend under the landed scope, never the variable rows' sum, and carries impressions", () => {
    renderView(AnalysisDnaView, "/app/analysis/dna");
    const tiles = screen.getByTestId("dna-tile-row");
    const text = tiles.textContent ?? "";
    // The page lands on the "All conversions" blend (purchases + leads are
    // both terminal): the account spent $5,555 under it. The variable rows
    // sum to $8,642 and carry no impressions; neither figure may appear.
    expect(text).toContain("$5,555");
    expect(text).not.toContain("8,642");
    expect(text).not.toContain("4,321");
    expect(text).toContain("270,000");
    expect(screen.getByText(/Account totals · this result scope · ad rows, not variable rows/)).toBeTruthy();
    // The loci still read the variable rows: that is what they are for.
    expect(screen.getByText("Gene loci")).toBeTruthy();
  });
});

describe("Analysis Overview · donut source and module counts", () => {
  it("splits the account's spend by every result event from the ad rows and says so", () => {
    renderView(AnalysisOverview, "/app/analysis/overview");
    expect(screen.getByTestId("donut-source").textContent).toBe("spend share · every result event · ad rows");
    const donut = screen.getByLabelText(/Donut chart/);
    // Both events, under the platform's event labels, with their spend.
    expect(donut.getAttribute("aria-label")).toContain("Purchases $4,321");
    expect(donut.getAttribute("aria-label")).toContain("Leads (form) $1,234");
  });

  it("counts ads with performance when the run wrote no cell library, and the Audience module carries the export's share of spend", () => {
    const { container } = renderView(AnalysisOverview, "/app/analysis/overview");
    expect(container.textContent).toContain("3 ads with performance · 2 variable rows");
    expect(container.textContent).not.toContain("cell rows");
    expect(container.textContent).toContain("19 demographic rows · 20% of spend");
  });
});

describe("Budget · the cause of an empty concept list", () => {
  it("names the missing cell library and the ads that carry the spend", () => {
    renderView(BudgetView, "/app/analysis/budget");
    expect(screen.getByText("No creative cell library")).toBeTruthy();
    expect(screen.getByText(/its 3 ads with spend are on the IAP Library/)).toBeTruthy();
    expect(screen.queryByText(/No cell rows match the current metric selection/)).toBeNull();
    expect(screen.getByRole("button", { name: /Open IAP Library/ })).toBeTruthy();
  });
});

describe("Ad Performance and Placements · the export's share of spend", () => {
  it("Ad Performance's Audience module reads the demographic share and counts ads, not cell rows", () => {
    const { container } = renderView(AdPerformanceView, "/app/analysis/performance");
    expect(container.textContent).toContain("19 demographic rows · 20% of spend");
    expect(container.textContent).toContain("3 ads with performance · 2 variable rows");
    expect(container.textContent).not.toContain("cell rows");
  });

  it("the Placement spend tile says what share of the account's spend the placement rows cover", () => {
    renderView(PlacementsView, "/app/analysis/placements");
    // $2,777.50 of $5,555 is 50%.
    expect(screen.getByText("placement rows · 50% of spend")).toBeTruthy();
  });
});

describe("the funnel absence note on Ad Performance names the export, not a business model", () => {
  it("stages the purchases from the rows' Result type", () => {
    renderView(AdPerformanceView, "/app/analysis/performance");
    const funnel = screen.getByTestId("buyer-intent-funnel");
    expect(within(funnel).getByText("Purchases")).toBeTruthy();
    expect(within(funnel).queryByText("Add to cart")).toBeNull();
    expect(screen.getByText(/No intermediate event between link clicks and purchases/)).toBeTruthy();
    expect(screen.queryByText(/ecommerce/i)).toBeNull();
  });
});
