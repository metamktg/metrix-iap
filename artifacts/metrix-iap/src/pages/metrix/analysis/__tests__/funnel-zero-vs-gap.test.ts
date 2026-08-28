// Zero purchases is a finding. It is not the absence of one.
//
// buildFunnelStages used to do two coercions in opposite directions:
//
//     acc.purchases += r.purchases ?? 0     // a missing value counted as zero
//     value: s.v > 0 ? s.v : null           // and a real zero became "unmeasured"
//
// and the renderer then dropped nulls with `if (!stage.value) return null`.
// The net effect on an account with real traffic and no purchases was that
// the Purchase stage VANISHED from the buyer-intent funnel. A reader sees a
// funnel that stops at Add to cart and concludes the data ends there, when
// what actually happened is that nobody bought.
//
// Nothing caught it, because nothing tested it — the whole suite passed
// before and after the fix. That is the shape of every silent-fabrication
// bug on this codebase: the output looks complete, so no assertion notices
// it is wrong. These tests exist so this specific confusion cannot come
// back, and they assert on the DISTINCTION rather than on a rendering.

import { describe, it, expect } from "vitest";
import { buildFunnelStages } from "../EngagementFunnelView";
import type { DemographicRow } from "@/lib/data/seedTypes";

function row(over: Partial<DemographicRow> = {}): DemographicRow {
  return {
    cell_id: "c1",
    "Ad name": "AAFE_HK_Proof_v3",
    Age: "25-34",
    Gender: "female",
    "Amount spent (USD)": 100,
    Reach: 900,
    Impressions: 1000,
    Results: 10,
    "Clicks (all)": 80,
    "Link clicks": 40,
    CPA_result: 10,
    CTR_link_pct: 4,
    Result_per_link_click_pct: 25,
    ...over,
  };
}

const stageById = (rows: DemographicRow[], id: string) =>
  buildFunnelStages(rows).find((s) => s.id === id)!;

describe("buildFunnelStages separates a measured zero from an unmeasured stage", () => {
  it("keeps a measured zero as 0, not null", () => {
    // The export carried the column and every row genuinely totalled zero.
    // That is the single most important thing a buyer-intent funnel can say.
    const rows = [row({ purchases: 0 }), row({ purchases: 0 })];
    expect(stageById(rows, "purchases").value).toBe(0);
  });

  it("reports null when no row carried the field at all", () => {
    // Not an ecommerce export — the column does not exist. Null is correct
    // here, and it must be distinguishable from the case above.
    const rows = [row(), row()];
    expect(stageById(rows, "purchases").value).toBeNull();
  });

  it("reports null when only SOME rows carried the field", () => {
    // The platform's one aggregation-null policy (BUG-11): a sum is null
    // unless every contributing row carried the value. A partial sum renders
    // complete, compares against complete figures, and nothing about it looks
    // wrong — which is why it is worse than no sum.
    const rows = [row({ purchases: 5 }), row()];
    expect(stageById(rows, "purchases").value).toBeNull();
  });

  it("sums real values across rows", () => {
    const rows = [row({ adds_to_cart: 3 }), row({ adds_to_cart: 4 })];
    expect(stageById(rows, "atc").value).toBe(7);
  });
});

describe("step share is only computed when both ends are measured", () => {
  it("is null when the stage itself is unmeasured", () => {
    expect(stageById([row()], "purchases").pctOfPrev).toBeNull();
  });

  it("is null when the PREVIOUS stage is unmeasured", () => {
    // Checkout is measured, add-to-cart is not. A percentage here would be
    // derived from a denominator nobody measured — the old code produced one
    // anyway, because the missing stage had already been coerced to zero.
    const rows = [row({ checkouts_initiated: 2 })];
    const checkout = stageById(rows, "checkout");
    expect(stageById(rows, "atc").value).toBeNull();
    expect(checkout.value).toBe(2);
    expect(checkout.pctOfPrev).toBeNull();
  });

  it("is computed when both ends are measured", () => {
    const rows = [row({ adds_to_cart: 10, checkouts_initiated: 5 })];
    expect(stageById(rows, "checkout").pctOfPrev).toBeCloseTo(50, 5);
  });

  it("is null rather than Infinity when the previous stage measured zero", () => {
    // 5 of 0 has no percentage. Dividing anyway yields Infinity, which used
    // to be possible and would render as a number.
    const rows = [row({ adds_to_cart: 0, checkouts_initiated: 5 })];
    const checkout = stageById(rows, "checkout");
    expect(stageById(rows, "atc").value).toBe(0);
    expect(checkout.pctOfPrev).toBeNull();
  });
});

describe("the top of the funnel behaves the same way", () => {
  it("has no step share on the first stage", () => {
    expect(stageById([row()], "impressions").pctOfPrev).toBeNull();
  });

  it("keeps zero impressions as a measured zero", () => {
    // An ad set that spent and served nothing is a real, reportable state.
    expect(stageById([row({ Impressions: 0 })], "impressions").value).toBe(0);
  });
});
