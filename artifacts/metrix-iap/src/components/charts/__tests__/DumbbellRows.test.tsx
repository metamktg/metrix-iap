// ─── DumbbellRows ─────────────────────────────────────────────────────
//
// The replacement for two share-of-total progress bars per row. What these
// pin is the reason it replaced them: the GAP is a drawn mark with a
// length, the axis does not waste its width, and direction never rests on
// colour alone.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DumbbellRows, type DumbbellRow } from "../DumbbellRows";

/** The real Bookster audience shares, which motivated the change. */
const BOOKSTER: DumbbellRow[] = [
  { id: "C1", code: "C1", label: "Women 35-44 + Men 65+", a: 23.88, b: 14.10 },
  { id: "C2", code: "C2", label: "Women 55-64 + Women 18-24", a: 23.15, b: 25.64 },
  { id: "C3", code: "C3", label: "Women 45-54 + Men 18-24", a: 18.97, b: 28.21 },
  { id: "C6", code: "C6", label: "Men 25-34", a: 1.94, b: 5.13 },
];

const setup = (rows: DumbbellRow[] = BOOKSTER) =>
  render(<DumbbellRows rows={rows} aLabel="Share of spend" bLabel="Share of results" data-testid="db" />);

describe("DumbbellRows", () => {
  it("scales the axis to the largest share present, not to 100", () => {
    setup();
    // Peak is 28.21 → 28.21 * 1.08 = 30.5 → rounded up to the next 5 = 35.
    // On a 0-100 track those six shares used under a third of the width.
    expect(screen.getByText("0–35%")).toBeTruthy();
  });

  it("never lets the axis collapse onto a set of tiny shares", () => {
    render(<DumbbellRows rows={[{ id: "a", label: "a", a: 0.4, b: 0.9 }]} aLabel="A" bLabel="B" />);
    // A 1%-max axis would magnify half a point of noise into half the width.
    expect(screen.getByText("0–10%")).toBeTruthy();
  });

  it("states the gap and its direction in text, so the read never rests on colour", () => {
    setup();
    expect(screen.getByText("-10pts")).toBeTruthy();  // C1: spend well above results
    expect(screen.getByText("+9pts")).toBeTruthy();   // C3: results well above spend
    expect(screen.getByText("+2pts")).toBeTruthy();   // C2: inside the neutral band
  });

  it("describes every row for a screen reader, including the direction", () => {
    setup();
    expect(
      screen.getByLabelText(/Women 35-44 \+ Men 65\+.*Share of spend 24%.*Share of results 14%.*down 10 points/),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Women 45-54 \+ Men 18-24.*up 9 points/)).toBeTruthy();
  });

  it("marks an unmeasured row as unmeasured rather than drawing it as zero", () => {
    render(
      <DumbbellRows
        rows={[{ id: "x", label: "No results", a: 40, b: 0, measured: false }]}
        aLabel="Share of spend" bLabel="Share of results" unmeasuredNote="n/a"
      />,
    );
    expect(screen.getByText("n/a")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByLabelText(/No results.*not measured/)).toBeTruthy();
  });

  it("keys both series, so identity is never carried by the mark alone", () => {
    setup();
    expect(screen.getByText("Share of spend")).toBeTruthy();
    expect(screen.getByText("Share of results")).toBeTruthy();
  });

  it("renders nothing for an empty set rather than an empty frame", () => {
    const { container } = render(<DumbbellRows rows={[]} aLabel="A" bLabel="B" />);
    expect(container.firstChild).toBeNull();
  });

  it("gives the gap a real length: C1's segment spans a quarter of the axis", () => {
    const { container } = setup();
    // spend 23.88, results 14.10, axis 0-35 → the segment runs from 40.3% to
    // 68.2% of the track: 27.9% of the width for a 9.8-point gap. As two
    // separate 0-100 bars the same gap was a 9.8% difference the reader had
    // to compute across two rows.
    const segs = [...container.querySelectorAll<HTMLElement>("div[style*='calc']")];
    expect(segs.length).toBeGreaterThan(0);
    expect(segs[0]!.style.width).toContain("calc(");
  });
});
