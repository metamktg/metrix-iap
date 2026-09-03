// The chart branch of MetricHoverPopover (>= 2 concept rows).
//
// The defect this pins: the bars were painted `hsl(var(--interactive))`, a
// token that does not exist, so the SVG fill fell back to black over the
// navy card; the cost variant reached for a phantom `--chart-amber`. The
// real ChartContainer is rendered here (not stubbed) because it is the
// thing that writes the series colour into a <style> block — that is where
// the wrong token was visible, and where the right one must now be.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { vi } from "vitest";
import type { MetricDef } from "@/lib/data/metricsCatalog";
import type { CellPerformanceRow } from "@/lib/data/seedTypes";
import { SERIES } from "@/components/charts/chartTokens";

// Radix HoverCard portals and pointer events do not run in jsdom; render
// the content inline so its markup can be read.
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

import { MetricHoverPopover } from "@/components/metrics/MetricHoverPopover";

afterEach(cleanup);

function metric(overrides: Partial<MetricDef> & Pick<MetricDef, "id">): MetricDef {
  return { label: overrides.id, value: null, formatted: "—", isResultEvent: false, ...overrides };
}

function row(name: string, spend: number, cpa: number): CellPerformanceRow {
  return {
    cell_id: `cell-${name}`,
    "Result type": "Purchase",
    "Amount spent (USD)": spend,
    Reach: 10000,
    Impressions: 12000,
    Results: Math.round(spend / cpa),
    "Clicks (all)": 300,
    "Link clicks": 250,
    CPA_result: cpa,
    CTR_link_pct: 2.08,
    Result_per_link_click_pct: 4,
    book2_concept_name: name,
  };
}

const ROWS = [row("Alpha", 500, 50), row("Beta", 300, 40), row("Gamma", 200, 80)];

describe("MetricHoverPopover — chart branch", () => {
  it("renders the Top concepts chart and the diagnose footer with >= 2 concepts", () => {
    render(
      <MetricHoverPopover metric={metric({ id: "spend", label: "Total spend", formatted: "$1,000" })} cellRows={ROWS} onDiagnose={vi.fn()}>
        <button type="button">tile</button>
      </MetricHoverPopover>,
    );
    expect(screen.getByText("Top concepts")).toBeTruthy();
    expect(screen.getByText("Diagnose full breakdown")).toBeTruthy();
    expect(screen.getByTestId("metric-popover-header-label").textContent).toBe("Total spend");
    expect(screen.getByText("$1,000")).toBeTruthy();
  });

  it("paints a volume metric with the interactive token — a bare var of a token that exists", () => {
    const { container } = render(
      <MetricHoverPopover metric={metric({ id: "spend", label: "Total spend", formatted: "$1,000" })} cellRows={ROWS} onDiagnose={vi.fn()}>
        <button type="button">tile</button>
      </MetricHoverPopover>,
    );
    const html = container.innerHTML;
    expect(html).toContain(`--color-value: ${SERIES.interactive}`);
    expect(html).not.toContain("var(--interactive)");
    expect(html).not.toContain("chart-amber");
  });

  it("paints a cost metric with the cost series — never amber, never the interactive accent", () => {
    const { container } = render(
      <MetricHoverPopover metric={metric({ id: "cpa_blended", label: "CPA (blended)", formatted: "$52", value: 52 })} cellRows={ROWS} onDiagnose={vi.fn()}>
        <button type="button">tile</button>
      </MetricHoverPopover>,
    );
    const html = container.innerHTML;
    expect(html).toContain(`--color-value: ${SERIES.cost}`);
    expect(html).not.toContain(`--color-value: ${SERIES.interactive}`);
    expect(html).not.toContain("chart-amber");
    expect(html).not.toContain("var(--interactive)");
    // The accent stripe and the series key wear the same colour as the bars.
    expect(html).toContain(`linear-gradient(to right, ${SERIES.cost}, transparent)`);
  });
});
