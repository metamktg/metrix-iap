// ─── funnelStages unit tests ──────────────────────────────────────────
// Covers stage config look-up, tile ID lists, sort keys, and the
// "custom" fallback path.

import { describe, it, expect } from "vitest";
import {
  getFunnelStageConfig,
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

  it("lower stage has spend, results, cpa, cvr, atc_rate, checkout_rate tile IDs", () => {
    const cfg = FUNNEL_STAGE_CONFIGS.lower;
    expect(cfg.tileIds).toContain("lib_spend");
    expect(cfg.tileIds).toContain("lib_results");
    expect(cfg.tileIds).toContain("lib_cpa");
    expect(cfg.tileIds).toContain("lib_cvr");
    expect(cfg.tileIds).toContain("lib_atc_rate");
    expect(cfg.tileIds).toContain("lib_checkout_rate");
  });

  it("lower stage sorts by CPA ascending (lower-better)", () => {
    expect(FUNNEL_STAGE_CONFIGS.lower.sortKey).toBe("cpa");
    expect(FUNNEL_STAGE_CONFIGS.lower.sortDir).toBe("asc");
  });
});

describe("getFunnelStageConfig", () => {
  it("returns upper config for 'upper'", () => {
    const cfg = getFunnelStageConfig("upper");
    expect(cfg).not.toBeNull();
    expect(cfg!.label).toBe("Upper Funnel");
    expect(cfg!.badge).toBe("UPPER FUNNEL");
  });

  it("returns lower config for 'lower'", () => {
    const cfg = getFunnelStageConfig("lower");
    expect(cfg).not.toBeNull();
    expect(cfg!.label).toBe("Lower Funnel");
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
