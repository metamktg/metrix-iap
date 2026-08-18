// ─── BreakdownExplorer (IAP Library → Breakdown tab) ──────────────────
// Covers the dimension × metric × chart cross-tab: selector wiring, the
// mirrored ranked table, chart-form switching (donut share gate for
// non-additive metrics, funnel ranking), tracking-basis restriction,
// narrowed-scope dimension withholding, and deep-dive chaining.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import React, { cloneElement, type ReactElement } from "react";
import { vi } from "vitest";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 500, height: 300 }),
  };
});

import { BreakdownExplorer } from "../BreakdownExplorer";
import { DeepDiveProvider } from "@/contexts/DeepDiveContext";
import { DeepDivePanel } from "@/components/deepdive/DeepDivePanel";
import { buildMetricCatalog, metricSourceFromCampaignSummary } from "@/lib/data/metricsCatalog";
import type { AnalysisData, CampaignSummary, CellPerformanceRow } from "@/lib/data/seedTypes";

afterEach(cleanup);

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
    devices: [
      { device: "mobile", date_start: "", date_end: "", link_clicks: 90, adds_to_cart: 9, checkouts_initiated: 5, purchases: 2, confidence: null } as any,
    ],
    platforms: [], placements: [],
  },
};

const SUMMARY: CampaignSummary = {
  bottom_line_totals: {
    registrations: { spend: 300, reach: 0, impressions: 5000, results: 6, clicks_all: 60, link_clicks: 60 },
  },
  total_spend_usd: 300, total_impressions: 5000, total_link_clicks: 60,
  overall_link_ctr_pct: 1.2, data_caveat: "",
};

const CATALOG = buildMetricCatalog(metricSourceFromCampaignSummary(SUMMARY));

function renderExplorer(props: Partial<React.ComponentProps<typeof BreakdownExplorer>> = {}, withDeepDive = false) {
  const el = (
    <>
      <BreakdownExplorer analysis={ANALYSIS} catalog={CATALOG} {...props} />
      {withDeepDive && <DeepDivePanel />}
    </>
  );
  return render(withDeepDive ? <DeepDiveProvider>{el}</DeepDiveProvider> : el);
}

describe("BreakdownExplorer", () => {
  it("renders the mirrored ranked table for the default concept × first-metric selection", () => {
    renderExplorer();
    const table = screen.getByTestId("breakdown-table");
    expect(within(table).getByText("Concept One")).toBeTruthy();
    expect(within(table).getByText("Concept Two")).toBeTruthy();
  });

  it("withholds the donut for ratio metrics with an honest note, keeps it for additive ones", () => {
    renderExplorer();
    // Switch to donut on an additive metric (spend is first in the catalog family;
    // select it explicitly to be robust to catalog order).
    fireEvent.change(screen.getByLabelText("Metric"), { target: { value: "spend" } });
    fireEvent.click(screen.getByLabelText("Donut (share)"));
    expect(screen.queryByTestId("breakdown-donut-blocked")).toBeNull();
    expect(screen.getByTestId("breakdown-donut-legend")).toBeTruthy();

    // Ratio metric → donut withheld, table still there.
    fireEvent.change(screen.getByLabelText("Metric"), { target: { value: "link_ctr" } });
    expect(screen.getByTestId("breakdown-donut-blocked")).toBeTruthy();
    expect(screen.queryByTestId("breakdown-donut-legend")).toBeNull();
    expect(screen.getByTestId("breakdown-table")).toBeTruthy();
  });

  it("renders the funnel-shaped ranking form", () => {
    renderExplorer();
    fireEvent.change(screen.getByLabelText("Metric"), { target: { value: "spend" } });
    fireEvent.click(screen.getByLabelText("Funnel-shaped ranking"));
    expect(screen.getByTestId("breakdown-funnel")).toBeTruthy();
  });

  it("surfaces the tracking-basis restriction for conversion dimensions instead of zeros", () => {
    renderExplorer();
    fireEvent.change(screen.getByLabelText("Dimension"), { target: { value: "conv:device" } });
    fireEvent.change(screen.getByLabelText("Metric"), { target: { value: "spend" } });
    expect(screen.getByTestId("breakdown-restriction").textContent).toMatch(/conversion/i);
    expect(screen.queryByTestId("breakdown-table")).toBeNull();
  });

  it("withholds non-cell dimensions under a narrowed run selection", () => {
    renderExplorer({ scopeNarrowed: true });
    expect(screen.getByTestId("breakdown-scoped-note")).toBeTruthy();
    const options = within(screen.getByLabelText("Dimension") as HTMLElement).getAllByRole("option");
    expect(options.map((o) => (o as HTMLOptionElement).value).sort()).toEqual(["cell", "concept"]);
  });

  it("chains a segment into the deep-dive panel when the provider is mounted", () => {
    renderExplorer({}, true);
    fireEvent.click(screen.getByTestId("breakdown-segment-Concept One"));
    expect(screen.getByTestId("deep-dive-panel")).toBeTruthy();
    expect(screen.getByTestId("deep-dive-title").textContent).toBe("Concept One");
  });

  it("renders plain, non-drillable segments without a provider", () => {
    renderExplorer();
    expect(screen.queryByTestId("breakdown-segment-Concept One")).toBeNull();
    expect(screen.getByTestId("breakdown-table")).toBeTruthy();
  });
});
