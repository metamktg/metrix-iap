// FilterDisclosure will not collapse a filter row that cannot say what it is
// doing, and this is the function that says it. If it under-reports, a
// collapsed panel hides an active filter and the grid above it claims the
// account has fewer creatives than it does — a reader draws conclusions from
// a subset without knowing it is one.
//
// So these tests assert the CONTRACT rather than the wording: every filter
// that changes the result set produces exactly one phrase, and an unfiltered
// state produces none.

import { describe, it, expect } from "vitest";
import {
  describeCreativeFilters,
  DEFAULT_FILTER_STATE,
  type CreativeFilterState,
} from "../CreativeFilterPanel";

const state = (over: Partial<CreativeFilterState> = {}): CreativeFilterState => ({
  ...DEFAULT_FILTER_STATE,
  ...over,
});

describe("describeCreativeFilters", () => {
  it("says nothing when nothing is filtering", () => {
    expect(describeCreativeFilters(DEFAULT_FILTER_STATE)).toEqual([]);
  });

  it("reports a spend floor, including one set to zero", () => {
    // 0 is a real floor a user can set, and `minSpendUsd != null` is the
    // test — not truthiness, which would drop it.
    expect(describeCreativeFilters(state({ minSpendUsd: 0 }))).toHaveLength(1);
    expect(describeCreativeFilters(state({ minSpendUsd: 50 }))[0]).toContain("50");
  });

  it("reports a tier, and does not report the 'all' non-filter", () => {
    expect(describeCreativeFilters(state({ tier: "top25" }))).toHaveLength(1);
    expect(describeCreativeFilters(state({ tier: "all" }))).toEqual([]);
  });

  it("names a single concept, and counts several", () => {
    expect(describeCreativeFilters(state({ conceptNames: ["Proof-led"] }))[0]).toBe("Proof-led");
    expect(describeCreativeFilters(state({ conceptNames: ["a", "b", "c"] }))[0]).toBe("3 concepts");
  });

  it("reports every active filter · one phrase each, none swallowed", () => {
    const all = describeCreativeFilters(
      state({ minSpendUsd: 25, tier: "bottom25", conceptNames: ["a", "b"] }),
    );
    expect(all).toHaveLength(3);
  });
});
