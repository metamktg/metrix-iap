// A ranked bar chart lies most easily without any number being wrong.
//
// Rank a cost metric descending and the WORST performer wears the longest bar
// at the top of the list, which reads as "winner" to anyone scanning — and
// every figure on screen is correct. That is the failure this component is
// built to prevent, so it is the first thing tested.
//
// The other three are the ones that separate a measurement from an absence:
// a null must not sort as zero, a measured zero must still be visible as a
// measurement, and rows past the limit must be reported rather than dropped.

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RankedBars, type RankedDatum } from "../RankedBars";

const usd = (n: number) => `$${n.toFixed(2)}`;

const CPA: RankedDatum[] = [
  { key: "generic", label: "Generic feature callout", value: 63.2 },
  { key: "ugc", label: "Testimonial problem-hook", value: 18.4 },
  { key: "pas", label: "Founder-led PAS framework", value: 23.6 },
];

/** Row labels in rendered order. Read off the label's own hook rather than a
 *  class name, so a styling change cannot quietly break the assertion. */
function labelOrder(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((li) => li.querySelector("[data-ranked-label]")?.textContent?.trim() ?? "");
}

describe("ranking a cost metric", () => {
  it("puts the CHEAPEST first when order is asc", () => {
    render(
      <RankedBars data={CPA} format={usd} measureLabel="CPA" order="asc" invertLength />,
    );
    expect(labelOrder()[0]).toBe("Testimonial problem-hook");
  });

  it("would put the most expensive first under the default order — the trap", () => {
    // Not an endorsement: this asserts the default behaves as documented, so
    // that a caller who forgets order="asc" on a cost metric is getting a
    // knowable result rather than an accidental one.
    render(<RankedBars data={CPA} format={usd} measureLabel="CPA" />);
    expect(labelOrder()[0]).toBe("Generic feature callout");
  });

  it("says which way the bars are measured", () => {
    render(
      <RankedBars data={CPA} format={usd} measureLabel="CPA" order="asc" invertLength />,
    );
    // A bar chart that does not state its basis asks the reader to guess.
    expect(screen.getByText(/share of the best value/i)).toBeTruthy();
  });
});

describe("a gap is not a zero", () => {
  const MIXED: RankedDatum[] = [
    { key: "a", label: "Measured high", value: 100 },
    { key: "b", label: "Not measured", value: null },
    { key: "c", label: "Measured zero", value: 0 },
  ];

  it("renders a dash for an unmeasured row, not a number", () => {
    render(<RankedBars data={MIXED} format={usd} measureLabel="Spend" />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders a measured zero as a formatted zero", () => {
    render(<RankedBars data={MIXED} format={usd} measureLabel="Spend" />);
    expect(screen.getByText("$0.00")).toBeTruthy();
  });

  it("sinks unmeasured rows below every measured one, rather than sorting them as zero", () => {
    // Sorting a null as 0 would rank "we could not measure this" as the worst
    // performer — a verdict nobody computed.
    render(<RankedBars data={MIXED} format={usd} measureLabel="Spend" />);
    expect(labelOrder()).toEqual(["Measured high", "Measured zero", "Not measured"]);
  });

  it("shows the empty state only when NOTHING was measured", () => {
    render(
      <RankedBars
        data={[{ key: "a", label: "A", value: null }]}
        format={usd}
        measureLabel="Spend"
        emptyLabel="Nothing here"
      />,
    );
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });
});

describe("limiting", () => {
  const MANY: RankedDatum[] = Array.from({ length: 9 }, (_, i) => ({
    key: `k${i}`,
    label: `Row ${i}`,
    value: 100 - i,
  }));

  it("reports the rows it is not showing", () => {
    render(<RankedBars data={MANY} format={usd} measureLabel="Spend" limit={4} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(/5 more rows not shown/i)).toBeTruthy();
  });

  it("says nothing about hidden rows when none are hidden", () => {
    render(<RankedBars data={MANY} format={usd} measureLabel="Spend" />);
    expect(screen.queryByText(/more rows not shown/i)).toBeNull();
  });
});
