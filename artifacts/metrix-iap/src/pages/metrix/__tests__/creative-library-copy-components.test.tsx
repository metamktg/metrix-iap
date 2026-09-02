// ─── Creative Library — copy components and source fallback ───────────
// Owner decision 2026-09-02: when the scanned library is absent, the copy
// components the export already carries stand in, named as such; the page
// is blank only when neither exists. With a library present the components
// are one more tab. The nudge to add creatives shows while it is true.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

const components = {
  baseline: { spend: 600, results: 40, cost_per_result: 15 },
  families: {
    headline: [
      { family: "headline", value: "Fast delivery, every time", ads: 2, ad_names: ["A1", "A2"], spend: 400, results: 30, impressions: 20000, link_clicks: 400, cost_per_result: 13.33, ctr_link_pct: 2, spend_share: 0.667, result_share: 0.75, efficiency_index: 1.125, weight: 1, rank: 1, confidence: "medium", result_types: ["purchase"] },
      { family: "headline", value: "Free returns", ads: 1, ad_names: ["A3"], spend: 200, results: 10, impressions: 10000, link_clicks: 100, cost_per_result: 20, ctr_link_pct: 1, spend_share: 0.333, result_share: 0.25, efficiency_index: 0.75, weight: 0.22, rank: 2, confidence: "medium", result_types: ["purchase"] },
    ],
    primary_text: [],
    description: [],
    cta_type: [
      { family: "cta_type", value: "SHOP_NOW", ads: 3, ad_names: ["A1", "A2", "A3"], spend: 600, results: 40, impressions: 30000, link_clicks: 500, cost_per_result: 15, ctr_link_pct: 1.67, spend_share: 1, result_share: 1, efficiency_index: 1, weight: 1, rank: 1, confidence: "high", result_types: ["purchase"] },
    ],
  },
  coverage: { ads_total: 4, ads_with_copy: 3, spend_total: 800, spend_with_copy: 600, coverage: 0.75, by_family: { headline: 3, primary_text: 0, description: 0, cta_type: 3 }, sources: ["performance_export"] },
};

function seedWith(mutate: (acct: Record<string, unknown>) => void) {
  const seed = JSON.parse(JSON.stringify(baseSeed));
  const acct = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
  mutate(acct);
  return seed;
}

let activeSeed = baseSeed;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/pages/metrix/ConnectAccountDialogs", () => ({
  ManualImportDialog: () => null,
  ConnectMetaDialog: () => null,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import { CreativeLibraryView } from "../creative/CreativeLibraryView";

const SESSION_KEY = "metrix_active_account_v1";

function renderFor(adAccountId: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <TooltipProvider>
              <CreativeLibraryView />
            </TooltipProvider>
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
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
});

describe("Creative Library — copy components", () => {
  it("with no scanned library, the export's copy components stand in and the library tabs say why they are off", () => {
    activeSeed = seedWith((a) => {
      delete a.mst;
      a.creative_components = components;
      a.ads = [{ ad_name: "A1", asset_servable: false, creative_asset_url: null }];
      a.creative_deconstructions = [];
    });
    renderFor("bookster");
    expect(screen.queryByText("No scanned creatives")).toBeNull();
    expect(screen.getByTestId("creative-components-panel")).toBeTruthy();
    const rail = screen.getByRole("tablist", { name: "Section" });
    const components_tab = within(rail).getByRole("tab", { name: /Copy components/ });
    expect(components_tab.getAttribute("aria-selected")).toBe("true");
    const libraryTab = within(rail).getByRole("tab", { name: /Concept library/ });
    expect(libraryTab.hasAttribute("disabled")).toBe(true);
    expect(libraryTab.getAttribute("title")).toContain("performance export");
    // Ranked rows, best first, with the weight and the honest source.
    const rows = screen.getAllByTestId("creative-component-row");
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toContain("Fast delivery, every time");
    expect(rows[0]!.textContent).toContain("1.13×");
    expect(screen.getByText("Performance export")).toBeTruthy();
    expect(screen.getByText("3 of 4")).toBeTruthy();
    // The nudge is present: no visual creatives exist.
    expect(screen.getByTestId("creative-source-nudge")).toBeTruthy();
  });

  it("with a scanned library, the components are one more tab", () => {
    activeSeed = seedWith((a) => { a.creative_components = components; });
    renderFor("bookster");
    const rail = screen.getByRole("tablist", { name: "Section" });
    const tab = within(rail).getByRole("tab", { name: /Copy components/ });
    expect(tab.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByTestId("creative-components-panel")).toBeNull();
    fireEvent.click(tab);
    expect(screen.getByTestId("creative-components-panel")).toBeTruthy();
  });

  it("with neither a library nor copy, the page is honestly pending and still offers the sources", () => {
    activeSeed = seedWith((a) => {
      delete a.mst;
      a.creative_components = null;
      a.ads = [];
      a.creative_deconstructions = [];
    });
    renderFor("bookster");
    expect(screen.getByText("No scanned creatives")).toBeTruthy();
    expect(screen.getByTestId("creative-source-nudge").textContent).toContain("performance data only");
  });

  it("grades concept evidence when the rollup carries it, and says so when it does not", () => {
    activeSeed = seedWith((a) => {
      delete a.mst;
      a.creative_components = components;
      a.ads = [];
      const analysis = (a.iap as { analysis: Record<string, unknown> }).analysis;
      analysis.concept_rollup = [
        { book: "BOOK2", concept: "C2", date_start: "2026-01-01", date_end: "2026-01-31", manual_analysis_run_id: null, spend: 500, link_clicks: 50, results: 30, cpa: 16.7, cvr_link_pct: 60, confidence: null, mapped_in_library: true, confidence_level: "medium", creative_coverage_pct: 82.5, evidence_grade: "full", confidence_score: 0.7 },
        { book: "BOOK2", concept: "C3", date_start: "2026-01-01", date_end: "2026-01-31", manual_analysis_run_id: null, spend: 100, link_clicks: 10, results: 2, cpa: 50, cvr_link_pct: 20, confidence: null, mapped_in_library: false, confidence_level: "low" },
      ];
    });
    renderFor("bookster");
    const rows = screen.getAllByTestId("concept-evidence-row");
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toContain("BOOK2 · C2");
    expect(rows[0]!.textContent).toContain("Full");
    expect(rows[0]!.textContent).toContain("0.70");
  });
});
