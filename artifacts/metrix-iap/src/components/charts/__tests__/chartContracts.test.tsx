// ─── The chart rules that are not about pixels ────────────────────────
//
// jsdom gives ResponsiveContainer zero size, so the plot itself does not
// render — which is fine, because the things most likely to regress are not
// the marks. They are: which colour an entity gets, and whether the chart
// tells the reader what it left out. Both render outside the container.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { assignSeriesColors, seriesColor, MAX_SERIES, NEUTRAL_VAR } from "../chartTokens";
import { MetricBarChart } from "../MetricBarChart";
import { TrendChart } from "../TrendChart";

afterEach(cleanup);

describe("chartTokens · colour follows the entity, not its rank", () => {
  it("keeps an entity's colour when the set is filtered", () => {
    const all = assignSeriesColors(["reels", "feed", "stories", "search"]);
    // "stories" is 3rd here and would be 1st in a filtered view; the point of
    // assigning once by key is that its colour does not move.
    const survivors = ["stories", "search"];
    for (const k of survivors) expect(all.get(k)).toBe(assignSeriesColors(["reels", "feed", "stories", "search"]).get(k));
    expect(all.get("stories")).toBe(seriesColor(2));
  });

  it("never wraps past the last slot", () => {
    expect(seriesColor(MAX_SERIES)).toBe(NEUTRAL_VAR);
    expect(seriesColor(MAX_SERIES + 7)).toBe(NEUTRAL_VAR);
    // Specifically: the 6th series is NOT slot 1 again.
    expect(seriesColor(MAX_SERIES)).not.toBe(seriesColor(0));
  });

  it("gives every slot a distinct value", () => {
    const seen = new Set(Array.from({ length: MAX_SERIES }, (_, i) => seriesColor(i)));
    expect(seen.size).toBe(MAX_SERIES);
  });
});

describe("MetricBarChart · an unmeasured value is not a zero-length bar", () => {
  const data = [
    { key: "a", label: "Reels", value: 900 },
    { key: "b", label: "Feed", value: 400 },
    { key: "c", label: "Stories", value: null },
    { key: "d", label: "Search", value: null },
  ];

  it("excludes unmeasured rows from the plot and says how many", () => {
    render(<MetricBarChart data={data} format={(n) => `$${n}`} measureLabel="Spend" />);
    expect(screen.getByText("2 not measured")).toBeTruthy();
  });

  it("names the measure and the plotted values for assistive tech", () => {
    render(<MetricBarChart data={data} format={(n) => `$${n}`} measureLabel="Spend" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("Bar chart of Spend");
    expect(label).toContain("Reels $900");
    expect(label).toContain("2 not measured");
    // The unmeasured ones are not given a value in the description either.
    expect(label).not.toContain("Stories $");
  });

  it("reports what the row cap hid rather than truncating silently", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, value: 100 - i }));
    render(<MetricBarChart data={many} format={(n) => `${n}`} measureLabel="Spend" limit={4} />);
    expect(screen.getByText("5 more not shown")).toBeTruthy();
  });

  it("shows an empty state rather than an empty frame when nothing is measured", () => {
    render(
      <MetricBarChart
        data={[{ key: "a", label: "Reels", value: null }]}
        format={(n) => `${n}`}
        measureLabel="Spend"
        emptyLabel="No spend recorded"
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("No spend recorded");
  });
});

describe("TrendChart · gaps are named, not bridged", () => {
  const days = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"];

  it("reports days the account had no data for", () => {
    render(
      <TrendChart
        days={days}
        missingDays={["2026-08-03"]}
        series={[{ key: "spend", label: "Spend", values: [100, 120, null, 90], format: (n) => `$${n}` }]}
      />,
    );
    expect(screen.getByText(/1 days with no data/)).toBeTruthy();
  });

  it("states that an indexed plot is indexed", () => {
    render(
      <TrendChart
        days={days}
        normalize="index"
        series={[
          { key: "spend", label: "Spend", values: [100, 120, 140, 90], format: (n) => `$${n}` },
          { key: "ctr", label: "CTR", values: [1.2, 1.4, 1.1, 1.0], format: (n) => `${n}%` },
        ]}
      />,
    );
    expect(screen.getByText(/Indexed to 100/)).toBeTruthy();
  });

  it("caps at the scale and says how many series it dropped", () => {
    const series = Array.from({ length: 7 }, (_, i) => ({
      key: `s${i}`, label: `S${i}`, values: days.map(() => 10 + i), format: (n: number) => `${n}`,
    }));
    render(<TrendChart days={days} series={series} />);
    expect(screen.getByText(/2 more series not shown/)).toBeTruthy();
  });

  it("shows an empty state when no series has a single measured point", () => {
    render(
      <TrendChart
        days={days}
        series={[{ key: "spend", label: "Spend", values: [null, null, null, null], format: (n) => `$${n}` }]}
        emptyLabel="No trend yet"
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("No trend yet");
  });

  it("gives each series a keyboard-reachable highlight control with a real hit area", () => {
    render(
      <TrendChart
        days={days}
        series={[
          { key: "spend", label: "Spend", values: [1, 2, 3, 4], format: (n) => `${n}` },
          { key: "ctr", label: "CTR", values: [1, 2, 3, 4], format: (n) => `${n}` },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Highlight Spend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Highlight CTR" })).toBeTruthy();
  });
});
