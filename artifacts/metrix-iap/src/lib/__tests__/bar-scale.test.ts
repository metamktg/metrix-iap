// Every test here describes a way a bar can be correct in its number and
// wrong on the screen.

import { describe, it, expect } from "vitest";
import { barScale, barWidth, MIN_STUB, INVERT_FLOOR } from "../bar-scale";

describe("normal scale (bigger is bigger)", () => {
  it("scales against the largest measured value", () => {
    const s = barScale([100, 50, 25]);
    expect(s.share(100)).toBe(1);
    expect(s.share(50)).toBe(0.5);
  });

  it("gives a measured zero a visible stub, not an empty track", () => {
    // A real zero is a finding — "this concept spent nothing" — and it must
    // not look the same as a row we have no number for.
    const s = barScale([100, 0]);
    expect(s.share(0)).toBe(MIN_STUB);
    expect(s.share(0)).toBeGreaterThan(0);
  });

  it("returns null for a value that was never measured", () => {
    // The whole point: null is not zero. The caller draws a dash.
    const s = barScale([100, null, undefined]);
    expect(s.share(null)).toBeNull();
    expect(s.share(undefined)).toBeNull();
  });

  it("returns null rather than NaN for a non-finite value", () => {
    // A division somewhere upstream producing Infinity must not paint a bar.
    const s = barScale([100]);
    expect(s.share(Number.NaN)).toBeNull();
    expect(s.share(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("clamps a negative value to the stub instead of drawing backwards", () => {
    const s = barScale([100, -20]);
    expect(s.share(-20)).toBe(MIN_STUB);
  });

  it("reports nothing measurable when every value is missing", () => {
    const s = barScale([null, undefined]);
    expect(s.measured).toBe(0);
    expect(s.min).toBeNull();
    expect(s.share(5)).toBeNull();
  });
});

describe("inverted scale (lower is better. CPA, CPC, CPM)", () => {
  it("gives the BEST value the longest bar", () => {
    // THE DEFECT THIS EXISTS TO PREVENT. Scale CPA as value/max and the
    // worst performer gets the longest bar. Everything scanning the column
    // then reads the loser as the winner, with no number wrong anywhere.
    const s = barScale([5, 10, 20], true);
    expect(s.share(5)).toBe(1);
    expect(s.share(20)).toBe(INVERT_FLOOR);
    expect(s.share(5)!).toBeGreaterThan(s.share(10)!);
    expect(s.share(10)!).toBeGreaterThan(s.share(20)!);
  });

  it("keeps the worst value visible instead of drawing nothing", () => {
    // A zero-width bar for the worst row reads as "no data", which is a
    // different claim from "worst".
    const s = barScale([5, 20], true);
    expect(s.share(20)).toBeGreaterThan(0);
  });

  it("fills every bar when all values are equal", () => {
    // All equally good. Spreading them across the track would invent a
    // ranking the data does not contain.
    const s = barScale([8, 8, 8], true);
    expect(s.share(8)).toBe(1);
  });

  it("anchors on the range, not on zero", () => {
    // A $4 CPA against a $5 best is nearly as good. Anchored at zero it
    // would draw at 20% of the track and read as a poor performer.
    const s = barScale([4, 5], true);
    expect(s.share(4)).toBe(1);
    expect(s.share(5)).toBe(INVERT_FLOOR);
  });

  it("still returns null for an unmeasured value", () => {
    const s = barScale([5, 10, null], true);
    expect(s.share(null)).toBeNull();
  });
});

describe("barWidth", () => {
  it("formats a share as a CSS percentage", () => {
    expect(barWidth(barScale([100, 50]), 50)).toBe("50.00%");
  });

  it("returns null so the caller can render a track with no bar", () => {
    expect(barWidth(barScale([100]), null)).toBeNull();
  });
});
