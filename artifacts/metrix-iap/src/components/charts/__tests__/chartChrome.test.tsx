// chartTooltipRenderer is the one loop every recharts <Tooltip content>
// in the product runs: read the datum, build rows, draw ChartTooltip.
// Five charts had hand-written it with five different cards.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { chartTooltipRenderer } from "../chartChrome";

afterEach(cleanup);

interface Datum { name: string; spend: number }

const Render = chartTooltipRenderer<Datum>((d) => ({
  title: d.name,
  rows: [{ label: "Spend", value: `$${d.spend}`, swatch: "var(--color-chart-1)" }],
  detail: "12 ads",
}));

describe("chartTooltipRenderer", () => {
  it("renders nothing while the tooltip is inactive or has no datum", () => {
    const { container } = render(<Render active={false} payload={[{ payload: { name: "Reels", spend: 9 } }]} />);
    expect(container.innerHTML).toBe("");
    const empty = render(<Render active payload={[]} />);
    expect(empty.container.innerHTML).toBe("");
  });

  it("draws the shared card from the datum behind the pointer", () => {
    render(<Render active payload={[{ payload: { name: "Reels", spend: 900 } }]} />);
    expect(screen.getByText("Reels")).toBeTruthy();
    expect(screen.getByText("Spend")).toBeTruthy();
    expect(screen.getByText("$900")).toBeTruthy();
    expect(screen.getByText("12 ads")).toBeTruthy();
  });

  it("lets the builder decline a datum", () => {
    const Decline = chartTooltipRenderer<Datum>(() => null);
    const { container } = render(<Decline active payload={[{ payload: { name: "x", spend: 1 } }]} />);
    expect(container.innerHTML).toBe("");
  });
});
