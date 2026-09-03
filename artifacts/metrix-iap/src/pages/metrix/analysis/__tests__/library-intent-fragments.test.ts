// ─── IAP Library header · intent summary fragments (G10) ──────────────
// `intent_summary` was assembled by the seed and rendered nowhere. It now
// reaches the ModuleHeader subtitle as "·"-separated fragments beside the
// scope — the dominant class and the unplaced-spend share — never a
// sentence on the first layer.

import { describe, it, expect } from "vitest";
import { intentSummaryFragments } from "../IapLibraryView";

describe("intentSummaryFragments", () => {
  it("names the dominant class and the unplaced spend share", () => {
    expect(intentSummaryFragments({ classes: [], dominant_intent: "conversion", unplaced_spend: 120, total_spend: 1000 }))
      .toEqual(["Conversion-led", "12% spend unplaced"]);
  });

  it("omits the unplaced fragment when every dollar was placed", () => {
    expect(intentSummaryFragments({ classes: [], dominant_intent: "awareness", unplaced_spend: 0, total_spend: 1000 }))
      .toEqual(["Awareness-led"]);
  });

  it("says <1% rather than rounding a real unplaced share to 0%", () => {
    expect(intentSummaryFragments({ classes: [], dominant_intent: "consideration", unplaced_spend: 3, total_spend: 1000 }))
      .toEqual(["Consideration-led", "<1% spend unplaced"]);
  });

  it("returns nothing when nothing was derived", () => {
    expect(intentSummaryFragments(undefined)).toEqual([]);
    expect(intentSummaryFragments({ classes: [], dominant_intent: null, unplaced_spend: 0, total_spend: 0 })).toEqual([]);
  });

  it("keeps every fragment inside the 56-character chrome limit", () => {
    for (const f of intentSummaryFragments({ classes: [], dominant_intent: "conversion", unplaced_spend: 999, total_spend: 1000 })) {
      expect(f.length).toBeLessThanOrEqual(56);
    }
  });
});
