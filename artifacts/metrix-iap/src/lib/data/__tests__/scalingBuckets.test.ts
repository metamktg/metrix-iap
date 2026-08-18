// ─── scalingBuckets tests ─────────────────────────────────────────────
// Token-boundary matching against real playbook phrasing: C2 must never
// match C2B, book must be named, first matching list wins in priority
// order, and unmatched rows return null (unclassified, never guessed).

import { describe, it, expect } from "vitest";
import { bucketForConcept } from "../scalingBuckets";
import type { ScalingPlaybook } from "../seedTypes";

const playbook: ScalingPlaybook = {
  scale_now: ["BOOK0 Concept C2 (esp. Row B)", "BOOK2 Concept C2B"],
  optimize: ["BOOK0 C1", "BOOK0 C4 (esp. C4C rational-tone cell)"],
  validate: ["C5 BYOC (needs full A-D funding)"],
  explore: ["C6/C7 concept definition and formal MST inclusion (pending input)"],
  avoid_combinations: [
    "BOOK0 C3 (any variation) - zero conversions on real spend",
    "BOOK2 C2E, C4E, C2F - structurally underperforming extension cells",
  ],
};

describe("bucketForConcept", () => {
  it("matches book + standalone concept token", () => {
    expect(bucketForConcept("BOOK0", "C2", playbook)).toBe("scale_now");
    expect(bucketForConcept("BOOK0", "C1", playbook)).toBe("optimize");
    expect(bucketForConcept("BOOK0", "C3", playbook)).toBe("avoid");
    expect(bucketForConcept("BOOK2", "C2B", playbook)).toBe("scale_now");
  });

  it("C2 never matches a C2B entry and vice versa", () => {
    // BOOK2's playbook names C2B (scale) and C2E/C4E/C2F (avoid) — bare C2
    // appears nowhere, so it must stay unclassified.
    expect(bucketForConcept("BOOK2", "C2", playbook)).toBeNull();
    // C4E is only in the avoid list; the C4 optimize entry is BOOK0's.
    expect(bucketForConcept("BOOK2", "C4E", playbook)).toBe("avoid");
  });

  it("requires the book to be named in the entry", () => {
    // C5's validate entry names no book — no match for any book.
    expect(bucketForConcept("BOOK0", "C5", playbook)).toBeNull();
  });

  it("returns null for unmatched concepts and missing playbooks", () => {
    expect(bucketForConcept("BOOK0", "C9", playbook)).toBeNull();
    expect(bucketForConcept("BOOK0", "C2", null)).toBeNull();
    expect(bucketForConcept("BOOK0", "C2", undefined)).toBeNull();
  });
});
