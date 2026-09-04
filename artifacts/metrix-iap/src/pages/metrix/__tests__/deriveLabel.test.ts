// deriveLabel — mechanical first-clause label extraction for the
// first-layer "labels only" rule. The label must always be a prefix or
// clause of the source text (never fabricated copy).

import { describe, it, expect } from "vitest";
import { deriveLabel } from "../shared";

describe("deriveLabel · unclosed parenthetical", () => {
  it("never ends a cut inside a parenthetical", () => {
    const label = deriveLabel("BOOK0 Concept C2 (esp. Row B) keeps its shape under retirement pressure", 24);
    expect(label).toBe("BOOK0 Concept C2…");
    expect(label).not.toMatch(/\(/);
  });
  it("keeps a closed parenthetical that fits", () => {
    expect(deriveLabel("BOOK0 Concept C2 (esp. Row B)", 60)).toBe("BOOK0 Concept C2 (esp. Row B)");
  });
});

describe("deriveLabel", () => {
  it("returns empty string for empty/nullish input", () => {
    expect(deriveLabel("")).toBe("");
    expect(deriveLabel(null)).toBe("");
    expect(deriveLabel(undefined)).toBe("");
    expect(deriveLabel("   ")).toBe("");
  });

  it("returns short text unchanged", () => {
    expect(deriveLabel("Benefit Hook")).toBe("Benefit Hook");
  });

  it("takes the first sentence when present", () => {
    expect(
      deriveLabel("Defend and deepen the registration driver. C2B is the proven mechanism at $9.13 CPA.")
    ).toBe("Defend and deepen the registration driver");
  });

  it("splits on em-dash clause boundaries", () => {
    expect(
      deriveLabel("Registration engine — restructures the creative arc to carry users down the funnel.")
    ).toBe("Registration engine");
  });

  it("splits on colon boundaries", () => {
    expect(
      deriveLabel("Isolates: Problem-Agitate-Solve vs Before-After-Bridge held as control in Row A.")
    ).toBe("Isolates");
  });

  it("cuts at a word boundary with ellipsis when the clause exceeds max", () => {
    const text =
      "Replacing FW_BAB with FW_PAS in the Time-Poor Learner column will improve checkout CPA by reducing benefit-lead framing";
    const label = deriveLabel(text, 60);
    expect(label.length).toBeLessThanOrEqual(61);
    expect(label.endsWith("…")).toBe(true);
    // label body must be a prefix of the source (mechanical, no new copy)
    expect(text.startsWith(label.slice(0, -1))).toBe(true);
    // no mid-word cut
    const body = label.slice(0, -1);
    expect(text.charAt(body.length)).toBe(" ");
  });

  it("never ends with dangling punctuation before the ellipsis", () => {
    const label = deriveLabel(
      "High-intent audiences respond to urgency, scarcity, and social proof, while low-intent audiences need education first",
      40
    );
    expect(/[\s,;:—-]…$/.test(label)).toBe(false);
  });

  it("ignores boundaries inside very short prefixes (e.g. leading numbering)", () => {
    // "1." boundary produces a <8-char clause, so the full text is used instead
    const label = deriveLabel("1. Short", 60);
    expect(label).toBe("1. Short");
  });

  it("collapses internal whitespace", () => {
    expect(deriveLabel("Multi   space\n\ttext here")).toBe("Multi space text here");
  });
});
