// ─── IAP Library on a run with no creative cell library ─────────────────
// Pure Path (2026-09-05): the engine had written 21,034 ad rows, 382
// variables and 20,618 per-ad demographic rows, and the Library read
// 0 cells · $0 · 0 purchases, counted 764 variables (two generations)
// beside DNA cards scoped to one, opened the Breakdown on a metric no
// segment can carry, showed no ad copy, and warned that purchases were
// not populated by age/gender above rows that carried 47,983 of them.
// This renders the fixture's no-cell account with a small synthetic
// registry and asserts every one of those reads correctly.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_NEW = "run-new-0000-0000-0000-000000000001";
const RUN_OLD = "run-old-0000-0000-0000-000000000002";
const ACCOUNT_ID = "manual_9JGXU_AQJjxJ";

function buildSeed(opts: { demographicResults: number }) {
  const seed = JSON.parse(
    fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
  );
  const account = (seed.ad_accounts as Record<string, unknown>[]).find((a) => a.id === ACCOUNT_ID) as Record<string, any>;
  const variable = (id: string, run: string, spend: number, results: number) => ({
    variable_id: id, variable_family: "hook", "Result type": "Website purchases",
    "Amount spent (USD)": spend, Results: results, Impressions: 10_000, Reach: 8_000, "Clicks (all)": 300, "Link clicks": 200,
    CPA_result: results > 0 ? spend / results : null, CTR_link_pct: 2, Result_per_link_click_pct: 5, unique_ads: 2,
    manual_analysis_run_id: run, date_start: "2026-08-01", date_end: "2026-08-31",
  });
  const ad = (name: string, spend: number, results: number, primaryText: string | null, metaAdId: string) => ({
    ad_name: name, book: null, cell: null, concept: null, variation: null, test_id: null,
    meta_ad_id: metaAdId, meta_ad_ids: [metaAdId], creative_asset_url: null, asset_filename: null, asset_servable: false,
    performance: { spend, results, impressions: 40_000, link_clicks: 800, result_type: "Website purchases" },
    creative: primaryText ? { headline: `${name} headline`, primary_text: primaryText, description: null, cta_type: "SHOP_NOW", link_destination: null, image_name: null, video_name: null, source: "performance_export" } : null,
  });
  account.ads = [
    ad("(car detail) hook 1", 1200, 40, "Detailing that lasts. Book in two taps.", "111"),
    ad("(car detail) hook 2", 800, 10, "The shine your car deserves.", "222"),
    ad("Silent ad", 300, 0, null, "333"),
  ];
  account.result_events = [{ raw: "Website purchases", key: "purchase", label: "Purchases", intent_class: "conversion", scale: "cost_per_result", spend: 2300, results: 50, impressions: 120_000, link_clicks: 2_400, ads: 3, events: [], spend_share_pct: 100 }];
  const analysis = account.iap.analysis;
  analysis.performance_by_cell = [];
  analysis.top_checkout_cells = [];
  analysis.latest_analysis_run_id = RUN_NEW;
  analysis.v3_variable_performance = [
    variable("HK_Curiosity", RUN_NEW, 900, 30), variable("HK_Proof", RUN_NEW, 600, 10), variable("HK_Fear", RUN_NEW, 0, 3),
    variable("HK_Curiosity", RUN_OLD, 1800, 60), variable("HK_Proof", RUN_OLD, 1200, 20),
  ];
  analysis.top_checkout_variables = analysis.v3_variable_performance.filter((r: { Results: number }) => r.Results > 0);
  analysis.top_performers_event = { result_type: "Website purchases", event_key: "purchase", label: "Purchases", intent_class: "conversion", stage: "terminal", basis: "dominant_terminal_conversion", spend: 2300, results: 50 };
  analysis.concept_rollup = [];
  analysis.demographic_registration_signal = [
    { cell_id: "ACCOUNT", "Ad name": "All ads (manual demographic upload)", Age: "25-34", Gender: "female", "Result type": "Website purchases", "Amount spent (USD)": 1000, Reach: 5000, Impressions: 6000, Results: opts.demographicResults, "Clicks (all)": 100, "Link clicks": 80, CPA_result: null, CTR_link_pct: 1.3, Result_per_link_click_pct: 0 },
  ];
  analysis.ad_breakdowns = [
    { breakdown: "demographic", attribution: "delivery", ad_identity_kind: "ad_id", ad_identity: "111", meta_ad_id: "111", ad_name: "(car detail) hook 1", segment: { age: "25-34", gender: "female" }, segment_key: "25-34|female", result_type: "Website purchases", date_start: "2026-08-01", date_end: "2026-08-31", spend: 700, impressions: 20_000, reach: null, reach_basis: null, clicks_all: 100, link_clicks: 80, results: 25, metrics: {}, evidence_state: "observed_reconciled", coverage_pct: 100 },
  ];
  return seed;
}

let currentSeed = buildSeed({ demographicResults: 25 });

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => currentSeed,
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
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { IapLibraryView } from "../IapLibraryView";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderLibrary() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: ACCOUNT_ID }));
  window.history.replaceState({}, "", "/app/analysis/library");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <TooltipProvider>
      <QueryClientProvider client={client}>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <IapLibraryView />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </QueryClientProvider>
    </TooltipProvider>,
  );
}

const tabCount = (name: RegExp): number => {
  const tab = screen.getByRole("tab", { name });
  const m = /(\d+)\s*$/.exec(tab.textContent ?? "");
  return m ? Number(m[1]) : -1;
};

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); currentSeed = buildSeed({ demographicResults: 25 }); });

describe("IAP Library · a run with ads and no creative cells", () => {
  it("the tiles read the per-ad totals, named as ads, never 0 cells and $0", () => {
    renderLibrary();
    expect(screen.getByText("Ads with performance")).toBeTruthy();
    // 3 ads carry purchases totals ($2,300 · 50 results); the count tile says 3.
    const tile = screen.getByText("Ads with performance").closest(".flex-col")!;
    expect(tile.textContent).toMatch(/Ads with performance\s*3\s*no creative cell library/);
    expect(screen.getByText("$2,300")).toBeTruthy();
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("the Variables tab counts the current run only, and the DNA card agrees with the table", async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(tabCount(/Variable performance/)).toBe(3);
    await user.click(screen.getByRole("tab", { name: /Variable performance/ }));
    const card = screen.getByTestId("dna-family-hook");
    expect(card.textContent).toMatch(/3 variables/);
    // Every current-run row renders; the old generation does not.
    expect(screen.getAllByText("HK_Curiosity")).toHaveLength(1);
    expect(screen.getByText("$1,500")).toBeTruthy();
  });

  it("a token with results and no spend is never the family's $0.00 best read", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("tab", { name: /Variable performance/ }));
    const card = screen.getByTestId("dna-family-hook");
    expect(card.textContent).not.toMatch(/\$0\.00/);
    expect(within(card).getByText(/\$30\.00 CPA/)).toBeTruthy();
  });

  it("the Top performers tab ranks the top-variable set once and shows the ads that produced the event", async () => {
    const user = userEvent.setup();
    renderLibrary();
    // 2 ads with purchases + the 3 current-run variables with results (the old generation's 2 are not counted twice).
    expect(tabCount(/Top performers/)).toBe(2 + 3);
    await user.click(screen.getByRole("tab", { name: /Top performers/ }));
    expect(screen.getByText(/Top ads · Purchases/)).toBeTruthy();
    const grid = screen.getByTestId("top-ads-grid");
    expect(within(grid).getByText("(car detail) hook 1")).toBeTruthy();
    expect(within(grid).queryByText("Silent ad")).toBeNull();
  });

  it("the Ad copy tab reads the ads' own primary text when no cell carries a library message", async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(tabCount(/Ad copy/)).toBe(2);
    await user.click(screen.getByRole("tab", { name: /Ad copy/ }));
    expect(screen.getByText(/Detailing that lasts/)).toBeTruthy();
    expect(screen.queryByText("No ad copy in selection")).toBeNull();
    await user.click(screen.getByTestId("ad-copy-card-(car detail) hook 1"));
    // The dialog joins through the ad's own name: the demographic rows exist.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("(car detail) hook 1")).toBeTruthy();
    await user.click(within(dialog).getByRole("tab", { name: /Evidence/ }));
    expect(within(dialog).queryByText("No mapped ads")).toBeNull();
  });

  it("the Breakdown tab offers the ads as a dimension and opens on a metric a segment can carry", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("tab", { name: /Breakdown/ }));
    expect(screen.queryByTestId("breakdown-empty")).toBeNull();
    const dimension = screen.getByLabelText("Dimension") as HTMLSelectElement;
    expect([...dimension.options].map((o) => o.textContent)).toContain("Ad");
    const metric = screen.getByLabelText("Metric") as HTMLSelectElement;
    expect([...metric.options].map((o) => o.textContent)).not.toContain("Ads with performance");
  });

  it("the age × gender caveat is silent when the demographic rows carry the ranked event's results", () => {
    renderLibrary();
    expect(screen.queryByText(/were not populated by age\/gender/)).toBeNull();
  });

  it("the caveat shows when demographic rows exist and none carries the event's results", () => {
    currentSeed = buildSeed({ demographicResults: 0 });
    renderLibrary();
    expect(screen.getByText(/Purchases results were not populated by age\/gender/)).toBeTruthy();
  });
});

describe("IAP Library · the cells tab on a run with ads and no cell library", () => {
  it("says there is no cell library and where the ads are, instead of asking for another metric selection", () => {
    renderLibrary();
    expect(screen.getByTestId("note-no-cell-library").textContent).toMatch(/No creative cell library in this run/);
    expect(screen.getByTestId("note-no-cell-library").textContent).toMatch(/3 ads are listed below/);
    expect(screen.queryByText("No cells in selection")).toBeNull();
    expect(screen.getByTestId("section-ad-level-tiles")).toBeTruthy();
  });
});
