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

// ─── Loading is not the same picture as missing (BUG-33) ───────────────
// While a refetch was in flight KpiValue rendered the SAME "—" glyph a null
// value renders, only fainter. A slow request and "this number does not
// exist" were indistinguishable, and the honest-null convention loses its
// meaning if loading borrows its glyph.

describe("KpiTile — in-flight state is distinguishable from a missing value", () => {
  it("renders an aria-busy affordance, not a dash, while refetching", () => {
    const { container } = render(
      <KpiTile metricId="spend" catalog={catalog} onSelect={() => {}} isRefetching />
    );
    const busy = container.querySelector('[data-testid="kpi-value-loading"]');
    expect(busy).toBeTruthy();
    expect(busy!.getAttribute("aria-busy")).toBe("true");
    // The dash must NOT be what represents "loading".
    expect(busy!.textContent ?? "").not.toContain("—");
  });

  it("shows the real value once the refetch settles", () => {
    const { container } = render(
      <KpiTile metricId="spend" catalog={catalog} onSelect={() => {}} isRefetching={false} />
    );
    expect(container.querySelector('[data-testid="kpi-value-loading"]')).toBeNull();
    expect(container.textContent).toContain("$12,800");
  });
});

// ─── Strict aggregation: a partial sum never looks complete (BUG-11) ────
// MetricResultEvent.results/.spend became nullable so an unmeasured event
// propagates as null rather than a fabricated 0. Anything derived from the
// event total (blended CPA, CVR) must stay null rather than being computed
// against a sum that silently omits the unmeasured part.

describe("buildMetricCatalog — strict null propagation from result events", () => {
  const withUnmeasuredEvent: MetricSource = {
    ...SOURCE,
    resultEvents: [
      { key: "Website purchases", label: "Purchases", results: 640, spend: 1280 },
      { key: "Leads", label: "Leads", results: null, spend: null },
    ],
    isMultiEvent: true,
  };

  it("leaves blended CPA null when any event's results are unmeasured", () => {
    const c = buildMetricCatalog(withUnmeasuredEvent);
    expect(c.find((m) => m.id === "cpa_blended")!.value).toBeNull();
  });

  it("leaves CVR null when any event's results are unmeasured", () => {
    const cvr = buildMetricCatalog(withUnmeasuredEvent).find((m) => m.id === "cvr");
    // cvr is hideWhenNull, so it is either absent or present-with-null —
    // both are honest; a number here would not be.
    if (cvr) expect(cvr.value).toBeNull();
  });

  it("still computes them when every event is measured", () => {
    const c = buildMetricCatalog(SOURCE);
    expect(c.find((m) => m.id === "cpa_blended")!.value).not.toBeNull();
  });

  it("does not invent a cost-per-result for an unmeasured event", () => {
    const c = buildMetricCatalog(withUnmeasuredEvent);
    const leadCost = c.find((m) => m.eventKey === "Leads" && m.id.startsWith("cost:"));
    if (leadCost) expect(leadCost.value).toBeNull();
  });
});

// ─── A null hero metric can always be interrogated (C4) ───────────────
//
// The ⓘ used to appear only when a metric carried `sub` or a caller passed
// `disclosure`. The six base metrics — spend, impressions, reach, clicks,
// link clicks, link CTR — carry neither, and none of them is hideWhenNull,
// so an account missing that field rendered the platform's most prominent
// numbers as bare dashes with no affordance to ask why. A dash the reader
// cannot interrogate is exactly the ambiguity the honest-null convention
// exists to remove.

const NULL_SOURCE: MetricSource = {
  spend: null,
  impressions: null,
  reach: null,
  clicksAll: null,
  linkClicks: null,
  linkCtrPct: null,
  resultEvents: [],
  isMultiEvent: false,
};

describe("KpiTile — a null value is never unexplainable", () => {
  const nullCatalog = buildMetricCatalog(NULL_SOURCE);

  it.each(["spend", "impressions", "reach", "clicks_all", "link_clicks", "link_ctr"])(
    "offers the info affordance on a null %s tile",
    (id) => {
      const { container } = render(<KpiTile metricId={id} catalog={nullCatalog} onSelect={() => {}} />);
      expect(within(container).queryByTestId("kpi-tile-info")).not.toBeNull();
    },
  );

  it("explains that the dash is absent data rather than a zero", async () => {
    const { container } = render(<KpiTile metricId="spend" catalog={nullCatalog} onSelect={() => {}} />);
    fireEvent.focus(within(container).getByTestId("kpi-tile-info"));
    await waitFor(() => {
      expect(screen.getAllByText(/not a value of zero/i).length).toBeGreaterThan(0);
    });
  });

  it("keeps a metric's own note as the explanation when it has one", async () => {
    const { container } = render(<KpiTile metricId="cpa_blended" catalog={nullCatalog} onSelect={() => {}} />);
    fireEvent.focus(within(container).getByTestId("kpi-tile-info"));
    await waitFor(() => {
      expect(screen.getAllByText("spend ÷ all results").length).toBeGreaterThan(0);
    });
    // The generic note does not pile on top of a real one.
    expect(screen.queryAllByText(/not a value of zero/i).length).toBe(0);
  });

  it("adds no affordance to a tile that has a real value and no note", () => {
    const { container } = render(<KpiTile metricId="spend" catalog={catalog} onSelect={() => {}} />);
    expect(within(container).queryByTestId("kpi-tile-info")).toBeNull();
  });
});
