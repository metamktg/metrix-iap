// ─── funnelStages unit tests ──────────────────────────────────────────
// Covers stage config look-up, tile ID lists, sort keys, the "custom"
// fallback path, and — the G7 rule — that the lower-funnel preset is built
// from the result events an account actually carries: no add-to-cart or
// checkout tile for an account with no such event.

import { describe, it, expect } from "vitest";
import {
  getFunnelStageConfig,
  lowerFunnelTileIds,
  FUNNEL_STAGE_CONFIGS,
  type FunnelStage,
} from "../funnelStages";

describe("FUNNEL_STAGE_CONFIGS", () => {
  it("upper stage has reach, impressions, link_clicks, link_ctr tile IDs", () => {
    const cfg = FUNNEL_STAGE_CONFIGS.upper;
    expect(cfg.tileIds).toContain("lib_reach");
    expect(cfg.tileIds).toContain("lib_impressions");
    expect(cfg.tileIds).toContain("lib_link_clicks");
    expect(cfg.tileIds).toContain("lib_link_ctr");
  });

  it("upper stage sorts by CTR descending (higher-better)", () => {
    expect(FUNNEL_STAGE_CONFIGS.upper.sortKey).toBe("ctr");
    expect(FUNNEL_STAGE_CONFIGS.upper.sortDir).toBe("desc");
  });

  it("lower stage's context-free base is the scope's result metrics only — no funnel step assumed", () => {
    const cfg = FUNNEL_STAGE_CONFIGS.lower;
    expect(cfg.tileIds).toEqual(["lib_spend", "lib_results", "lib_cpa", "lib_cvr"]);
    expect(cfg.tileIds).not.toContain("lib_atc_rate");
    expect(cfg.tileIds).not.toContain("lib_checkout_rate");
  });

  it("lower stage sorts by CPA ascending (lower-better)", () => {
    expect(FUNNEL_STAGE_CONFIGS.lower.sortKey).toBe("cpa");
    expect(FUNNEL_STAGE_CONFIGS.lower.sortDir).toBe("asc");
  });
});

describe("lowerFunnelTileIds · built from the events present", () => {
  it("adds the ATC and checkout tiles only for an account carrying those events, in funnel order", () => {
    expect(lowerFunnelTileIds({ events: ["Website purchases", "onb_initiate_checkout", "Adds to cart"] }))
      .toEqual(["lib_spend", "lib_results", "lib_cpa", "lib_cvr", "lib_checkout_rate", "lib_atc_rate"]);
  });

  it("gives a lead-gen account no cart or checkout tile", () => {
    const ids = lowerFunnelTileIds({ events: ["Leads (form)", "Landing page views"] });
    expect(ids).toEqual(["lib_spend", "lib_results", "lib_cpa", "lib_cvr"]);
  });

  it("classifies a custom checkout event through the taxonomy and adds the tile once", () => {
    const ids = lowerFunnelTileIds({ events: ["onb_initiate_checkout", "Checkouts initiated"] });
    expect(ids.filter((id) => id === "lib_checkout_rate")).toHaveLength(1);
  });

  it("leads with the event's own rate and CPM — never cost per result — under a communication scope", () => {
    const ids = lowerFunnelTileIds({ events: ["ThruPlays"], scale: "communication" });
    expect(ids).toEqual(["lib_spend", "lib_results", "lib_result_rate", "lib_cpm"]);
    expect(ids).not.toContain("lib_cpa");
  });
});

describe("getFunnelStageConfig", () => {
  it("returns upper config for 'upper'", () => {
    const cfg = getFunnelStageConfig("upper");
    expect(cfg).not.toBeNull();
    expect(cfg!.label).toBe("Upper Funnel");
    expect(cfg!.badge).toBe("UPPER FUNNEL");
  });

  it("returns lower config for 'lower', built from the context", () => {
    const cfg = getFunnelStageConfig("lower", { events: ["Website purchases", "Adds to cart"] });
    expect(cfg).not.toBeNull();
    expect(cfg!.label).toBe("Lower Funnel");
    expect(cfg!.tileIds).toContain("lib_atc_rate");
    expect(cfg!.tileIds).not.toContain("lib_checkout_rate");
  });

  it("sorts the lower stage on link CTR, descending, under a communication scope", () => {
    const cfg = getFunnelStageConfig("lower", { events: ["ThruPlays"], scale: "communication" })!;
    expect(cfg.sortKey).toBe("ctr");
    expect(cfg.sortDir).toBe("desc");
  });

  it("returns null for 'custom'", () => {
    expect(getFunnelStageConfig("custom")).toBeNull();
  });

  it("all named stages have at least one tile ID", () => {
    const stages: FunnelStage[] = ["upper", "lower"];
    for (const stage of stages) {
      const cfg = getFunnelStageConfig(stage);
      expect(cfg!.tileIds.length).toBeGreaterThan(0);
    }
  });
});
