// ─── The avatar × placement modal shows two marginals, not an empty grid ──
//
// It used to draw a cross-tab whose interior was a literal "—" in every cell:
// not a lookup that came back empty, but a dash the component wrote, because
// Meta's export carries no joint demographic × placement grain at all. Most of
// the modal was therefore dashes, and the footnote said the cells would
// "populate automatically" once a combined export arrived — a promise no code
// path could keep, since nothing read a joint value.
//
// What the import really has is two marginals. These tests pin that both are
// rendered with real numbers and that the dead interior is gone.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import type { AnalysisData, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { SegmentGridModal } from "../SegmentGridModal";

function demoRow(over: Partial<DemographicRow> = {}): DemographicRow {
  return {
    cell_id: "C1A", "Ad name": "Ad One", Age: "25-34", Gender: "female",
    "Amount spent (USD)": 4000, Reach: 50_000, Impressions: 120_000, Results: 300,
    "Clicks (all)": 3000, "Link clicks": 2500, CPA_result: 13.3, CTR_link_pct: 2,
    Result_per_link_click_pct: 12, ...over,
  } as DemographicRow;
}

function placementRow(over: Partial<PlacementRow> = {}): PlacementRow {
  return {
    Placement: "Feed", Platform: "facebook", "Amount spent (USD)": 2500,
    Impressions: 80_000, "Link clicks": 1800, Results: 200, CPA: 12.5, CTR_link_pct: 2.2,
    ...over,
  } as PlacementRow;
}

const analysis = {
  demographic_registration_signal: [demoRow(), demoRow({ Age: "35-44", "Amount spent (USD)": 1500 })],
  v3_placement_signal: [placementRow(), placementRow({ Placement: "Reels", Platform: "instagram" })],
  c4e_placement_signal: [],
  performance_by_cell: [],
} as unknown as AnalysisData;

function open() {
  return render(
    <TooltipProvider>
      <SegmentGridModal
        open
        onClose={() => {}}
        kicker="IAP LIBRARY · ALL CELLS"
        title="Spend (selected)"
        analysis={analysis}
        cellIds={null}
      />
    </TooltipProvider>,
  );
}

afterEach(cleanup);

describe("avatar × placement modal", () => {
  it("renders both marginals with real values", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("25-34")).toBeTruthy();
    expect(within(dialog).getByText("35-44")).toBeTruthy();
    expect(within(dialog).getByText("Feed")).toBeTruthy();
    expect(within(dialog).getByText("Reels")).toBeTruthy();
    // The platform is a display name, not Meta's lowercase token.
    expect(within(dialog).getByText("Facebook")).toBeTruthy();
    expect(within(dialog).getByText("Instagram")).toBeTruthy();
  });

  it("draws no cross-tab interior for a grain the export does not carry", () => {
    open();
    const dialog = screen.getByRole("dialog");
    // The old grid emitted one dash cell per avatar × placement pair. Any
    // table row holding two or more dash-only cells is that grid coming back.
    const dashy = within(dialog)
      .queryAllByRole("row")
      .filter(
        (row) =>
          Array.from(row.querySelectorAll("td")).filter((td) => td.textContent?.trim() === "—").length >= 2,
      );
    expect(dashy, "the empty avatar × placement interior is back").toHaveLength(0);
  });

  it("does not promise cells that will never populate", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/populate automatically/i);
    expect(dialog.textContent).toMatch(/no joint demographic × placement breakdown/i);
  });
});
