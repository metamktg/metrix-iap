// ─── Which splits the rows can actually make ──────────────────────────
//
// viewSupport answers "can this shape back a Breakdown view?". Offering the
// view and then having nothing to break down by is the same failure one step
// later, so this table has to be checked the same way.

import { describe, it, expect } from "vitest";
import {
  dimensionsFor, distinctCount, whyNotDimension,
} from "../breakdownDimensions";
import { ALL_VIEWS, whyNot, type DataShape } from "../viewSupport";

const SHAPES: DataShape[] = [
  "performance_by_cell", "concept_rollup", "v3_variable_performance",
  "top_checkout_variables", "demographic_registration_signal",
  "v3_placement_signal", "device_delivery_signal", "conversion_tracking_signal",
  "historical_matrix_4x4", "icp_profiles", "daily_series",
];

describe("the two tables agree", () => {
  it("every shape that supports Breakdown offers at least one dimension", () => {
    for (const shape of SHAPES) {
      const supportsBreakdown = whyNot(shape, "breakdown") === null;
      if (!supportsBreakdown) continue;
      expect(
        dimensionsFor(shape).length,
        `${shape} offers the Breakdown view but no dimension to break down by`,
      ).toBeGreaterThan(0);
    }
  });

  it("no shape offers dimensions for a view it cannot back", () => {
    for (const shape of SHAPES) {
      if (dimensionsFor(shape).length === 0) continue;
      expect(
        whyNot(shape, "breakdown"),
        `${shape} lists breakdown dimensions but viewSupport excludes the view`,
      ).toBeNull();
    }
  });

  it("uses view keys the switcher knows about", () => {
    expect(ALL_VIEWS).toContain("breakdown");
  });
});

describe("distinctCount · a null is not a category", () => {
  const rows = [
    { Placement: "Feed", Gender: "male" },
    { Placement: "Reels", Gender: null },
    { Placement: "Feed", Gender: "" },
    { Placement: null, Gender: "female" },
  ];

  it("counts distinct present values", () => {
    expect(distinctCount(rows, "Placement")).toBe(2);
  });

  it("excludes nulls and empty strings rather than bucketing them", () => {
    // Bucketing them as "(none)" would make a column of absences look like a
    // real second category, and a two-bar chart out of one measured value.
    expect(distinctCount(rows, "Gender")).toBe(2);
  });

  it("returns 0 for a field the rows do not carry", () => {
    expect(distinctCount(rows, "Platform")).toBe(0);
  });
});

describe("whyNotDimension · the reason is about THESE rows", () => {
  it("refuses a dimension the rows do not carry", () => {
    expect(whyNotDimension(0)).toContain("no value");
  });

  it("refuses a single-valued dimension and says a breakdown would be one bar", () => {
    // An account running one placement has a Placement column with one value.
    // Splitting by it produces a single bar labelled "Feed", which looks like
    // a chart and carries no comparison.
    expect(whyNotDimension(1)).toContain("single bar");
  });

  it("allows two or more", () => {
    expect(whyNotDimension(2)).toBeNull();
    expect(whyNotDimension(40)).toBeNull();
  });
});

describe("every dimension is described", () => {
  it("carries a hint long enough to be an explanation", () => {
    for (const shape of SHAPES) {
      for (const d of dimensionsFor(shape)) {
        expect(d.hint, `${shape}.${d.key} has no hint`).toBeTruthy();
        expect(d.hint!.length, `${shape}.${d.key}'s hint is too short to explain anything`)
          .toBeGreaterThan(20);
      }
    }
  });

  it("has no duplicate keys within a shape", () => {
    for (const shape of SHAPES) {
      const keys = dimensionsFor(shape).map((d) => d.key);
      expect(new Set(keys).size, `${shape} lists a dimension twice`).toBe(keys.length);
    }
  });
});
