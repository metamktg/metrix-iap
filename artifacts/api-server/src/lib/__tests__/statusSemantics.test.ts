// ─── Status semantics (E3) ────────────────────────────────────────────
//
// The work order's definition of done for this item is "every legacy status
// value maps". The values below are not the ones the work order listed —
// they were read out of the live database, which carries several it never
// named (`setup`, `system`, `hypothesis`, `insufficient`, and free-text
// compounds) and none of one it did (`critical`).
//
// The coverage test at the bottom is the point of this file: it enumerates
// the real vocabulary and fails if any member stops resolving, so a value
// cannot quietly start falling into the unmapped bucket.

import { describe, it, expect } from "vitest";
import {
  normalizeCellFlag,
  normalizeConfidenceValue,
  normalizeStatus,
  priorityFromFlagKind,
  priorityFromImpact,
  priorityFromTier,
} from "../statusSemantics";

describe("priority", () => {
  it("maps signal impact", () => {
    expect(priorityFromImpact("high")).toBe("critical");
    expect(priorityFromImpact("medium")).toBe("important");
    // `setup` is an onboarding card, not a finding about performance.
    expect(priorityFromImpact("setup")).toBe("informational");
  });

  it("maps data-quality flag kinds to the tier split the UI already renders", () => {
    expect(priorityFromFlagKind("anomaly")).toBe("critical");
    expect(priorityFromFlagKind("quality_flag")).toBe("important");
    expect(priorityFromFlagKind("attribution_window")).toBe("informational");
    expect(priorityFromFlagKind("data_quality_score")).toBe("informational");
  });

  it("maps the UI tier vocabulary", () => {
    expect(priorityFromTier("act_now")).toBe("critical");
    expect(priorityFromTier("watch")).toBe("important");
    expect(priorityFromTier("investigate")).toBe("informational");
  });

  it("returns null for an unknown value rather than a default bucket", () => {
    // The honesty rule: a surface reading null can fall back to the raw
    // string. One reading a guessed "informational" cannot tell it was a
    // guess, and the guess is an unmeasured claim.
    expect(priorityFromImpact("catastrophic")).toBeNull();
    expect(priorityFromFlagKind("brand_new_kind")).toBeNull();
    expect(priorityFromTier("")).toBeNull();
  });
});

describe("confidence", () => {
  it("maps the plain levels", () => {
    expect(normalizeConfidenceValue("high").confidence).toBe("high");
    expect(normalizeConfidenceValue("medium").confidence).toBe("medium");
    expect(normalizeConfidenceValue("low").confidence).toBe("low");
  });

  it("treats directional as weaker than a measured reading", () => {
    expect(normalizeConfidenceValue("directional").confidence).toBe("low");
    expect(normalizeConfidenceValue("directional").needs_validation).toBe(false);
  });

  it("keeps 'not established' distinct from 'weak'", () => {
    for (const v of ["validation_required", "hypothesis", "insufficient"]) {
      const r = normalizeConfidenceValue(v);
      expect(r.confidence).toBe("low");
      // Collapsing these to `low` alone would lose the distinction entirely.
      expect(r.needs_validation).toBe(true);
    }
    expect(normalizeConfidenceValue("low").needs_validation).toBe(false);
  });

  it("resolves a compound value to its WEAKEST component", () => {
    // Real value, live: overstating confidence is the failure that costs a
    // user money; understating it costs them a second look.
    const r = normalizeConfidenceValue("high for registration, directional for checkout");
    expect(r.confidence).toBe("low");
  });

  it("does not force `system` onto the confidence scale", () => {
    // It is a provenance marker on setup cards, not a confidence claim.
    expect(normalizeConfidenceValue("system")).toEqual({ confidence: null, needs_validation: false });
  });

  it("returns null for unrecognized text", () => {
    expect(normalizeConfidenceValue("pretty sure").confidence).toBeNull();
    expect(normalizeConfidenceValue("").confidence).toBeNull();
  });
});

describe("reporting-cell flags", () => {
  it("resolves on the confidence axis and leaves priority null", () => {
    // These describe how complete a cell's REPORTING is, not how important
    // it is. Calling zero_conversions "critical" would invent an urgency the
    // product has never assigned it.
    const partial = normalizeCellFlag("partial_reporting_cell");
    expect(partial.priority).toBeNull();
    expect(partial.confidence).toBe("low");
    expect(partial.needs_validation).toBe(true);

    const zero = normalizeCellFlag("zero_conversions");
    expect(zero.priority).toBeNull();
    // A measured zero is a real reading, not a gap in one.
    expect(zero.confidence).toBe("high");
    expect(zero.needs_validation).toBe(false);
  });
});

describe("normalizeStatus", () => {
  it("carries every raw value through unchanged", () => {
    const s = normalizeStatus({ impact: "high", confidence: "validation_required" });
    expect(s.priority).toBe("critical");
    expect(s.confidence).toBe("low");
    expect(s.needs_validation).toBe(true);
    expect(s.raw.impact).toBe("high");
    expect(s.raw.confidence).toBe("validation_required");
  });

  it("distinguishes an absent axis from an informational one", () => {
    const s = normalizeStatus({ confidence: "high" });
    expect(s.priority).toBeNull();          // no impact was supplied
    expect(s.raw.impact).toBeNull();
  });
});

// ── Coverage over the REAL vocabulary ────────────────────────────────────────
//
// Read from the live database, not from the work order:
//   signal_cards.impact           high, medium, setup
//   signal_cards.confidence       high, medium, directional, system,
//                                 validation_required, and one compound
//   icp_profiles.confidence_level high, medium, low, hypothesis,
//                                 insufficient, validation_required
//   data_quality_flags.kind       anomaly, quality_flag, attribution_window,
//                                 data_quality_score
//   reporting-cell flags          partial_reporting_cell, zero_conversions

describe("live vocabulary coverage", () => {
  it("resolves every impact and flag kind that occurs in production", () => {
    for (const v of ["high", "medium", "setup"]) {
      expect(priorityFromImpact(v), `impact "${v}"`).not.toBeNull();
    }
    for (const v of ["anomaly", "quality_flag", "attribution_window", "data_quality_score"]) {
      expect(priorityFromFlagKind(v), `kind "${v}"`).not.toBeNull();
    }
  });

  it("resolves every confidence value that occurs in production", () => {
    const live = [
      "high", "medium", "low", "directional", "validation_required",
      "hypothesis", "insufficient",
      "high for registration, directional for checkout",
    ];
    for (const v of live) {
      expect(normalizeConfidenceValue(v).confidence, `confidence "${v}"`).not.toBeNull();
    }
    // `system` is the one live value deliberately left off the scale.
    expect(normalizeConfidenceValue("system").confidence).toBeNull();
  });

  it("resolves every reporting-cell flag that occurs in production", () => {
    for (const v of ["partial_reporting_cell", "zero_conversions"]) {
      expect(normalizeCellFlag(v).confidence, `flag "${v}"`).not.toBeNull();
    }
  });
});
