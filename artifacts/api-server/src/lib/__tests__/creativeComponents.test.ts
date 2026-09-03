// ─── Creative components: weighting, merge precedence, evidence ───────
// Pure module, no environment. Every formula the UI will show a number for
// is pinned here, and every honesty rule (null cost with no results, an
// ad with unknown copy still in the denominator) has a case.

import { describe, it, expect } from "vitest";
import {
  adKey,
  confidenceScore,
  creativeInputFromMetadata,
  evidenceGrade,
  hasCopy,
  mergeCreativeInputs,
  volumeConfidence,
  weightCreativeComponents,
  type AdCreativeInput,
  type AdMetricInput,
} from "../creativeComponents";

const meta = (adName: string, body: string | null, headline: string | null, cta?: string) => ({
  "Ad creative body text": body,
  "Ad creative headline": headline,
  "Ad creative call to action type": cta ?? null,
});

describe("creativeInputFromMetadata", () => {
  it("maps the export columns to component fields and tags the source", () => {
    const i = creativeInputFromMetadata("A1", "123", {
      ...meta("A1", "  Save   time ", "Big headline", "SHOP_NOW"),
      "Ad creative link caption": "example.com",
      "Ad creative link destination": "https://example.com/x",
      "Image name": "img.png",
    })!;
    expect(i).toMatchObject({
      ad_name: "A1", meta_ad_id: "123", primary_text: "Save time", headline: "Big headline",
      cta_type: "SHOP_NOW", description: "example.com", link_destination: "https://example.com/x",
      image_name: "img.png", source: "performance_export",
    });
    expect(hasCopy(i)).toBe(true);
  });

  it("returns null for an empty or whitespace-only blob — no copy is not empty copy", () => {
    expect(creativeInputFromMetadata("A1", null, null)).toBeNull();
    expect(creativeInputFromMetadata("A1", null, {})).toBeNull();
    expect(creativeInputFromMetadata("A1", null, { "Ad creative headline": "   " })).toBeNull();
  });

  it("an input with only an image name has no weightable copy", () => {
    const i = creativeInputFromMetadata("A1", null, { "Image name": "x.png" })!;
    expect(i).not.toBeNull();
    expect(hasCopy(i)).toBe(false);
  });
});

describe("mergeCreativeInputs", () => {
  it("resolves per field by precedence: uploaded asset > meta api > export", () => {
    const exportIn: AdCreativeInput = { ad_name: "A1", headline: "Export headline", primary_text: "Export body", source: "performance_export" };
    const apiIn: AdCreativeInput = { ad_name: "A1", headline: "API headline", source: "meta_api" };
    const merged = mergeCreativeInputs([exportIn], [apiIn]);
    const a1 = merged.get("A1")!;
    expect(a1.headline).toBe("API headline");
    expect(a1.primary_text).toBe("Export body");
    expect(a1.source).toBe("meta_api");
  });

  it("keys on the Meta ad id when present, else the ad name", () => {
    expect(adKey({ ad_name: "A", meta_ad_id: "9" })).toBe("9");
    expect(adKey({ ad_name: "A", meta_ad_id: null })).toBe("A");
  });
});

describe("weightCreativeComponents", () => {
  const inputs: AdCreativeInput[] = [
    { ad_name: "A1", headline: "Fast delivery", primary_text: "Body one", cta_type: "SHOP_NOW", source: "performance_export" },
    { ad_name: "A2", headline: "Fast delivery", primary_text: "Body two", cta_type: "SHOP_NOW", source: "performance_export" },
    { ad_name: "A3", headline: "Free returns", primary_text: "Body three", cta_type: "LEARN_MORE", source: "performance_export" },
  ];
  // A4 has metrics but no known copy.
  const metrics: AdMetricInput[] = [
    { ad_name: "A1", spend: 300, results: 30, impressions: 10000, link_clicks: 200, result_type: "purchase" },
    { ad_name: "A1", spend: 300, results: 30, impressions: 10000, link_clicks: 200, result_type: "purchase" }, // second day
    { ad_name: "A2", spend: 200, results: 10, impressions: 8000, link_clicks: 80, result_type: "purchase" },
    { ad_name: "A3", spend: 400, results: 10, impressions: 20000, link_clicks: 100, result_type: "purchase" },
    { ad_name: "A4", spend: 100, results: 5, impressions: 3000, link_clicks: 30, result_type: "lead" },
  ];
  const w = weightCreativeComponents(inputs, metrics);

  it("folds per-day rows per ad before aggregating", () => {
    const fast = w.families.headline.find((r) => r.value === "Fast delivery")!;
    expect(fast.ads).toBe(2);
    expect(fast.spend).toBe(800);
    expect(fast.results).toBe(70);
  });

  it("coverage counts the ad with unknown copy in the denominator, spend-weighted", () => {
    expect(w.coverage.ads_total).toBe(4);
    expect(w.coverage.ads_with_copy).toBe(3);
    expect(w.coverage.spend_total).toBe(1300);
    expect(w.coverage.spend_with_copy).toBe(1200);
    expect(w.coverage.coverage).toBeCloseTo(1200 / 1300, 4);
    expect(w.coverage.by_family.headline).toBe(3);
    expect(w.coverage.sources).toEqual(["performance_export"]);
  });

  it("uses the covered set's own baseline for the efficiency index", () => {
    // covered: spend 1200, results 80 → baseline 15
    expect(w.baseline.cost_per_result).toBe(15);
    const fast = w.families.headline.find((r) => r.value === "Fast delivery")!;
    expect(fast.cost_per_result).toBeCloseTo(800 / 70, 4);
    expect(fast.efficiency_index).toBeCloseTo(15 / (800 / 70), 4);
  });

  it("weight is result share × efficiency index, normalised so the family's best is 1", () => {
    const [first, second] = w.families.headline;
    expect(first!.value).toBe("Fast delivery");
    expect(first!.weight).toBe(1);
    expect(first!.rank).toBe(1);
    expect(second!.value).toBe("Free returns");
    // result_share 10/80, efficiency 15/40
    expect(second!.weight).toBeCloseTo(((10 / 80) * (15 / 40)) / ((70 / 80) * (15 / (800 / 70))), 3);
    expect(second!.rank).toBe(2);
  });

  it("CTA family groups by value, case and whitespace insensitive, and carries result types", () => {
    const shop = w.families.cta_type.find((r) => r.value === "SHOP_NOW")!;
    expect(shop.ads).toBe(2);
    expect(shop.result_types).toEqual(["purchase"]);
  });

  it("a component with spend and no results has null cost per result and zero weight, never $0", () => {
    const w2 = weightCreativeComponents(
      [{ ad_name: "Z", headline: "No results yet", source: "performance_export" }],
      [{ ad_name: "Z", spend: 50, results: 0, impressions: 1000, link_clicks: 5 }],
    );
    const z = w2.families.headline[0]!;
    expect(z.cost_per_result).toBeNull();
    expect(z.efficiency_index).toBeNull();
    expect(z.weight).toBe(0);
    expect(z.confidence).toBe("validation_required");
    expect(w2.baseline.cost_per_result).toBeNull();
  });

  it("scopes result math to the dominant intent class: a reach campaign never inflates results or deflates cost per purchase", () => {
    const w4 = weightCreativeComponents(
      [
        { ad_name: "P1", headline: "Fast delivery", source: "performance_export" },
        { ad_name: "R1", headline: "Fast delivery", source: "performance_export" },
      ],
      [
        { ad_name: "P1", spend: 300, results: 30, impressions: 10000, link_clicks: 200, result_type: "Website purchases" },
        { ad_name: "R1", spend: 100, results: 40000, impressions: 40000, link_clicks: 100, result_type: "Reach" },
      ],
    );
    expect(w4.scope.intent_class).toBe("conversion");
    expect(w4.scope.result_types).toEqual(["Website purchases"]);
    expect(w4.scope.excluded_result_types).toEqual(["Reach"]);
    const fast = w4.families.headline[0]!;
    expect(fast.ads).toBe(2); // delivery covers both ads
    expect(fast.spend).toBe(400);
    expect(fast.results).toBe(30); // the 40,000 people reached are not results on this scale
    expect(fast.cost_per_result).toBe(10); // $300 of purchase spend ÷ 30, not $400 ÷ 40,030
    expect(fast.result_types.sort()).toEqual(["Reach", "Website purchases"]);
    expect(w4.baseline.cost_per_result).toBe(10);
  });

  it("with only unplaced events every event counts, as before", () => {
    const w5 = weightCreativeComponents(
      [{ ad_name: "U", headline: "Unknown", source: "performance_export" }],
      [{ ad_name: "U", spend: 50, results: 5, impressions: 1000, link_clicks: 5, result_type: "unknown" }],
    );
    expect(w5.scope.intent_class).toBeNull();
    expect(w5.families.headline[0]!.results).toBe(5);
    expect(w5.families.headline[0]!.cost_per_result).toBe(10);
  });

  it("no inputs at all yields empty families and zero coverage, not a throw", () => {
    const w3 = weightCreativeComponents([], metrics);
    expect(w3.families.headline).toEqual([]);
    expect(w3.coverage.coverage).toBe(0);
    expect(w3.coverage.ads_total).toBe(4);
  });
});

describe("confidence", () => {
  it("volume tiers match the engine's thresholds", () => {
    expect(volumeConfidence(500, 30)).toBe("high");
    expect(volumeConfidence(499, 30)).toBe("medium");
    expect(volumeConfidence(100, 5)).toBe("medium");
    expect(volumeConfidence(1, 1)).toBe("low");
    expect(volumeConfidence(1, 0)).toBe("validation_required");
    expect(volumeConfidence(0, 0)).toBe("validation_required");
  });

  it("evidence grade: 80% of spend is full, any is partial, none is none", () => {
    expect(evidenceGrade(1)).toBe("full");
    expect(evidenceGrade(0.8)).toBe("full");
    expect(evidenceGrade(0.79)).toBe("partial");
    expect(evidenceGrade(0.01)).toBe("partial");
    expect(evidenceGrade(0)).toBe("none");
  });

  it("score scales the tier by coverage with a 70% floor, and clamps coverage", () => {
    expect(confidenceScore("high", 1)).toBe(1);
    expect(confidenceScore("high", 0)).toBe(0.7);
    expect(confidenceScore("high", 0.5)).toBe(0.85);
    expect(confidenceScore("medium", 1)).toBe(0.7);
    expect(confidenceScore("medium", 0)).toBeCloseTo(0.49, 3);
    expect(confidenceScore("low", 1)).toBe(0.4);
    expect(confidenceScore("validation_required", 1)).toBe(0.1);
    expect(confidenceScore("high", 7)).toBe(1);
    expect(confidenceScore("high", Number.NaN)).toBe(0.7);
  });
});
