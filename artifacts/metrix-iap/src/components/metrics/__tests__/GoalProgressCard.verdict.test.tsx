// A goal that is not yet met is not a goal that was missed.
//
// The card painted a two-way verdict — `good ? VERDICT.good : VERDICT.bad` —
// where `good` for a more-is-better metric meant `ratio >= 1`. Every value
// short of its target therefore rendered RED: 318 results toward 500 read as
// a failure, and so would 499. Being partway through a window is the normal
// state of a goal that has not finished, and colouring it red asserts a
// verdict nobody computed.
//
// It was invisible to every static check because the code is well-formed. It
// was found by rendering the card and looking at it, which is why these
// assert on the RENDERED fill rather than on the flag.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoalProgressCard } from "../GoalProgressCard";
import { VERDICT } from "@/components/charts/chartTokens";

/** The bar's own fill colour, read off the meter's child. */
function fill(): string {
  const meter = screen.getByRole("meter");
  const bar = meter.querySelector("div") as HTMLElement;
  return bar.style.background;
}

const money = (n: number) => `$${n.toFixed(2)}`;

describe("more-is-better metrics", () => {
  it("is NEUTRAL partway toward the target — not a failure", () => {
    render(<GoalProgressCard label="Results" value={318} goal={500} format={String} />);
    expect(fill()).toBe(VERDICT.neutral);
  });

  it("is still neutral one short of the target", () => {
    render(<GoalProgressCard label="Results" value={499} goal={500} format={String} />);
    expect(fill()).toBe(VERDICT.neutral);
  });

  it("is good once the target is met", () => {
    render(<GoalProgressCard label="Results" value={500} goal={500} format={String} />);
    expect(fill()).toBe(VERDICT.good);
  });

  it("is good when the target is exceeded", () => {
    render(<GoalProgressCard label="Results" value={640} goal={500} format={String} />);
    expect(fill()).toBe(VERDICT.good);
  });

  it("is NEVER bad — the card cannot know the window is over", () => {
    for (const v of [0, 1, 250, 499]) {
      render(<GoalProgressCard label="Results" value={v} goal={500} format={String} />);
      expect(fill()).not.toBe(VERDICT.bad);
      screen.getByRole("meter").remove();
    }
  });
});

describe("lower-is-better metrics keep a real failure state", () => {
  it("is good under the ceiling", () => {
    render(<GoalProgressCard label="CPA" value={18.4} goal={25} format={money} lowerIsBetter />);
    expect(fill()).toBe(VERDICT.good);
  });

  it("is BAD over the ceiling — this one is a genuine breach", () => {
    render(<GoalProgressCard label="CPA" value={60} goal={25} format={money} lowerIsBetter />);
    expect(fill()).toBe(VERDICT.bad);
  });

  it("is good exactly at the ceiling", () => {
    render(<GoalProgressCard label="CPA" value={25} goal={25} format={money} lowerIsBetter />);
    expect(fill()).toBe(VERDICT.good);
  });
});
