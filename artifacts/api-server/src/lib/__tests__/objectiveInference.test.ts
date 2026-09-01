// The objective is DERIVED from the data, never configured (owner decision
// 2026-09-01). These cases are the real per-account result-type distributions
// from the live seed, not invented shapes — the threshold was calibrated
// against them, so they are also what would catch it being retuned blindly.
import { describe, it, expect } from "vitest";
import {
  inferObjectives,
  classifyResultType,
  OBJECTIVE_MATERIALITY_SHARE,
  OBJECTIVE_MATERIALITY_SHARE_MAX,
} from "../cohortConfig";

/** Build `n` distinct ads all carrying the same result type. */
const ads = (spec: Record<string, number>) => {
  const out: { adKey: string; resultType: string }[] = [];
  let i = 0;
  for (const [resultType, n] of Object.entries(spec)) {
    for (let k = 0; k < n; k++) out.push({ adKey: `ad-${i++}`, resultType });
  }
  return out;
};

describe("classifyResultType", () => {
  it("maps the result types real accounts actually carry", () => {
    expect(classifyResultType("Website purchases")).toBe("ecommerce");
    expect(classifyResultType("Website checkouts initiated")).toBe("ecommerce");
    expect(classifyResultType("onb_initiate_checkout")).toBe("ecommerce");
    expect(classifyResultType("Leads (form)")).toBe("lead_gen");
    expect(classifyResultType("Website registrations completed")).toBe("lead_gen");
    expect(classifyResultType("Mobile app installs")).toBe("app");
  });

  it("returns null for anything that does not name a business outcome", () => {
    expect(classifyResultType("unknown")).toBeNull();
    expect(classifyResultType("")).toBeNull();
    expect(classifyResultType(null)).toBeNull();
    expect(classifyResultType(undefined)).toBeNull();
    expect(classifyResultType("Link clicks")).toBeNull();
    expect(classifyResultType("Landing page views")).toBeNull();
    // Deliberately unmapped: reads as a lead for SaaS, an activation for an app.
    expect(classifyResultType("Website trials started")).toBeNull();
  });
});

describe("inferObjectives — real account distributions", () => {
  it("East Coast Art Studio: purchases only → ecommerce", () => {
    expect(inferObjectives(ads({ "Website purchases": 66 })).objectives).toEqual(["ecommerce"]);
  });

  it("Bookster: app installs dominate → app, minor funnel events do not add objectives", () => {
    const r = inferObjectives(
      ads({
        "Mobile app installs": 57,
        "Website trials started": 5,
        "Website registrations completed": 3,
        onb_initiate_checkout: 2,
      }),
    );
    expect(r.objectives).toEqual(["app"]);
    // Trials are unclassified by design; registrations/checkout are classified
    // but immaterial, so they appear as evidence without becoming objectives.
    expect(r.unclassifiedResultTypes).toContain("Website trials started");
  });

  it("Fresh Import: 3 purchase ads against 50 lead ads is spillover, not ecommerce", () => {
    const r = inferObjectives(ads({ "Leads (form)": 50, "Website purchases": 3, unknown: 346 }));
    expect(r.objectives).toEqual(["lead_gen"]);
    expect(r.classifiedAds).toBe(53);
    expect(r.unclassifiedAds).toBe(346);
    // The purchase signal is still visible — suppressed, not hidden.
    const ecom = r.evidence.find((e) => e.objective === "ecommerce");
    expect(ecom?.material).toBe(false);
  });

  it("NEW AAFE: 48 purchase ads against 363 lead ads IS material → genuinely both", () => {
    const r = inferObjectives(ads({ "Leads (form)": 363, "Website purchases": 48, unknown: 13 }));
    expect(r.objectives).toEqual(["ecommerce", "lead_gen"]);
  });

  it("Crossval / BELT: nothing but unknown → undetermined, NOT a silent ecommerce default", () => {
    const r = inferObjectives(ads({ unknown: 64 }));
    expect(r.objectives).toEqual([]);
    expect(r.classifiedAds).toBe(0);
    expect(r.evidence).toEqual([]);
  });

  it("no data at all → undetermined", () => {
    expect(inferObjectives([]).objectives).toEqual([]);
  });
});

describe("inferObjectives — mechanics", () => {
  it("one ad is one vote: repeated rows for the same ad do not inflate it", () => {
    // 1 purchase ad split across 40 date/breakdown rows vs 5 distinct lead ads.
    const rows = [
      ...Array.from({ length: 40 }, () => ({ adKey: "ad-A", resultType: "Website purchases" })),
      ...ads({ "Leads (form)": 5 }),
    ];
    const r = inferObjectives(rows);
    expect(r.classifiedAds).toBe(6);
    expect(r.objectives).toEqual(["ecommerce", "lead_gen"]);
    expect(r.evidence.find((e) => e.objective === "ecommerce")?.ads).toBe(1);
  });

  it("the dominant objective survives — guaranteed by the threshold invariant", () => {
    // This is the property, and it holds BY CONSTRUCTION: shares sum to 1
    // across at most 4 objectives, so the top share is always >= 0.25. A
    // threshold above that could return [] for an account with real signal.
    // Mutation-testing caught the original guard branch here as unreachable
    // dead code, so the invariant is asserted directly instead.
    expect(OBJECTIVE_MATERIALITY_SHARE).toBeLessThanOrEqual(OBJECTIVE_MATERIALITY_SHARE_MAX);
    expect(inferObjectives(ads({ "Website purchases": 1, unknown: 900 })).objectives).toEqual(["ecommerce"]);
    // Every split of a 4-way tie still clears the bar.
    expect(
      inferObjectives(
        ads({ "Website purchases": 5, "Leads (form)": 5, "Mobile app installs": 5, "Appointments booked": 5 }),
      ).objectives,
    ).toEqual(["ecommerce", "lead_gen", "service", "app"]);
  });

  it("an ad's blank rows do not mask its real result type", () => {
    const r = inferObjectives([
      { adKey: "ad-A", resultType: null },
      { adKey: "ad-A", resultType: "Leads (form)" },
    ]);
    expect(r.objectives).toEqual(["lead_gen"]);
  });

  it("threshold is exclusive-of-nothing: exactly at the share counts as material", () => {
    // 1 of 10 = exactly OBJECTIVE_MATERIALITY_SHARE.
    expect(OBJECTIVE_MATERIALITY_SHARE).toBe(0.1);
    const r = inferObjectives(ads({ "Leads (form)": 9, "Website purchases": 1 }));
    expect(r.objectives).toEqual(["ecommerce", "lead_gen"]);
  });

  it("result is canonically ordered and stable regardless of input order", () => {
    const a = inferObjectives(ads({ "Mobile app installs": 30, "Leads (form)": 30 })).objectives;
    const b = inferObjectives(ads({ "Leads (form)": 30, "Mobile app installs": 30 })).objectives;
    expect(a).toEqual(b);
    expect(a).toEqual(["lead_gen", "app"]);
  });
});
