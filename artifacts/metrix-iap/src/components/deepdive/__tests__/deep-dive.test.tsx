// ─── Deep-dive stack: builder + context + panel + modal chaining ──────
// Covers the Nocturne "Metrix v1" deep-dive slide-over end to end in
// jsdom: pure module building (honest n/a on restricted metrics), stack
// semantics (push/pop/jump/close, duplicate-top guard), panel rendering
// (breadcrumbs, Escape, chaining), and the KpiDrilldownModal entry point
// (segment click pushes a module and closes the modal; no affordance
// without a provider).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { buildSegmentModule, findDimension } from "@/lib/data/deepDive";
import { DeepDiveProvider, useDeepDive } from "@/contexts/DeepDiveContext";
import { DeepDivePanel } from "../DeepDivePanel";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import { buildMetricCatalog, metricSourceFromCampaignSummary } from "@/lib/data/metricsCatalog";
import type { AnalysisData, CampaignSummary, CellPerformanceRow } from "@/lib/data/seedTypes";

afterEach(cleanup);

// ─── Fixtures (same conventions as KpiDrilldownModal.test.tsx) ────────

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
      { device: "desktop", date_start: "", date_end: "", link_clicks: 10, adds_to_cart: 1, checkouts_initiated: 1, purchases: 0, confidence: null } as any,
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

// ─── buildSegmentModule (pure) ────────────────────────────────────────

describe("buildSegmentModule", () => {
  it("profiles a concept segment with real formatted values and drillable peers", () => {
    const dim = findDimension(ANALYSIS, "concept")!;
    const mod = buildSegmentModule({
      analysis: ANALYSIS, dimension: dim, segmentKey: "Concept One", catalog: CATALOG,
    });
    expect(mod.title).toBe("Concept One");
    expect(mod.kicker).toBe("Concept");

    const stats = mod.blocks.find((b) => b.kind === "stats");
    expect(stats).toBeTruthy();
    const spendStat = (stats as any).stats.find((s: any) => s.metricId === "spend");
    expect(spendStat.value).toContain("100");

    const ranked = mod.blocks.find((b) => b.kind === "ranked") as any;
    expect(ranked.rows).toHaveLength(2);
    const self = ranked.rows.find((r: any) => r.key === "Concept One");
    const peer = ranked.rows.find((r: any) => r.key === "Concept Two");
    expect(self.current).toBe(true);
    expect(self.drill).toBeUndefined();
    expect(typeof peer.drill).toBe("function");
    // Chaining: the peer's drill builds the peer's own module.
    expect(peer.drill().title).toBe("Concept Two");
  });

  it("keeps conversion-basis segments honest: delivery metrics n/a with the restriction reason, ranked by link clicks", () => {
    const dim = findDimension(ANALYSIS, "conv:device")!;
    const mod = buildSegmentModule({
      analysis: ANALYSIS, dimension: dim, segmentKey: "mobile", catalog: CATALOG,
    });
    const stats = (mod.blocks.find((b) => b.kind === "stats") as any).stats;
    const spendStat = stats.find((s: any) => s.metricId === "spend");
    expect(spendStat.value).toBe("n/a");
    expect(spendStat.note).toMatch(/conversion/i);
    const ranked = mod.blocks.find((b) => b.kind === "ranked") as any;
    expect(ranked.metricLabel).toBe("Link clicks");
    // Honesty note block present when metrics were restricted.
    expect(mod.blocks.some((b) => b.kind === "note")).toBe(true);
  });
});

// ─── Context semantics ────────────────────────────────────────────────

function StackProbe() {
  const { stack, push, pop, jumpTo, close } = useDeepDive();
  const dim = findDimension(ANALYSIS, "concept")!;
  const mk = (key: string) => buildSegmentModule({ analysis: ANALYSIS, dimension: dim, segmentKey: key, catalog: CATALOG });
  return (
    <div>
      <span data-testid="depth">{stack.length}</span>
      <button onClick={() => push(mk("Concept One"))}>push1</button>
      <button onClick={() => push(mk("Concept Two"))}>push2</button>
      <button onClick={pop}>pop</button>
      <button onClick={() => jumpTo(0)}>jump0</button>
      <button onClick={close}>closeAll</button>
    </div>
  );
}

describe("DeepDiveContext", () => {
  it("push/pop/jumpTo/close manage the stack; re-pushing the top module is a no-op", () => {
    render(<DeepDiveProvider><StackProbe /></DeepDiveProvider>);
    const depth = () => screen.getByTestId("depth").textContent;
    expect(depth()).toBe("0");
    fireEvent.click(screen.getByText("push1"));
    fireEvent.click(screen.getByText("push1")); // duplicate-top guard
    expect(depth()).toBe("1");
    fireEvent.click(screen.getByText("push2"));
    expect(depth()).toBe("2");
    fireEvent.click(screen.getByText("pop"));
    expect(depth()).toBe("1");
    fireEvent.click(screen.getByText("push2"));
    fireEvent.click(screen.getByText("jump0"));
    expect(depth()).toBe("1");
    fireEvent.click(screen.getByText("closeAll"));
    expect(depth()).toBe("0");
  });
});

// ─── Panel rendering + chaining ───────────────────────────────────────

function PanelHarness() {
  const { push } = useDeepDive();
  const dim = findDimension(ANALYSIS, "concept")!;
  return (
    <>
      <button
        onClick={() => push(buildSegmentModule({ analysis: ANALYSIS, dimension: dim, segmentKey: "Concept One", catalog: CATALOG }))}
      >
        open
      </button>
      <DeepDivePanel />
    </>
  );
}

describe("DeepDivePanel", () => {
  it("renders the module, chains via a ranked row, breadcrumb jumps back, Escape closes", () => {
    render(<DeepDiveProvider><PanelHarness /></DeepDiveProvider>);
    expect(screen.queryByTestId("deep-dive-panel")).toBeNull();

    fireEvent.click(screen.getByText("open"));
    const panel = screen.getByTestId("deep-dive-panel");
    expect(within(panel).getByTestId("deep-dive-title").textContent).toBe("Concept One");
    expect(within(panel).getByTestId("deep-dive-stat-spend")).toBeTruthy();
    expect(within(panel).getByTestId("deep-dive-row-current")).toBeTruthy();

    // Chain into the peer segment → breadcrumb trail grows.
    fireEvent.click(within(panel).getByTestId("deep-dive-row-Concept Two"));
    expect(screen.getByTestId("deep-dive-title").textContent).toBe("Concept Two");
    expect(screen.getByTestId("deep-dive-crumb-0").textContent).toBe("Concept One");

    // Crumb click truncates the stack back to the first module.
    fireEvent.click(screen.getByTestId("deep-dive-crumb-0"));
    expect(screen.getByTestId("deep-dive-title").textContent).toBe("Concept One");
    expect(screen.queryByTestId("deep-dive-crumb-0")).toBeNull();

    // Escape closes the whole panel.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("deep-dive-panel")).toBeNull();
  });

  it("back button pops exactly one module", () => {
    render(<DeepDiveProvider><PanelHarness /></DeepDiveProvider>);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByTestId("deep-dive-row-Concept Two"));
    expect(screen.getByTestId("deep-dive-back")).toBeTruthy();
    fireEvent.click(screen.getByTestId("deep-dive-back"));
    expect(screen.getByTestId("deep-dive-title").textContent).toBe("Concept One");
    // Single module left → no back button.
    expect(screen.queryByTestId("deep-dive-back")).toBeNull();
  });
});

// ─── KpiDrilldownModal entry point ────────────────────────────────────

function renderModal(withProvider: boolean, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const modal = (
    <QueryClientProvider client={qc}>
      <KpiDrilldownModal
        open
        onClose={onClose}
        scope="account"
        metricId="spend"
        catalog={CATALOG}
        analysis={ANALYSIS}
      />
      {withProvider && <DeepDivePanel />}
    </QueryClientProvider>
  );
  render(withProvider ? <DeepDiveProvider>{modal}</DeepDiveProvider> : modal);
  return onClose;
}

describe("KpiDrilldownModal → deep dive", () => {
  it("segment click pushes the segment module and closes the modal", () => {
    const onClose = renderModal(true);
    // Switch to table view to expose segment rows.
    fireEvent.click(screen.getByLabelText("Table view"));
    fireEvent.click(screen.getByTestId("kpi-drilldown-segment-Concept One"));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("deep-dive-panel")).toBeTruthy();
    expect(screen.getByTestId("deep-dive-title").textContent).toBe("Concept One");
  });

  it("without a DeepDiveProvider the table renders plain, non-drillable segments", () => {
    renderModal(false);
    fireEvent.click(screen.getByLabelText("Table view"));
    expect(screen.queryByTestId("kpi-drilldown-segment-Concept One")).toBeNull();
    // The label itself still renders.
    expect(screen.getAllByText("Concept One").length).toBeGreaterThan(0);
  });
});
