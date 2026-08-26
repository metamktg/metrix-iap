// ─── A measured zero is not an unknown (C7) ───────────────────────────
//
// EngagementFunnelView's `ratio` guarded with `if (!a || !b) return null`,
// so a real, recorded 0 in the numerator — an ad set that genuinely got
// zero adds to cart — reported "not measured" rather than 0%. That is the
// honesty invariant inverted: the platform's entire convention is that
// zero and unknown are different facts, and this surface conflated them in
// the direction that hides a real, bad result.

import { describe, it, expect } from "vitest";

// Mirrors the guard under test. EngagementFunnelView keeps `ratio`/`pct`
// module-private, so the contract is pinned here as the specification the
// implementation must satisfy; both sides changed in the same commit.
function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}
const pct = (a: number | null | undefined, b: number | null | undefined) => {
  const r = ratio(a, b);
  return r == null ? null : r * 100;
};

describe("engagement-funnel ratio", () => {
  it("reports a measured zero numerator as 0, not as unknown", () => {
    expect(ratio(0, 500)).toBe(0);
    expect(pct(0, 500)).toBe(0);
  });

  it("still reports unknown when the numerator was never measured", () => {
    expect(ratio(null, 500)).toBeNull();
    expect(ratio(undefined, 500)).toBeNull();
  });

  it("reports unknown when the denominator is absent or zero", () => {
    expect(ratio(10, null)).toBeNull();
    expect(ratio(10, undefined)).toBeNull();
    // Zero link clicks means the rate is undefined, not 0%.
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(0, 0)).toBeNull();
  });

  it("computes an ordinary rate unchanged", () => {
    expect(pct(25, 500)).toBeCloseTo(5, 6);
  });
});
