// ─── date-scope unit tests ────────────────────────────────────────────
// Pure-helper coverage against the real seed fixture: concept windows,
// cell range membership, range-scoped sums, and the MST data window.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  conceptForCell,
  getConceptWindows,
  cellInRange,
  sumInRange,
  getMstRange,
} from "../date-scope";
import type { AnalysisData, MST } from "../data/seedTypes";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const analysis: AnalysisData = bookster.iap.analysis;
const mst: MST = bookster.mst;

describe("conceptForCell", () => {
  it("extracts the concept code from a cell id", () => {
    expect(conceptForCell("C2B")).toBe("C2");
    expect(conceptForCell("C14E")).toBe("C14");
  });

  it("returns null for non-cell strings", () => {
    expect(conceptForCell("banner_01")).toBeNull();
    expect(conceptForCell("")).toBeNull();
  });
});

describe("getConceptWindows", () => {
  const windows = getConceptWindows(analysis);

  it("builds a union window per concept from concept_rollup", () => {
    expect(windows.size).toBeGreaterThan(0);
    const c2 = windows.get("C2");
    expect(c2).toBeDefined();
    // Union across all dated C2 rollup rows.
    const c2Rows = (analysis.concept_rollup ?? []).filter(
      (r) => r.concept === "C2" && r.date_start && r.date_end
    );
    const minStart = c2Rows.map((r) => r.date_start).sort()[0];
    const maxEnd = c2Rows.map((r) => r.date_end).sort().at(-1);
    expect(c2!.start).toBe(minStart);
    expect(c2!.end).toBe(maxEnd);
  });

  it("returns an empty map for missing analysis", () => {
    expect(getConceptWindows(null).size).toBe(0);
  });
});

describe("cellInRange", () => {
  const windows = getConceptWindows(analysis);
  const c2 = windows.get("C2")!;
  const c4 = windows.get("C4")!;

  it("includes a cell whose concept window overlaps the range", () => {
    expect(cellInRange(windows, { start: c2.start, end: c2.start }, "C2B")).toBe(true);
  });

  it("excludes a cell whose concept window misses the range", () => {
    // A range strictly after C4's window must exclude C4 cells.
    expect(c4.end < c2.end).toBe(true);
    const after = { start: "2026-07-01", end: "2026-07-07" };
    expect(after.start > c4.end).toBe(true);
    expect(cellInRange(windows, after, "C4E")).toBe(false);
    // ...while C2 cells (window runs through 2026-07-07) stay in.
    expect(cellInRange(windows, after, "C2B")).toBe(true);
  });

  it("keeps cells with unknown windows (never hide undatable rows)", () => {
    expect(cellInRange(windows, { start: "2026-07-01", end: "2026-07-07" }, "C99Z")).toBe(true);
  });

  it("keeps everything when range is null", () => {
    expect(cellInRange(windows, null, "C4E")).toBe(true);
  });
});

describe("sumInRange", () => {
  const rollup = analysis.concept_rollup ?? [];
  const dates = (r: (typeof rollup)[number]) => ({ start: r.date_start, end: r.date_end });

  it("sums everything when range is null", () => {
    const all = sumInRange(rollup, null, dates, (r) => r.spend);
    const manual = rollup.reduce((n, r) => n + (r.spend ?? 0), 0);
    expect(all).toBeCloseTo(manual, 6);
  });

  it("narrowing the range reduces the sum when flights fall outside it", () => {
    const all = sumInRange(rollup, null, dates, (r) => r.spend);
    const narrowed = sumInRange(
      rollup,
      { start: "2026-07-01", end: "2026-07-07" },
      dates,
      (r) => r.spend
    );
    // C4 flights (ending 2026-06-27) drop out, so the sum must shrink.
    expect(narrowed).toBeLessThan(all);
    expect(narrowed).toBeGreaterThan(0);
  });
});

describe("getMstRange", () => {
  it("returns the union window of MST concepts, from MST data not account bounds", () => {
    const range = getMstRange(mst, analysis);
    expect(range).not.toBeNull();
    const windows = getConceptWindows(analysis);
    // Every concept in the MST library with a dated window fits inside it.
    for (const c of mst.local_book2_library ?? []) {
      const w = windows.get(conceptForCell(c.cell_id) ?? "");
      if (!w) continue;
      expect(range!.start <= w.start).toBe(true);
      expect(range!.end >= w.end).toBe(true);
    }
  });

  it("returns null without MST", () => {
    expect(getMstRange(null, analysis)).toBeNull();
  });

  it("returns null when no MST concept has a dated rollup", () => {
    expect(getMstRange(mst, null)).toBeNull();
  });
});
