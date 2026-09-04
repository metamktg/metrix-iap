// ─── GoalProgressCard: the bar needs a real denominator ───────────────
//
// The reference design puts a progress bar on every tile. On this platform
// most metrics have no target, and a bar without one reports progress toward
// a number nobody chose. These pin that it refuses.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GoalProgressCard } from "../GoalProgressCard";

afterEach(cleanup);

const usd = (n: number) => `$${n.toFixed(2)}`;

describe("GoalProgressCard · no goal, no bar", () => {
  it("draws no bar and says so when no goal was set", () => {
    render(<GoalProgressCard label="CPA" value={18.4} goal={null} format={usd} />);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getByText("No goal set")).toBeTruthy();
    expect(screen.getByText("$18.40")).toBeTruthy();
  });

  it("draws no bar for a zero goal, which is not a target", () => {
    render(<GoalProgressCard label="CPA" value={18.4} goal={0} format={usd} />);
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("says the value is not measured rather than showing a zero", () => {
    render(
      <GoalProgressCard
        label="CPA"
        value={null}
        goal={25}
        format={usd}
        unmeasuredReason="no results in this window"
      />,
    );
    expect(screen.getByText("–")).toBeTruthy();
    expect(screen.getByText("no results in this window")).toBeTruthy();
    expect(screen.queryByRole("meter")).toBeNull();
  });
});

describe("GoalProgressCard · the verdict flips with the metric's direction", () => {
  it("under a cost ceiling is good", () => {
    render(<GoalProgressCard label="CPA" value={18} goal={25} format={usd} lowerIsBetter />);
    const bar = screen.getByRole("meter").firstElementChild as HTMLElement;
    expect(bar.style.background).toContain("--status-success");
  });

  it("over a cost ceiling is not", () => {
    render(<GoalProgressCard label="CPA" value={30} goal={25} format={usd} lowerIsBetter />);
    const bar = screen.getByRole("meter").firstElementChild as HTMLElement;
    expect(bar.style.background).toContain("--status-danger");
  });

  it("short of a results target is not good. The same ratio, the opposite reading", () => {
    // The flip this case exists to protect is real and still holds: 18 of 25
    // is GOOD under a cost ceiling and NOT good toward a results target.
    //
    // What changed is which non-good colour it takes. This used to assert
    // danger, which conflates "not good" with "bad" — and they are different.
    // 18 of 25 results is not a failure, it is a goal that has not finished;
    // under the old binary, 24 of 25 was red too. Painting that red asserts a
    // verdict nobody computed, since the card has no idea whether the window
    // is over. Neutral is the honest colour, and the flip is asserted below.
    render(<GoalProgressCard label="Results" value={18} goal={25} format={usd} />);
    const bar = screen.getByRole("meter").firstElementChild as HTMLElement;
    expect(bar.style.background).toContain("--muted-foreground");
    expect(bar.style.background).not.toContain("--status-success");
  });

  it("the flip is real: one ratio, two readings", () => {
    // The point of the whole describe block, asserted directly rather than
    // implied by two separate cases.
    render(<GoalProgressCard label="CPA" value={18} goal={25} format={usd} lowerIsBetter />);
    const cost = (screen.getByRole("meter").firstElementChild as HTMLElement).style.background;
    cleanup();
    render(<GoalProgressCard label="Results" value={18} goal={25} format={usd} />);
    const results = (screen.getByRole("meter").firstElementChild as HTMLElement).style.background;
    expect(cost).not.toBe(results);
    expect(cost).toContain("--status-success");
  });

  it("at or past a results target is", () => {
    render(<GoalProgressCard label="Results" value={30} goal={25} format={usd} />);
    const bar = screen.getByRole("meter").firstElementChild as HTMLElement;
    expect(bar.style.background).toContain("--status-success");
  });
});

describe("GoalProgressCard · an overrun is reported, not clipped", () => {
  it("reports the real percentage even though the bar cannot exceed its track", () => {
    render(<GoalProgressCard label="CPA" value={60} goal={25} format={usd} lowerIsBetter />);
    // The bar is clamped — it has nowhere to go — but the number is not.
    expect(screen.getByText(/240% of ceiling/)).toBeTruthy();
    const bar = screen.getByRole("meter").firstElementChild as HTMLElement;
    expect(bar.style.width).toBe("100%");
  });

  it("exposes the real ratio to assistive tech too", () => {
    render(<GoalProgressCard label="CPA" value={60} goal={25} format={usd} lowerIsBetter />);
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("240");
  });
});

describe("GoalProgressCard · a delta is reported, not judged", () => {
  it("shows the sign without a status colour", () => {
    render(<GoalProgressCard label="CPA" value={18} goal={25} format={usd} deltaPct={12.5} />);
    // fmtDelta scales precision: one decimal below 10%, none above.
    const d = screen.getByText("+13%");
    expect(d.className).not.toContain("status-success");
    expect(d.className).not.toContain("status-danger");
  });

  it("renders no delta when none was computed", () => {
    render(<GoalProgressCard label="CPA" value={18} goal={25} format={usd} deltaPct={null} />);
    expect(screen.queryByText(/^[+-]/)).toBeNull();
  });
});
