// ─── Variable chips never wear a verdict ──────────────────────────────
//
// The chip names a variable FAMILY. A reserved status colour on it states a
// verdict the code does not carry: PR (proof) was status-success and AW
// (awareness) was status-danger, so a brief listing both looked like it was
// reporting one win and one failure.
//
// The second assertion is the one that caught the original bug: nine families
// were mapped across five hues, so CN and HP resolved to the identical class
// string. Either every family shares one treatment (what we do now) or they
// are all distinct — a map that is mostly-distinct-with-collisions is the one
// shape that misleads, because the reader reasonably assumes a difference in
// colour means a difference in kind.

import { describe, it, expect } from "vitest";
import { PREFIX_COLORS } from "../variable-registry";

const FAMILIES = ["HK", "TN", "FW", "CN", "PR", "CTA", "AW", "ST", "HP"] as const;

describe("variable-family chips", () => {
  it("never uses a reserved status colour", () => {
    for (const [prefix, cls] of Object.entries(PREFIX_COLORS)) {
      expect(cls, `${prefix} wears a status colour`).not.toMatch(/status-(success|warning|danger)/);
    }
  });

  it("does not claim a distinction it cannot make", () => {
    // Nine families, five validated categorical slots. Any partial colouring
    // produces collisions, so the treatment is uniform across families.
    const distinct = new Set(FAMILIES.map((f) => PREFIX_COLORS[f]));
    expect(distinct.size).toBe(1);
  });

  it("keeps an unparseable code visually recessive", () => {
    expect(PREFIX_COLORS.unknown).not.toBe(PREFIX_COLORS.HK);
    expect(PREFIX_COLORS.unknown).toContain("muted-foreground");
  });
});
