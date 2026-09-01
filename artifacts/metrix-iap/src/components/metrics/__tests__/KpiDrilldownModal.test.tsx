// ─── KpiDrilldownModal — component tests (both scopes) ───────────────
// Manager: per-account rows with window labels + coverage disclosure,
// n/a handling, overlap toggle empty state. Account: dimension switching,
// sorting, chart/table toggle, tracking-basis restriction, empty state.
//
// Recharts-in-jsdom convention: mock ResponsiveContainer with a fixed
// size, otherwise it measures 0×0 and renders no shapes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { cloneElement, type ReactElement } from "react";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 500, height: 300 }),
  };
});

import { KpiDrilldownModal } from "../KpiDrilldownModal";
import { buildMetricCatalog, metricSourceFromCampaignSummary } from "@/lib/data/metricsCatalog";
import type { AdAccount, AnalysisData, CampaignSummary, CellPerformanceRow } from "@/lib/data/seedTypes";

// ─── Fixtures ─────────────────────────────────────────────────────────

function summaryFor(events: Record<string, { spend: number; impressions: number; link_clicks: number; results: number }>, window?: [string, string]): CampaignSummary {
  const blt: Record<string, any> = {};
  let spend = 0, imp = 0, lc = 0;
  for (const [k, e] of Object.entries(events)) {
    blt[k] = { ...e, reach: 0, clicks_all: e.link_clicks };
    spend += e.spend; imp += e.impressions; lc += e.link_clicks;
  }
  return {
    bottom_line_totals: blt,
    total_spend_usd: spend, total_impressions: imp, total_link_clicks: lc,
    overall_link_ctr_pct: imp > 0 ? (lc / imp) * 100 : null, data_caveat: "",
    window_start: window?.[0], window_end: window?.[1],
  };
}

function acct(id: string, name: string, summary: CampaignSummary): AdAccount {
  return { id, name, status: "configured", platform: "meta", iap: { campaign_summary: summary } as any } as AdAccount;
}

const ALPHA = acct("alpha", "Alpha", summaryFor({ registrations: { spend: 100, impressions: 10000, link_clicks: 500, results: 50 } }, ["2026-01-01", "2026-03-31"]));
const BETA = acct("beta", "Beta", summaryFor({ purchases: { spend: 300, impressions: 5000, link_clicks: 50, results: 10 } }, ["2026-02-01", "2026-05-31"]));
// Disjoint window — for the "no overlap" empty state.
const GAMMA = acct("gamma", "Gamma", summaryFor({ purchases: { spend: 10, impressions: 100, link_clicks: 5, results: 1 } }, ["2027-01-01", "2027-01-31"]));

const cell = (o: Partial<CellPerformanceRow>): CellPerformanceRow => ({
  cell_id: "C1H1", "Ad name": "ad", "Result type": "registrations",
  "Amount spent (USD)": 0, Reach: 0, Impressions: 0, Results: 0,
  "Clicks (all)": 0, "Link clicks": 0, CPA_result: null,
  CTR_link_pct: 0, Result_per_link_click_pct: 0, book2_concept_name: "Concept One",
  ...o,
} as CellPerformanceRow);

const ANALYSIS: AnalysisData = {
  performance_by_cell: [
    cell({ cell_id: "C1H1", "Amount spent (USD)": 100, Impressions: 1000, "Link clicks": 40, Results: 4 }),
    cell({ cell_id: "C2H1", book2_concept_name: "Concept Two", "Amount spent (USD)": 200, Impressions: 4000, "Link clicks": 20, Results: 2 }),
  ],
  v3_variable_performance: [],
  demographic_registration_signal: [],
  v3_placement_signal: [],
  c4e_placement_signal: [],
  top_checkout_cells: [],
  top_checkout_variables: [],
  conversion_tracking_signal: {
    tracking_basis: "conversion", window_start: null, window_end: null, note: "",
    devices: [{ device: "mobile", date_start: "", date_end: "", link_clicks: 90, adds_to_cart: 9, checkouts_initiated: 5, purchases: 2 } as any],
    platforms: [], placements: [],
  },
};

const MANAGER_CATALOG = buildMetricCatalog(metricSourceFromCampaignSummary(summaryFor({
  registrations: { spend: 100, impressions: 10000, link_clicks: 500, results: 50 },
  purchases: { spend: 300, impressions: 5000, link_clicks: 50, results: 10 },
})));
const ACCOUNT_CATALOG = buildMetricCatalog(metricSourceFromCampaignSummary(summaryFor({
  registrations: { spend: 300, impressions: 5000, link_clicks: 60, results: 6 },
})));

function renderModal(props: Partial<React.ComponentProps<typeof KpiDrilldownModal>>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <KpiDrilldownModal
        open
        onClose={() => {}}
        scope="manager"
        metricId="spend"
        catalog={MANAGER_CATALOG}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
});

// ─── Manager scope ────────────────────────────────────────────────────

describe("KpiDrilldownModal — manager scope", () => {
  it("renders per-account rows with each account's own window label + coverage disclosure", () => {
    renderModal({ accounts: [ALPHA, BETA] });
    const modal = screen.getByTestId("kpi-drilldown-modal");
    expect(within(modal).getByTestId("window-coverage-disclosure")).toBeTruthy();
    const labels = within(modal).getAllByTestId("account-window-label").map((el) => el.textContent);
    expect(labels).toContain("2026-01-01 → 2026-03-31");
    expect(labels).toContain("2026-02-01 → 2026-05-31");
  });

  it("table view shows per-row windows and sorts", () => {
    renderModal({ accounts: [ALPHA, BETA] });
    fireEvent.click(screen.getByLabelText("Table view"));
    const table = screen.getByTestId("kpi-drilldown-table");
    const rows = within(table).getAllByRole("row").slice(1); // skip header
    // desc by spend: Beta ($300) first
    expect(rows[0].textContent).toContain("Beta");
    expect(rows[0].textContent).toContain("2026-02-01 → 2026-05-31");
    // flip to ascending
    fireEvent.click(screen.getByLabelText(/switch to ascending/i));
    const rowsAsc = within(screen.getByTestId("kpi-drilldown-table")).getAllByRole("row").slice(1);
    expect(rowsAsc[0].textContent).toContain("Alpha");
  });

  it("metric an account doesn't track shows n/a — never zero", () => {
    renderModal({ accounts: [ALPHA, BETA], metricId: "result:purchases" });
    fireEvent.click(screen.getByLabelText("Table view"));
    const table = screen.getByTestId("kpi-drilldown-table");
    const alphaRow = within(table).getAllByRole("row").find((r) => r.textContent?.includes("Alpha"))!;
    expect(within(alphaRow).getAllByRole("cell")[1].textContent).toBe("n/a");
    expect(alphaRow.textContent).not.toMatch(/\b0\b.*registrations/);
  });

  it("overlap toggle with disjoint windows shows the honest empty state", () => {
    renderModal({ accounts: [ALPHA, GAMMA] });
    fireEvent.click(screen.getByLabelText(/common overlap window/i));
    expect(screen.getByTestId("kpi-drilldown-empty").textContent).toMatch(/No common overlap window/);
  });

  it("metric switcher changes the visualized metric", () => {
    renderModal({ accounts: [ALPHA, BETA] });
    fireEvent.change(screen.getByLabelText("Metric"), { target: { value: "link_ctr" } });
    fireEvent.click(screen.getByLabelText("Table view"));
    const table = screen.getByTestId("kpi-drilldown-table");
    // Alpha CTR 5.00%, Beta 1.00% — from each account's own sums.
    expect(table.textContent).toContain("5.00%");
    expect(table.textContent).toContain("1.00%");
  });
});

// ─── Account scope ────────────────────────────────────────────────────

describe("KpiDrilldownModal — account scope", () => {
  const accountProps = {
    scope: "account" as const,
    catalog: ACCOUNT_CATALOG,
    analysis: ANALYSIS,
    windowLabel: "2026-01-01 → 2026-03-31",
  };

  it("shows the window/run indicator from the active selection", () => {
    renderModal(accountProps);
    expect(screen.getByTestId("kpi-drilldown-window").textContent).toContain("2026-01-01 → 2026-03-31");
  });

  it("dimension switching re-segments the data", () => {
    renderModal(accountProps);
    fireEvent.click(screen.getByLabelText("Table view"));
    expect(screen.getByTestId("kpi-drilldown-table").textContent).toContain("Concept One");
    fireEvent.change(screen.getByLabelText("Breakdown"), { target: { value: "cell" } });
    expect(screen.getByTestId("kpi-drilldown-table").textContent).toContain("C1H1");
  });

  it("conversion-basis dimension with a delivery metric shows the tracking-basis restriction", () => {
    renderModal(accountProps);
    fireEvent.change(screen.getByLabelText("Breakdown"), { target: { value: "conv:device" } });
    expect(screen.getByTestId("kpi-drilldown-modal").textContent).toMatch(/never mix with conversion tracking/i);
    expect(screen.queryByTestId("kpi-drilldown-table")).toBeNull();
  });

  it("conversion-basis dimension works for link clicks", () => {
    renderModal({ ...accountProps, metricId: "link_clicks" });
    fireEvent.change(screen.getByLabelText("Breakdown"), { target: { value: "conv:device" } });
    fireEvent.click(screen.getByLabelText("Table view"));
    // The row is labelled through deviceLabel now, so the table shows the
    // display name rather than Meta's raw token.
    expect(screen.getByTestId("kpi-drilldown-table").textContent).toContain("Mobile");
  });

  it("chart view renders ranked bars without NaN", () => {
    renderModal(accountProps);
    const modal = screen.getByTestId("kpi-drilldown-modal");
    expect(modal.querySelector(".recharts-wrapper")).toBeTruthy();
    expect(modal.textContent).not.toContain("NaN");
  });

  it("narrowed scope withholds account-wide dimensions — only scoped-capable breakdowns remain", () => {
    const withSignals: AnalysisData = {
      ...ANALYSIS,
      v3_placement_signal: [{ Placement: "Feed", Platform: "facebook", "Amount spent (USD)": 999, Impressions: 9000, "Link clicks": 90, Results: 9, CPA: null }],
      demographic_registration_signal: [{ cell_id: "C1H1", "Ad name": "ad", Age: "25-34", Gender: "female", "Amount spent (USD)": 500, Reach: 0, Impressions: 5000, Results: 5, "Clicks (all)": 50, "Link clicks": 50, CPA_result: null, CTR_link_pct: 0, Result_per_link_click_pct: 0 }],
    };
    renderModal({ ...accountProps, analysis: withSignals, scopeNarrowed: true, scopedCellRows: withSignals.performance_by_cell.slice(0, 1) });
    const select = screen.getByLabelText("Breakdown") as HTMLSelectElement;
    const optionIds = [...select.options].map((o) => o.value);
    // Only cell/concept can honor the narrowed selection.
    expect(optionIds.sort()).toEqual(["cell", "concept"]);
    expect(screen.getByTestId("scoped-dimensions-note")).toBeTruthy();
    // And rows come only from the scoped cell rows — out-of-scope totals never surface.
    fireEvent.change(select, { target: { value: "cell" } });
    fireEvent.click(screen.getByLabelText("Table view"));
    const table = screen.getByTestId("kpi-drilldown-table");
    expect(table.textContent).toContain("C1H1");
    expect(table.textContent).not.toContain("C2H1");
    expect(table.textContent).not.toContain("$999");
  });

  it("narrowed scope with no scopable rows shows the honest empty state, not full-flight data", () => {
    renderModal({ ...accountProps, scopeNarrowed: true, scopedCellRows: [] });
    expect(screen.getByTestId("kpi-drilldown-empty").textContent).toMatch(/scoped to the active window/i);
  });

  it("empty analysis shows the honest empty state", () => {
    renderModal({ ...accountProps, analysis: { ...ANALYSIS, performance_by_cell: [], conversion_tracking_signal: null } });
    expect(screen.getByTestId("kpi-drilldown-empty")).toBeTruthy();
  });
});
