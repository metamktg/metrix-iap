// Result-event grain (owner direction 2026-09-03): a concept that runs
// purchase ads AND a reach campaign gets one row per event, each judged
// against the same event's book baseline — and the reach row is judged on
// click-through, never on cost per result. Before this the two were one
// row with one blended CPA and a tier computed against a diluted baseline.
import { describe, expect, it } from "vitest";
import { buildConceptPerformanceRows, buildVariablePerformanceRows } from "../analysisEngine";

const extractConcept = (n: string) => (n.match(/^([A-Z]\d+)/)?.[1] ?? null);
const extractBook = (n: string) => (n.match(/(BOOK\d+)/)?.[1] ?? null);
const base = { accountId: "acct", runId: "run-1", dateStart: "2026-08-01", dateEnd: "2026-08-30" };
const conceptOpts = { ...base, libraryConcepts: new Set(["C2"]), extractConcept, extractBook, hasCopyForAd: () => false };

const purchases = (name: string, spend: number, results: number, clicks: number, imp: number, id?: string) => ({
  ad_name: name, meta_ad_id: id ?? null, result_type: "Website purchases", spend, results, link_clicks: clicks, impressions: imp,
});
const reach = (name: string, spend: number, results: number, clicks: number, imp: number) => ({
  ad_name: name, meta_ad_id: null, result_type: "Reach", spend, results, link_clicks: clicks, impressions: imp,
});

describe("buildConceptPerformanceRows — one row per (concept, event)", () => {
  const rows = [
    purchases("C2A_HK_BOOK1", 500, 25, 250, 50000), // $20 CPA
    purchases("C3A_HK_BOOK1", 500, 10, 100, 50000), // $50 CPA
    reach("C2A_HK_BOOK1", 100, 40000, 300, 40000),  // 0.75% CTR
    reach("C3A_HK_BOOK1", 100, 40000, 100, 40000),  // 0.25% CTR
    { ad_name: "C4A_HK_BOOK1", result_type: "unknown", spend: 50, results: 0, link_clicks: 5, impressions: 1000 },
  ];
  const out = buildConceptPerformanceRows(rows, conceptOpts);

  it("never folds a reach campaign into a purchase row", () => {
    const c2 = out.filter((r) => r.concept === "C2");
    expect(c2.map((r) => r.result_type).sort()).toEqual(["Reach", "Website purchases"]);
    const c2p = c2.find((r) => r.result_type === "Website purchases")!;
    expect(c2p.results).toBe(25);
    expect(c2p.cpa).toBe(20);
    expect(c2p.intent_class).toBe("conversion");
    expect(c2p.lift_basis).toBe("cpa");
  });

  it("judges purchase rows against the purchase baseline of the same book", () => {
    // Book baseline for purchases: $1,000 / 35 = $28.57. C2 at $20 is 30% cheaper → Scale; C3 at $50 is 75% dearer → Eliminate.
    const c2p = out.find((r) => r.concept === "C2" && r.result_type === "Website purchases")!;
    const c3p = out.find((r) => r.concept === "C3" && r.result_type === "Website purchases")!;
    expect(Number(c2p.performance_lift_vs_baseline)).toBeCloseTo(0.3, 2);
    expect(c2p.performance_tier).toBe("1 - Scale Winners");
    expect(c3p.performance_tier).toBe("4 - Eliminate");
    expect(c2p.buying_intent_score).toBe(25 * 10 + 250);
  });

  it("judges reach rows on click-through against the reach baseline, with no intent score", () => {
    // Reach baseline CTR: 400 / 80,000 = 0.5%. C2 at 0.75% is +50% → Scale; C3 at 0.25% is −50% → Eliminate.
    const c2r = out.find((r) => r.concept === "C2" && r.result_type === "Reach")!;
    const c3r = out.find((r) => r.concept === "C3" && r.result_type === "Reach")!;
    expect(c2r.intent_class).toBe("awareness");
    expect(c2r.lift_basis).toBe("link_ctr");
    expect(Number(c2r.performance_lift_vs_baseline)).toBeCloseTo(0.5, 2);
    expect(c2r.performance_tier).toBe("1 - Scale Winners");
    expect(c3r.performance_tier).toBe("4 - Eliminate");
    expect(c2r.buying_intent_score).toBeNull();
    // cost per ThruPlay-style result is still a fact of the row, just not its verdict
    expect(c2r.cpa).toBeCloseTo(100 / 40000, 6);
    expect(c2r.impressions).toBe(40000);
  });

  it("keeps an unplaced result type visible on its own row with no intent", () => {
    const c4 = out.find((r) => r.concept === "C4")!;
    expect(c4.result_type).toBe("unknown");
    expect(c4.intent_class).toBeNull();
    // No scale, no verdict: an unplaced event cannot be judged, so the tier stays null rather than "Eliminate".
    expect(c4.performance_tier).toBeNull();
    expect(c4.performance_lift_vs_baseline).toBeNull();
    expect(c4.mapped_in_library).toBe(false);
    expect(out.find((r) => r.concept === "C2")!.mapped_in_library).toBe(true);
  });

  it("returns nothing for rows without a concept code", () => {
    expect(buildConceptPerformanceRows([purchases("no-code-ad", 10, 1, 1, 10)], conceptOpts)).toEqual([]);
  });
});

describe("buildVariablePerformanceRows — one row per (token, event), distinct ads", () => {
  it("splits a token by the event it ran under and counts ads, not ad-days", () => {
    const rows = [
      purchases("C2A_STC_QF_BOOK1_T1", 100, 5, 20, 1000, "111"),
      purchases("C2A_STC_QF_BOOK1_T1", 100, 5, 20, 1000, "111"), // second day, same ad
      purchases("C2B_STC_BOOK1_T1", 50, 1, 10, 500, "112"),
      reach("C2C_STC_BOOK1_T1", 30, 3000, 30, 3000),
    ];
    const out = buildVariablePerformanceRows(rows, base);
    const stc = out.filter((r) => r.variable_id === "STC");
    expect(stc.map((r) => r.result_type).sort()).toEqual(["Reach", "Website purchases"]);
    const stcP = stc.find((r) => r.result_type === "Website purchases")!;
    expect(stcP.payload["Amount spent (USD)"]).toBe(250);
    expect(stcP.payload.Results).toBe(11);
    expect(stcP.payload.unique_ads).toBe(2); // 111 (two days) + 112
    expect(stcP.intent_class).toBe("conversion");
    const stcR = stc.find((r) => r.result_type === "Reach")!;
    expect(stcR.payload.unique_ads).toBe(1);
    expect(stcR.intent_class).toBe("awareness");
    expect(out.find((r) => r.variable_id === "QF")!.payload["Result type"]).toBe("Website purchases");
    // cell codes, BOOK labels and test rounds are never tokens
    expect(out.some((r) => ["C2A", "BOOK1", "T1"].includes(r.variable_id))).toBe(false);
  });

  it("folds rows with no result type under the engine's 'unknown' name rather than dropping them", () => {
    const out = buildVariablePerformanceRows([{ ad_name: "C1A_HK_BOOK0", spend: 10, results: 0, link_clicks: 2, impressions: 100 }], base);
    expect(out).toHaveLength(1);
    expect(out[0]!.result_type).toBe("unknown");
    expect(out[0]!.intent_class).toBeNull();
  });
});
