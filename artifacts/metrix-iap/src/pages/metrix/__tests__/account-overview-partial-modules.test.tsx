// An account whose analysis produced only SOME modules must still render its
// overview. This is the contract that broke: `core_reanalysis_read` is one
// optional module, and gating the whole page on it turned the landing view
// into a false "Analysis data loading" screen for 7 of 9 seeded accounts —
// including the largest by spend, whose Ad Performance rendered $42k one
// click away. A missing module costs its own section, never the page.

import { describe, it, expect } from "vitest";
import { eventLabel, EVENT_LABEL } from "../shared";

describe("event labels name data-quality gaps honestly", () => {
  it("does not print the raw 'unknown' sentinel as if it were an event", () => {
    // The engine writes "unknown" for rows with no result_type. Whatever the
    // label is, it must not be the bare sentinel sitting among real events.
    expect(eventLabel("unknown")).not.toBe("unknown");
    expect(eventLabel("unknown").toLowerCase()).toContain("unclassified");
  });

  it("still labels real events by their reader-facing names", () => {
    expect(eventLabel("Website purchases")).toBe("Purchases");
    expect(eventLabel("onb_initiate_checkout")).toBe("Checkouts");
  });

  it("passes through an unmapped real event rather than inventing one", () => {
    // An event the map has never seen is shown as-is: better a raw Meta
    // string the reader can look up than a guess at what it means.
    expect(eventLabel("Website adds to cart")).toBe("Website adds to cart");
    expect(EVENT_LABEL["Website adds to cart"]).toBeUndefined();
  });
});
