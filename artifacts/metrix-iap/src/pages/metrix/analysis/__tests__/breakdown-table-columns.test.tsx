// Guard against the Breakdown table silently rendering zero metric columns
// for edge-case placement data (task: only Impressions + Spend populated).
//
// buildPlacementRows() leaves ctrAll/frequency/atcRate null for placement rows;
// if ctrLink is also null (no impressions), none of the default priority
// columns survive the allCols filter. BreakdownTable must fall back to
// showing the available columns instead of an all-blank table.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { buildPlacementRows, BreakdownTable } from "../EngagementFunnelView";
import type { PlacementRow } from "@/lib/data/seedTypes";

afterEach(cleanup);

function placementRow(overrides: Partial<PlacementRow> = {}): PlacementRow {
  return {
    Placement: "Feed",
    Platform: "facebook",
    "Amount spent (USD)": 120.5,
    Impressions: 10_000,
    "Link clicks": 0,
    Results: 0,
    CPA: null,
    ...overrides,
  };
}

describe("buildPlacementRows · impressions+spend-only rows", () => {
  it("keeps spend populated and nulls out non-derivable metrics", () => {
    const rows = buildPlacementRows([placementRow()]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.spend).toBeCloseTo(120.5);
    expect(r.impressions).toBe(10_000);
    // Derived-from-missing metrics stay null (not 0, not NaN)
    expect(r.ctrAll).toBeNull();
    expect(r.frequency).toBeNull();
    expect(r.atcRate).toBeNull();
    expect(r.cpa).toBeNull();
    // ctrLink is derivable (0 clicks / impressions) → 0, not null
    expect(r.ctrLink).toBe(0);
  });
});

describe("BreakdownTable · zero-priority-column edge case", () => {
  it("still shows CTR Link + Spend when only impressions and spend are populated", () => {
    const rows = buildPlacementRows([
      placementRow({ Placement: "Feed" }),
      placementRow({ Placement: "Stories", "Amount spent (USD)": 80, Impressions: 5_000 }),
    ]);
    render(<BreakdownTable rows={rows} sortId="ctrLink" onSort={() => {}} />);
    // At least one metric column must be visible
    expect(screen.getByRole("button", { name: /CTR Link/i })).toBeTruthy();
    // Spend is available; either shown directly or exposed via the disclosure button
    const spendHeader = screen.queryByRole("button", { name: /^Spend/i });
    const showMore = screen.queryByRole("button", { name: /Show \d+ more column/i });
    expect(spendHeader || showMore).toBeTruthy();
    if (!spendHeader && showMore) {
      fireEvent.click(showMore);
      expect(screen.getByRole("button", { name: /^Spend/i })).toBeTruthy();
    }
  });

  it("falls back to all available columns when no priority/sort column has data", () => {
    // Spend-only rows: no impressions → ctrLink is null too, so none of the
    // priority columns (ctrLink, ctrAll, frequency, atcRate) survive.
    const rows = buildPlacementRows([
      placementRow({ Impressions: 0, "Amount spent (USD)": 42 }),
      placementRow({ Placement: "Stories", Impressions: 0, "Amount spent (USD)": 17 }),
    ]);
    render(<BreakdownTable rows={rows} sortId="ctrLink" onSort={() => {}} />);
    // Without the fallback this table rendered only Segment + Bar (zero
    // metric columns). Spend must be visible by default.
    expect(screen.getByRole("button", { name: /^Spend/i })).toBeTruthy();
    // No misleading "Show N more columns" button when everything is shown
    expect(screen.queryByRole("button", { name: /Show \d+ more column/i })).toBeNull();
    // And the spend values render as formatted cells, not em-dashes only
    expect(screen.getByText("$42")).toBeTruthy();
  });
});
