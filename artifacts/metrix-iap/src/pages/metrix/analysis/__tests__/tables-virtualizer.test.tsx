// ─── The virtualized table bodies ───────────────────────────────────────
// jsdom has no layout, so the browser-only failure this guards (a header
// and no rows for every table past 50 rows: the virtualizer was created in
// a CHILD of the scroll container, whose ref React attaches after that
// child's layout effect has already asked for it) is proven by
// scripts/src/visual/check-virtual-tables.mjs. What jsdom can prove is the
// wiring that makes the browser case work: the virtualizer is created by
// the table component that owns the scroll div, asks for that div and gets
// it, is enabled only past the threshold, and renders the items it returns.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { CellPerformanceRow, VariablePerformanceRow } from "@/lib/data/seedTypes";

type Options = {
  count: number;
  enabled?: boolean;
  getScrollElement: () => HTMLElement | null;
  estimateSize: () => number;
  initialRect?: { width: number; height: number };
};
const calls: Options[] = [];

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: Options) => {
    calls.push(opts);
    const size = opts.estimateSize();
    const items = opts.enabled === false
      ? []
      : Array.from({ length: opts.count }, (_, index) => ({ index, key: index, start: index * size, end: (index + 1) * size, size }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * size,
    };
  },
}));

import { CellTable, VariableTable } from "../tables";

afterEach(() => { cleanup(); calls.length = 0; });

const cellRow = (i: number): CellPerformanceRow => ({
  cell_id: `C${i}`,
  "Result type": "Website purchases",
  "Amount spent (USD)": 100 + i,
  Reach: 1000,
  Impressions: 2000,
  Results: 10,
  "Clicks (all)": 50,
  "Link clicks": 40,
  CPA_result: (100 + i) / 10,
  CTR_link_pct: 2,
  Result_per_link_click_pct: 25,
  book2_concept_name: `Concept ${i}`,
});

const variableRow = (i: number): VariablePerformanceRow => ({
  variable_id: `HK_${i}`,
  variable_family: "hook",
  "Result type": "Website purchases",
  "Amount spent (USD)": 100 + i,
  Reach: 1000,
  Impressions: 2000,
  Results: 10,
  "Clicks (all)": 50,
  "Link clicks": 40,
  CPA_result: (100 + i) / 10,
  CTR_link_pct: 2,
  Result_per_link_click_pct: 25,
  unique_ads: 3,
} as VariablePerformanceRow);

describe("VariableTable virtualization", () => {
  it("past the threshold the table component creates the virtualizer, hands it the scroll div, and renders its items", () => {
    const rows = Array.from({ length: 60 }, (_, i) => variableRow(i));
    render(<VariableTable rows={rows} />);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.enabled).toBe(true);
    expect(calls[0]!.count).toBe(60);
    // The ref is attached by the time anything can ask for it from the
    // table component's own effects; asking now proves it is the shell's
    // scroll container and not some other node.
    const scroller = calls[0]!.getScrollElement();
    expect(scroller).not.toBeNull();
    expect(scroller!.className).toMatch(/overflow-y-auto/);
    expect(scroller!.querySelector("table")).not.toBeNull();
    // A first page exists before any measurement: the shell's max height.
    expect(calls[0]!.initialRect?.height).toBeGreaterThan(0);
    const body = screen.getByTestId("virtual-table-body");
    expect(body.querySelectorAll("tr:not([aria-hidden])")).toHaveLength(60);
    expect(screen.getByText("HK_59")).toBeTruthy();
  });

  it("at or under the threshold the virtualizer is created disabled and every row renders plainly", () => {
    const rows = Array.from({ length: 12 }, (_, i) => variableRow(i));
    render(<VariableTable rows={rows} />);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.enabled).toBe(false);
    expect(screen.queryByTestId("virtual-table-body")).toBeNull();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(12);
  });
});

describe("CellTable virtualization", () => {
  it("same contract for the cell table", () => {
    const rows = Array.from({ length: 55 }, (_, i) => cellRow(i));
    render(<CellTable rows={rows} />);
    expect(calls[0]!.enabled).toBe(true);
    expect(calls[0]!.getScrollElement()?.className).toMatch(/overflow-y-auto/);
    expect(screen.getByTestId("virtual-table-body").querySelectorAll("tr:not([aria-hidden])")).toHaveLength(55);
    expect(screen.getByText("Concept 54")).toBeTruthy();
  });
});
