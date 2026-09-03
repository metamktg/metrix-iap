// ─── NormalizedRefItem chip-text regression guard ─────────────────────
//
// The existing strategyShared-exports.test.tsx only asserts that
// NormalizedRefItem renders a non-null container. This file guards the
// rendered chip *content*: a regression in parseHierarchyRef or
// formatHierarchyRef would silently blank the visible chips without
// triggering a TypeScript error. getByText / queryByText assertions
// catch that at the component level.
//
// NormalizedRefItem has three rendering branches:
//   1. Parsed, no annotation  → bare <span><RefChips /></span>
//   2. Parsed, with annotation → <DetailReveal label={<RefChips />} ...>
//   3. Unparseable             → deriveLabel fallback (short: raw text,
//                                long: truncated label via DetailReveal)
//
// All three branches are guarded below.

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup, screen } from "@testing-library/react";
import { NormalizedRefItem } from "../strategy/strategyShared";

afterEach(cleanup);

// ─── Branch 1: parsed, no annotation — chip text directly visible ─────

describe("NormalizedRefItem · parsed, no annotation", () => {
  it('renders "B0 · C2" chip for "BOOK0 Concept C2"', () => {
    render(<NormalizedRefItem text="BOOK0 Concept C2" eyebrow="Reference" />);
    expect(screen.getByText("B0 · C2")).toBeTruthy();
  });

  it('renders "B0 · C2 · Row B" chip for "BOOK0 C2 Row B"', () => {
    render(<NormalizedRefItem text="BOOK0 C2 Row B" eyebrow="Reference" />);
    expect(screen.getByText("B0 · C2 · Row B")).toBeTruthy();
  });

  it('renders "C4C" chip for "C4C" (bare concept-only ref)', () => {
    render(<NormalizedRefItem text="C4C" eyebrow="Finding" />);
    expect(screen.getByText("C4C")).toBeTruthy();
  });

  it('renders "B2 · C2E" chip for "BOOK2 C2E"', () => {
    render(<NormalizedRefItem text="BOOK2 C2E" eyebrow="Concept" />);
    expect(screen.getByText("B2 · C2E")).toBeTruthy();
  });

  it("renders two chips for a multi-ref string", () => {
    // "BOOK2 C2E, C4E" → [{book:BOOK2, concept:C2E}, {book:BOOK2, concept:C4E}]
    render(<NormalizedRefItem text="BOOK2 C2E, C4E" eyebrow="Reference" />);
    expect(screen.getByText("B2 · C2E")).toBeTruthy();
    expect(screen.getByText("B2 · C4E")).toBeTruthy();
  });

  it("chip text is non-blank", () => {
    render(<NormalizedRefItem text="BOOK0 Concept C2" eyebrow="Reference" />);
    const chip = screen.getByText("B0 · C2");
    expect(chip.textContent?.trim().length).toBeGreaterThan(0);
  });
});

// ─── Branch 2: parsed, with annotation — chips visible in button label ─

describe("NormalizedRefItem · parsed, with annotation (DetailReveal)", () => {
  it('shows "B0 · C2" chip label when annotation is present in parenthetical', () => {
    // "(esp. Row B)" is parsed as annotation, not a row suffix
    render(<NormalizedRefItem text="BOOK0 Concept C2 (esp. Row B)" eyebrow="Reference" />);
    expect(screen.getByText("B0 · C2")).toBeTruthy();
  });

  it('shows "C4C" chip label when trailing annotation is present', () => {
    // "rational tone at scale" is annotation trailing "C4C"
    render(<NormalizedRefItem text="C4C rational tone at scale" eyebrow="Finding" />);
    expect(screen.getByText("C4C")).toBeTruthy();
  });

  it("chip text is non-blank when annotation is present", () => {
    render(<NormalizedRefItem text="BOOK0 Concept C2 (esp. Row B)" eyebrow="Reference" />);
    const chip = screen.getByText("B0 · C2");
    expect(chip.textContent?.trim().length).toBeGreaterThan(0);
  });
});

// ─── Branch 3: fallback path — plain-text label must be visible ───────

describe("NormalizedRefItem · fallback path (unparseable strings)", () => {
  it("renders raw text for a short plain string (≤40 chars)", () => {
    const text = "Short plain finding";
    render(<NormalizedRefItem text={text} eyebrow="Finding" />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("renders visible text for a long plain string (>40 chars)", () => {
    // Long unparseable strings go through deriveLabel(text, 40). Assert that
    // the first word of the text is still visible (word-boundary truncation
    // always preserves at least the first token).
    const text =
      "Audience Network native banner and interstitial placement lacks conversion quality";
    render(<NormalizedRefItem text={text} eyebrow="Finding" />);
    expect(screen.queryByText(/Audience/)).toBeTruthy();
  });

  it("renders raw text for a demographic segment string (classic non-parseable)", () => {
    const text = "Male 55-64 dedicated creative";
    render(<NormalizedRefItem text={text} eyebrow="Segment" />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("fallback container is never blank for a non-empty plain string", () => {
    const text = "Conversion quality concern";
    const { container } = render(<NormalizedRefItem text={text} eyebrow="Note" />);
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });
});
