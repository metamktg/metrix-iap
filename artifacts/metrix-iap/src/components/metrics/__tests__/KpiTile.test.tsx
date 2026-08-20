// ─── Unified KPI tile tests ────────────────────────────────────────────
// Covers the KpiTile / KpiTileRow contract:
//   1. Metric dropdown selection changes the shown metric
//   2. Info hover renders disclosure content (opens on focus)
//   3. Verbose sub-text is NOT rendered inline in the tile body
//   4. Per-view selection persists (localStorage) across remounts
//   5. Catalog hides metrics the source can't compute + derived metrics

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within, screen } from "@testing-library/react";
import { KpiTile, KpiTileRow } from "../KpiTile";
import { buildMetricCatalog, type MetricSource } from "@/lib/data/metricsCatalog";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const SOURCE: MetricSource = {
  spend: 12800,
  impressions: 1_000_000,
  reach: 400_000,
  clicksAll: 30_000,
  linkClicks: 20_000,
  linkCtrPct: 2,
  resultEvents: [{ key: "Website purchases", label: "Purchases", results: 640, spend: 1280 }],
  isMultiEvent: false,
};
const catalog = buildMetricCatalog(SOURCE);

describe("metric catalog — derived metrics & hiding", () => {
  it("includes derived CPC, CPM, CTR (all), CVR and blended CPA when computable", () => {
    const ids = catalog.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["cpc", "cpm", "ctr_all", "cvr", "cpa_blended"]));
    expect(catalog.find((m) => m.id === "cpc")!.formatted).toBe("$0.64");
    expect(catalog.find((m) => m.id === "cpm")!.formatted).toBe("$12.80");
  });

  it("hides derived metrics the source cannot compute instead of showing blanks", () => {
    const ids = buildMetricCatalog({
      ...SOURCE, impressions: null, clicksAll: null, reach: null, linkCtrPct: null,
    }).map((m) => m.id);
    expect(ids).not.toContain("cpm");
    expect(ids).not.toContain("ctr_all");
    expect(ids).toContain("spend");
    expect(ids).toContain("cpc");
  });
});

describe("KpiTile", () => {
  it("dropdown selection reports the newly picked metric", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <KpiTile metricId="spend" catalog={catalog} onSelect={onSelect} />
    );
    fireEvent.click(within(container).getByRole("button", { name: /total spend/i }));
    const dropdown = within(container).getByTestId("kpi-metric-dropdown");
    fireEvent.click(within(dropdown).getByRole("button", { name: /purchases/i }));
    expect(onSelect).toHaveBeenCalledWith("result:Website purchases");
  });

  it("renders label + value only — verbose sub-text never appears inline", () => {
    const { container } = render(
      <KpiTile metricId="cpc" catalog={catalog} onSelect={() => {}} />
    );
    const tile = within(container).getByTestId("kpi-tile");
    expect(tile.textContent).toContain("CPC");
    expect(tile.textContent).toContain("$0.64");
    // The metric's sub note stays behind the info hover, not inline.
    expect(tile.textContent).not.toContain("spend ÷ link clicks");
  });

  it("info hover renders disclosure content on focus", async () => {
    const { container } = render(
      <KpiTile
        metricId="spend"
        catalog={catalog}
        onSelect={() => {}}
        disclosure={<span>Bookster $8.0k · skov $4.8k</span>}
      />
    );
    const info = within(container).getByTestId("kpi-tile-info");
    fireEvent.focus(info);
    await waitFor(() => {
      expect(screen.getAllByText(/Bookster \$8\.0k/).length).toBeGreaterThan(0);
    });
    // And the disclosure is not part of the tile body itself outside the hover.
    const tile = within(container).getByTestId("kpi-tile");
    const valueRow = tile.querySelector(".metric-num")!;
    expect(valueRow.textContent).not.toContain("Bookster");
  });

  it("value area triggers onClick drill-down", () => {
    const onClick = vi.fn();
    const { container } = render(
      <KpiTile metricId="spend" catalog={catalog} onSelect={() => {}} onClick={onClick} />
    );
    fireEvent.click(within(container).getByText("$12,800.00"));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("KpiTileRow — per-view persistence", () => {
  function renderRow() {
    return render(
      <div>
        <KpiTileRow viewKey="test-view" catalog={catalog} />
      </div>
    );
  }

  it("mounts the default four tiles", () => {
    const { container } = renderRow();
    expect(within(container).getAllByTestId("kpi-tile")).toHaveLength(4);
    expect(container.textContent).toContain("Total spend");
    expect(container.textContent).toContain("Impressions");
  });

  it("a metric picked in a slot survives unmount/remount via localStorage", () => {
    const first = renderRow();
    // Open the first tile's dropdown and swap Total spend → CPM.
    fireEvent.click(within(first.container).getAllByRole("button", { name: /total spend/i })[0]);
    const dropdown = within(first.container).getByTestId("kpi-metric-dropdown");
    fireEvent.click(within(dropdown).getByRole("button", { name: /cpm/i }));
    expect(first.container.textContent).toContain("CPM");
    first.unmount();

    const second = renderRow();
    const tiles = within(second.container).getAllByTestId("kpi-tile");
    expect(tiles[0].textContent).toContain("CPM");
    expect(tiles[0].textContent).not.toContain("Total spend");
  });

  it("views persist independently by viewKey", () => {
    localStorage.setItem("metrix.kpi_tiles.v1::other-view", JSON.stringify(["cpc", "cvr"]));
    const { container } = renderRow();
    const tiles = within(container).getAllByTestId("kpi-tile");
    expect(tiles[0].textContent).toContain("Total spend");
  });
});
