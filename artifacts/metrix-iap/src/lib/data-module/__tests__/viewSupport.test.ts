// ─── The Universal Data Module's central promise ──────────────────────
//
// Phase 3 §04 acceptance: components "only offer views their data shape
// actually supports". These pin the cases where offering the wrong view would
// fabricate — which is what makes this a correctness rule and not a taste one.

import { describe, it, expect } from "vitest";
import {
  viewsFor, whyNot, viewsForAny, canRenderAsPie, ALL_VIEWS, MAX_PIE_SLICES,
  type DataShape, type DataView,
} from "../viewSupport";

const SHAPES: DataShape[] = [
  "performance_by_cell", "concept_rollup", "v3_variable_performance",
  "top_checkout_variables", "demographic_registration_signal", "v3_placement_signal",
  "device_delivery_signal", "conversion_tracking_signal", "historical_matrix_4x4",
  "icp_profiles", "daily_series",
];

describe("viewSupport — the §02 table", () => {
  it("matches the master plan for every shape it names", () => {
    // Breakdown is here because the rows carry book2_concept_name and
    // funnel_stage_variable — see the note in viewSupport.
    expect(viewsFor("performance_by_cell")).toEqual(["trend", "compare", "breakdown", "table"]);
    expect(viewsFor("concept_rollup")).toEqual(["trend", "compare", "table"]);
    expect(viewsFor("v3_variable_performance")).toEqual(["compare", "breakdown", "table"]);
    expect(viewsFor("top_checkout_variables")).toEqual(["compare", "breakdown", "table"]);
    expect(viewsFor("v3_placement_signal")).toEqual(["compare", "breakdown", "table"]);
    expect(viewsFor("device_delivery_signal")).toEqual(["compare", "breakdown", "table"]);
    expect(viewsFor("historical_matrix_4x4")).toContain("map");
    expect(viewsFor("icp_profiles")).toContain("map");
  });

  it("returns views in one stable order regardless of shape", () => {
    for (const shape of SHAPES) {
      const got = viewsFor(shape);
      const expected = ALL_VIEWS.filter((v) => got.includes(v));
      expect(got).toEqual(expected);
    }
  });

  it("gives every shape at least a table", () => {
    for (const shape of SHAPES) expect(viewsFor(shape)).toContain("table");
  });
});

describe("viewSupport — the exclusions that prevent fabrication", () => {
  it("refuses a trend over window totals, which would invent a trajectory", () => {
    for (const shape of ["v3_variable_performance", "v3_placement_signal", "demographic_registration_signal"] as DataShape[]) {
      expect(viewsFor(shape)).not.toContain("trend");
      expect(whyNot(shape, "trend")).toMatch(/day series|window/i);
    }
  });

  it("refuses a funnel over rows with no stage counts", () => {
    for (const shape of ["performance_by_cell", "concept_rollup", "v3_placement_signal", "historical_matrix_4x4"] as DataShape[]) {
      expect(viewsFor(shape)).not.toContain("funnel");
      expect(whyNot(shape, "funnel")).toBeTruthy();
    }
  });

  it("refuses a ranked compare over the matrix, which would discard its position", () => {
    expect(viewsFor("historical_matrix_4x4")).not.toContain("compare");
    expect(whyNot("historical_matrix_4x4", "compare")).toMatch(/position|matrix/i);
  });

  it("refuses compare on the conversion signal, where spend is not attributable", () => {
    expect(viewsFor("conversion_tracking_signal")).not.toContain("compare");
    expect(whyNot("conversion_tracking_signal", "compare")).toMatch(/attributable/i);
  });

  it("explains every exclusion rather than silently hiding the control", () => {
    for (const shape of SHAPES) {
      const supported = viewsFor(shape);
      for (const view of ALL_VIEWS.filter((v) => !supported.includes(v))) {
        const reason = whyNot(shape, view);
        expect(reason, `${shape} → ${view}`).toBeTruthy();
        expect(reason!.length, `${shape} → ${view}`).toBeGreaterThan(20);
      }
    }
  });

  it("returns null for a view that IS supported", () => {
    expect(whyNot("performance_by_cell", "trend")).toBeNull();
    expect(whyNot("historical_matrix_4x4", "map")).toBeNull();
  });
});

describe("viewSupport — several shapes on one surface", () => {
  it("unions rather than intersects, so no shape loses a view it can back", () => {
    const got = viewsForAny(["v3_placement_signal", "daily_series"]);
    expect(got).toContain("trend");      // only daily_series backs this
    expect(got).toContain("breakdown");  // only the placement rows back this
  });

  it("still returns the stable order", () => {
    expect(viewsForAny(["historical_matrix_4x4", "daily_series", "v3_variable_performance"]))
      .toEqual(ALL_VIEWS.filter((v) => ["trend", "compare", "breakdown", "map", "table"].includes(v)));
  });

  it("handles a single shape and an empty list", () => {
    expect(viewsForAny(["icp_profiles"])).toEqual(viewsFor("icp_profiles"));
    expect(viewsForAny([])).toEqual([]);
  });
});

describe("viewSupport — the donut rule", () => {
  it("allows a pie only up to five slices", () => {
    expect(canRenderAsPie(2)).toBe(true);
    expect(canRenderAsPie(MAX_PIE_SLICES)).toBe(true);
    // §02: "Placements never gets a 7-slice donut".
    expect(canRenderAsPie(MAX_PIE_SLICES + 1)).toBe(false);
    expect(canRenderAsPie(7)).toBe(false);
  });

  it("refuses a pie of one, which is a full circle stating nothing", () => {
    expect(canRenderAsPie(1)).toBe(false);
    expect(canRenderAsPie(0)).toBe(false);
  });
});
