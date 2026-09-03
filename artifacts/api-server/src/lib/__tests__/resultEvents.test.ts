// Awareness and purchase-intent events are never weighted against each
// other (owner direction 2026-09-03). These cases use the result types the
// live accounts actually carry plus Meta's documented awareness / traffic
// vocabulary, so a retuned rule that moved a ThruPlay next to a purchase
// would fail here first.
import { describe, expect, it } from "vitest";
import {
  blendableEvents,
  classifyResultEvent,
  communicationGaps,
  communicationSignals,
  comparableEvents,
  INTENT_CLASSES,
  intentOf,
  partitionByIntent,
  RESULT_EVENTS,
} from "../resultEvents";

describe("classifyResultEvent — the strings real accounts carry", () => {
  it("places every live result type", () => {
    expect(classifyResultEvent("Website purchases").key).toBe("purchase");
    expect(classifyResultEvent("Website checkouts initiated").key).toBe("initiate_checkout");
    expect(classifyResultEvent("onb_initiate_checkout").key).toBe("initiate_checkout");
    expect(classifyResultEvent("Leads (form)").key).toBe("lead");
    expect(classifyResultEvent("Website registrations completed").key).toBe("registration");
    expect(classifyResultEvent("Mobile app installs").key).toBe("app_install");
    expect(classifyResultEvent("Website trials started").key).toBe("trial");
    expect(classifyResultEvent("Website adds to cart").key).toBe("add_to_cart");
    expect(classifyResultEvent("Website subscriptions").key).toBe("subscription");
    expect(classifyResultEvent("App activations").key).toBe("app_activation");
  });

  it("places Meta's awareness and traffic vocabulary on the other scales", () => {
    expect(intentOf("ThruPlays")).toBe("awareness");
    expect(intentOf("2-second continuous video plays")).toBe("awareness");
    expect(intentOf("Post engagements")).toBe("awareness");
    expect(intentOf("Page likes")).toBe("awareness");
    expect(intentOf("Reach")).toBe("awareness");
    expect(intentOf("Estimated ad recall lift (people)")).toBe("awareness");
    expect(intentOf("Impressions")).toBe("awareness");
    expect(intentOf("Link clicks")).toBe("consideration");
    expect(intentOf("Landing page views")).toBe("consideration");
    expect(intentOf("Website content views")).toBe("consideration");
    expect(intentOf("Clicks (all)")).toBe("consideration");
  });

  it("keeps order-sensitive names apart", () => {
    // "ThruPlays" contains "Plays"; "Link clicks" contains "clicks"; "Landing page views" contains "views".
    expect(classifyResultEvent("ThruPlays").key).toBe("thruplay");
    expect(classifyResultEvent("Video plays").key).toBe("video_view");
    expect(classifyResultEvent("Link clicks").key).toBe("link_click");
    expect(classifyResultEvent("Clicks (all)").key).toBe("click");
    expect(classifyResultEvent("Landing page views").key).toBe("landing_page_view");
    expect(classifyResultEvent("Messaging conversations started").key).toBe("messaging_conversation");
  });

  it("never guesses: unknown and custom names get no intent and no scale", () => {
    for (const raw of ["unknown", "", null, undefined]) {
      const c = classifyResultEvent(raw);
      expect(c.key).toBe("unknown");
      expect(c.intent).toBeNull();
      expect(c.scale).toBeNull();
    }
    const custom = classifyResultEvent("xyz_special_thing");
    expect(custom.key).toBe("custom");
    expect(custom.intent).toBeNull();
    expect(custom.raw).toBe("xyz_special_thing");
  });

  it("carries the scale of its class", () => {
    expect(classifyResultEvent("Website purchases").scale).toBe("cost_per_result");
    expect(classifyResultEvent("ThruPlays").scale).toBe("communication");
    expect(INTENT_CLASSES.awareness.scale).toBe("communication");
    expect(INTENT_CLASSES.conversion.rankOn[0]).toBe("cpa");
    expect(INTENT_CLASSES.awareness.rankOn).not.toContain("cpa");
  });

  it("names every event key it can emit", () => {
    for (const key of Object.keys(RESULT_EVENTS)) expect(RESULT_EVENTS[key as keyof typeof RESULT_EVENTS].label).toBeTruthy();
  });
});

describe("comparableEvents — what may be ranked against what", () => {
  it("is the same event only", () => {
    expect(comparableEvents("Website purchases", "Purchases")).toBe(true);
    expect(comparableEvents("Website purchases", "Leads (form)")).toBe(false);
    expect(comparableEvents("Website purchases", "ThruPlays")).toBe(false);
    expect(comparableEvents("ThruPlays", "Reach")).toBe(false);
  });
  it("never compares an unplaced row", () => {
    expect(comparableEvents("unknown", "unknown")).toBe(false);
    expect(comparableEvents("xyz_custom", "xyz_custom")).toBe(false);
    expect(comparableEvents("Website purchases", "unknown")).toBe(false);
  });
});

describe("partitionByIntent", () => {
  it("splits rows into classes in display order and keeps unplaced rows visible", () => {
    const rows = [
      { t: "ThruPlays" }, { t: "Website purchases" }, { t: "unknown" }, { t: "Link clicks" }, { t: "Leads (form)" },
    ];
    const p = partitionByIntent(rows, (r) => r.t);
    expect(p.classes.map((c) => c.intent)).toEqual(["conversion", "consideration", "awareness"]);
    expect(p.classes[0]!.rows.map((r) => r.t)).toEqual(["Website purchases", "Leads (form)"]);
    expect(p.unplaced.map((r) => r.t)).toEqual(["unknown"]);
  });
});

describe("communication signals and gap analysis", () => {
  const sig = (spend: number, imp: number, reach: number, link: number, all: number, results: number) =>
    communicationSignals({ spend, impressions: imp, reach, linkClicks: link, clicksAll: all, results });

  it("computes the awareness scale and nulls what is physically impossible", () => {
    const s = sig(100, 10000, 5000, 100, 150, 2000);
    expect(s.cpm).toBe(10);
    expect(s.linkCtrPct).toBe(1);
    expect(s.ctrAllPct).toBe(1.5);
    expect(s.frequency).toBe(2);
    expect(s.costPerReach).toBe(0.02);
    expect(s.resultRatePct).toBe(20);
    const bad = communicationSignals({ spend: 10, impressions: 100, reach: 500, linkClicks: 900, clicksAll: null, results: null });
    expect(bad.linkCtrPct).toBeNull(); // clicks above impressions
    expect(bad.frequency).toBeNull(); // reach above impressions
    expect(bad.ctrAllPct).toBeNull();
    expect(bad.resultRatePct).toBeNull();
    expect(communicationSignals({ spend: 10, impressions: 0, reach: 0, linkClicks: 0, clicksAll: 0, results: 0 }).cpm).toBeNull();
  });

  it("names the signal that trails the class median, direction-aware, and never against another class", () => {
    const cls = [sig(100, 10000, 5000, 100, 150, 2000), sig(100, 10000, 5000, 120, 160, 2200), sig(100, 10000, 5000, 110, 155, 2100)];
    const weak = sig(200, 10000, 2500, 40, 60, 900); // double CPM, four times the frequency, weak CTR, weak result rate
    const { gaps, strengths } = communicationGaps(weak, [...cls, weak]);
    const names = gaps.map((g) => g.signal);
    expect(names).toContain("cpm");
    expect(names).toContain("linkCtrPct");
    expect(names).toContain("frequency");
    expect(names).toContain("resultRatePct");
    for (const g of gaps) expect(g.index).toBeLessThan(0.8);
    expect(strengths).toEqual([]);
    const strong = sig(50, 10000, 8000, 200, 300, 4000);
    const s2 = communicationGaps(strong, [...cls, strong]);
    expect(s2.gaps).toEqual([]);
    expect(s2.strengths.map((g) => g.signal)).toContain("linkCtrPct");
  });

  it("has nothing to say for a class of one", () => {
    const only = sig(100, 10000, 5000, 100, 150, 2000);
    expect(communicationGaps(only, [only])).toEqual({ gaps: [], strengths: [] });
  });
});

describe("blendableEvents — what may become one blended total", () => {
  it("blends terminal conversion events only, and only two or more", () => {
    expect(blendableEvents(["Website purchases", "Leads (form)", "ThruPlays", "Website adds to cart"])).toEqual(["Website purchases", "Leads (form)"]);
    expect(blendableEvents(["Website purchases", "Website checkouts initiated"])).toEqual([]);
    expect(blendableEvents(["Website purchases"])).toEqual([]);
    expect(blendableEvents(["ThruPlays", "Reach"])).toEqual([]);
    expect(blendableEvents(["unknown", "Website purchases", "Website purchases"])).toEqual([]);
  });
  it("marks funnel steps intermediate and outcomes terminal", () => {
    expect(classifyResultEvent("Website adds to cart").stage).toBe("intermediate");
    expect(classifyResultEvent("Website checkouts initiated").stage).toBe("intermediate");
    expect(classifyResultEvent("Website purchases").stage).toBe("terminal");
    expect(classifyResultEvent("Leads (form)").stage).toBe("terminal");
    expect(classifyResultEvent("Link clicks").stage).toBe("intermediate");
    expect(classifyResultEvent("unknown").stage).toBeNull();
  });
});
