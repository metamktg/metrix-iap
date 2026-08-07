// Unit tests: MetricHoverPopover renders without errors when cellRows is empty
// or contains exactly one concept.
// Covers the concepts.length === 0 branch and the concepts.length === 1 branch
// in MetricHoverPopover.tsx for each supported metric type: spend, link_ctr,
// cpa_blended, and a result-event metric.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { MetricDef } from "@/lib/data/metricsCatalog";

// HoverCard from Radix UI uses pointer events and portals that jsdom does not
// fully support.  Stub just enough to render the card inline so assertions can
// read fallback text without needing a real popover portal.
vi.mock("@workspace/command-deck/components/ui/hover-card", () => {
  const React = require("react");
  return {
    HoverCard: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    HoverCardTrigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    HoverCardContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "hover-card-content" }, children),
  };
});

// ChartContainer requires a full canvas context; stub it to a plain div.
vi.mock("@workspace/command-deck/components/ui/chart", () => {
  const React = require("react");
  return {
    ChartContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "chart-container" }, children),
  };
});

import { MetricHoverPopover } from "@/components/metrics/MetricHoverPopover";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMetric(overrides: Partial<MetricDef> & Pick<MetricDef, "id">): MetricDef {
  return {
    label: overrides.id,
    value: null,
    formatted: "—",
    isResultEvent: false,
    ...overrides,
  };
}

function renderPopover(metric: MetricDef) {
  return render(
    <MetricHoverPopover
      metric={metric}
      cellRows={[]}
      onDiagnose={vi.fn()}
    >
      <button type="button">Metric tile</button>
    </MetricHoverPopover>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MetricHoverPopover — empty cellRows fallback", () => {
  beforeEach(() => cleanup());

  it("renders without throwing for spend metric", () => {
    expect(() =>
      renderPopover(makeMetric({ id: "spend", label: "Total spend", formatted: "$0" }))
    ).not.toThrow();
  });

  it("shows fallback text for spend when no cell rows match", () => {
    renderPopover(makeMetric({ id: "spend", label: "Total spend", formatted: "$0" }));
    // getByText throws if not found — confirms fallback text is present
    expect(screen.getByText(/no concept rows available/i)).toBeTruthy();
  });

  it("renders without throwing for link_ctr metric", () => {
    expect(() =>
      renderPopover(makeMetric({ id: "link_ctr", label: "Link CTR", formatted: "0.00%", value: 0 }))
    ).not.toThrow();
  });

  it("shows fallback text for link_ctr when no cell rows match", () => {
    renderPopover(makeMetric({ id: "link_ctr", label: "Link CTR", formatted: "0.00%", value: 0 }));
    expect(screen.getByText(/no concept rows available/i)).toBeTruthy();
  });

  it("renders without throwing for cpa_blended metric", () => {
    expect(() =>
      renderPopover(makeMetric({ id: "cpa_blended", label: "CPA (blended)", formatted: "—", value: null }))
    ).not.toThrow();
  });

  it("shows fallback text for cpa_blended when no cell rows match", () => {
    renderPopover(makeMetric({ id: "cpa_blended", label: "CPA (blended)", formatted: "—", value: null }));
    expect(screen.getByText(/no concept rows available/i)).toBeTruthy();
  });

  it("renders without throwing for a result-event metric", () => {
    expect(() =>
      renderPopover(
        makeMetric({
          id: "result:Purchase",
          label: "Purchases",
          formatted: "0",
          isResultEvent: true,
          eventKey: "Purchase",
        })
      )
    ).not.toThrow();
  });

  it("shows fallback text for a result-event metric when no cell rows match the event key", () => {
    renderPopover(
      makeMetric({
        id: "result:Purchase",
        label: "Purchases",
        formatted: "0",
        isResultEvent: true,
        eventKey: "Purchase",
      })
    );
    expect(screen.getByText(/no concept rows available/i)).toBeTruthy();
  });

  it("does not render the chart when concepts array is empty", () => {
    renderPopover(makeMetric({ id: "spend", label: "Total spend", formatted: "$0" }));
    expect(screen.queryByTestId("chart-container")).toBeNull();
  });

  it("still renders the metric label header when concepts array is empty", () => {
    renderPopover(
      makeMetric({ id: "spend", label: "Total spend", formatted: "$1,234" })
    );
    expect(screen.getByText("Total spend")).toBeTruthy();
    expect(screen.getByText("$1,234")).toBeTruthy();
  });
});

// ── Single-concept branch ─────────────────────────────────────────────────────

/** One CellPerformanceRow → topConceptsForMetric returns exactly 1 entry. */
function makeOneRow(overrides: Partial<import("@/lib/data/seedTypes").CellPerformanceRow> = {}): import("@/lib/data/seedTypes").CellPerformanceRow {
  return {
    cell_id: "cell-001",
    "Result type": "Purchase",
    "Amount spent (USD)": 500,
    Reach: 10000,
    Impressions: 12000,
    Results: 10,
    "Clicks (all)": 300,
    "Link clicks": 250,
    CPA_result: 50,
    CTR_link_pct: 2.08,
    Result_per_link_click_pct: 4,
    book2_concept_name: "Alpha Concept",
    ...overrides,
  };
}

function renderPopoverWithOneRow(metric: MetricDef) {
  return render(
    <MetricHoverPopover
      metric={metric}
      cellRows={[makeOneRow()]}
      onDiagnose={vi.fn()}
    >
      <button type="button">Metric tile</button>
    </MetricHoverPopover>
  );
}

describe("MetricHoverPopover — single-concept fallback", () => {
  beforeEach(() => cleanup());

  it("shows the single-concept message for spend metric", () => {
    renderPopoverWithOneRow(makeMetric({ id: "spend", label: "Total spend", formatted: "$500" }));
    expect(screen.getByText(/only one concept found/i)).toBeTruthy();
  });

  it("does not render the chart when only one concept matches", () => {
    renderPopoverWithOneRow(makeMetric({ id: "spend", label: "Total spend", formatted: "$500" }));
    expect(screen.queryByTestId("chart-container")).toBeNull();
  });

  it("shows the single-concept message for link_ctr metric", () => {
    renderPopoverWithOneRow(makeMetric({ id: "link_ctr", label: "Link CTR", formatted: "2.08%", value: 2.08 }));
    expect(screen.getByText(/only one concept found/i)).toBeTruthy();
  });

  it("does not render the chart for link_ctr with a single concept", () => {
    renderPopoverWithOneRow(makeMetric({ id: "link_ctr", label: "Link CTR", formatted: "2.08%", value: 2.08 }));
    expect(screen.queryByTestId("chart-container")).toBeNull();
  });

  it("shows the single-concept message for cpa_blended metric", () => {
    renderPopoverWithOneRow(makeMetric({ id: "cpa_blended", label: "CPA (blended)", formatted: "$50", value: 50 }));
    expect(screen.getByText(/only one concept found/i)).toBeTruthy();
  });

  it("does not render the chart for cpa_blended with a single concept", () => {
    renderPopoverWithOneRow(makeMetric({ id: "cpa_blended", label: "CPA (blended)", formatted: "$50", value: 50 }));
    expect(screen.queryByTestId("chart-container")).toBeNull();
  });

  it("shows the single-concept message for a result-event metric when one row matches the event key", () => {
    render(
      <MetricHoverPopover
        metric={makeMetric({
          id: "result:Purchase",
          label: "Purchases",
          formatted: "10",
          isResultEvent: true,
          eventKey: "Purchase",
        })}
        cellRows={[makeOneRow({ "Result type": "Purchase" })]}
        onDiagnose={vi.fn()}
      >
        <button type="button">Metric tile</button>
      </MetricHoverPopover>
    );
    expect(screen.getByText(/only one concept found/i)).toBeTruthy();
  });

  it("does not render the chart for a result-event metric with one matching row", () => {
    render(
      <MetricHoverPopover
        metric={makeMetric({
          id: "result:Purchase",
          label: "Purchases",
          formatted: "10",
          isResultEvent: true,
          eventKey: "Purchase",
        })}
        cellRows={[makeOneRow({ "Result type": "Purchase" })]}
        onDiagnose={vi.fn()}
      >
        <button type="button">Metric tile</button>
      </MetricHoverPopover>
    );
    expect(screen.queryByTestId("chart-container")).toBeNull();
  });

  it("still renders the metric label header when only one concept matches", () => {
    renderPopoverWithOneRow(makeMetric({ id: "spend", label: "Total spend", formatted: "$500" }));
    expect(screen.getByText("Total spend")).toBeTruthy();
    expect(screen.getByText("$500")).toBeTruthy();
  });
});
