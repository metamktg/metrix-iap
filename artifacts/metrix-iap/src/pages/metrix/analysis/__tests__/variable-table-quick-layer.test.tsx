// VariableTable's inline quick layer — inline-table-control designed
// around the virtualizer. A row click may NOT grow the row (virtualized
// heights are fixed), so the quick layer pins directly under the table:
// same function (stay in context, siblings dim), and the full drill-down
// becomes the escalation instead of the row's first click.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { VariableTable } from "../tables";
import type { VariablePerformanceRow } from "@/lib/data/seedTypes";

function row(id: string, family: string, spend: number): VariablePerformanceRow {
  return {
    variable_id: id,
    variable_family: family,
    "Result type": "Website purchases",
    "Amount spent (USD)": spend,
    unique_ads: 3,
    Results: 10,
    CPA_result: spend / 10,
    CTR_link_pct: 1.2,
  } as unknown as VariablePerformanceRow;
}

const ROWS = [row("HK_Benefit", "hook", 900), row("TN_Aspirational", "tone", 400)];

describe("VariableTable quick layer", () => {
  it("row click opens the pinned quick layer, not the drill-down", () => {
    const onRowClick = vi.fn();
    render(<VariableTable rows={ROWS} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByTestId("row-variable-HK_Benefit-0"));
    expect(onRowClick).not.toHaveBeenCalled();

    const layer = screen.getByTestId("variable-quick-layer");
    // The registry's label plus the family · raw-id caption line.
    expect(within(layer).getByText("Benefit Hook")).toBeTruthy();
    expect(within(layer).getByText(/HK_Benefit/)).toBeTruthy();
  });

  it("the drill-down is the escalation from the quick layer", () => {
    const onRowClick = vi.fn();
    render(<VariableTable rows={ROWS} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByTestId("row-variable-HK_Benefit-0"));
    fireEvent.click(screen.getByRole("button", { name: "Open full drill-down" }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]![0].variable_id).toBe("HK_Benefit");
  });

  it("dims sibling rows while one is selected, and a second click clears", () => {
    render(<VariableTable rows={ROWS} onRowClick={() => {}} />);
    const selected = screen.getByTestId("row-variable-HK_Benefit-0");
    const sibling = screen.getByTestId("row-variable-TN_Aspirational-1");

    fireEvent.click(selected);
    expect(selected.getAttribute("aria-expanded")).toBe("true");
    expect(sibling.className).toContain("opacity-40");
    expect(selected.className).not.toContain("opacity-40");

    fireEvent.click(selected);
    expect(selected.getAttribute("aria-expanded")).toBe("false");
    expect(sibling.className).not.toContain("opacity-40");
  });
});
