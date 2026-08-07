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
} from "../date-scope";
import type { AnalysisData } from "../data/seedTypes";

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

  it("includes a cell whose concept window overlaps the range", () => {
    expect(cellInRange(windows, { start: c2.start, end: c2.start }, "C2B")).toBe(true);
  });

  it("excludes a cell whose concept window misses the range", () => {
    // Use synthetic windows to test the helper logic directly, independent of
    // the fixture's date distribution (which may have all concepts sharing the
    // same window when analysis covers a full data period).
    const synthWindows = new Map([
      ["C4", { start: "2026-05-01", end: "2026-06-30" }],
      ["C2", { start: "2026-05-01", end: "2026-07-31" }],
    ]);
    const after = { start: "2026-07-01", end: "2026-07-07" };
    // C4's window ends 2026-06-30, before the range start → excluded.
    expect(after.start > "2026-06-30").toBe(true);
    expect(cellInRange(synthWindows, after, "C4E")).toBe(false);
    // C2's window extends to 2026-07-31, overlapping the range → included.
    expect(cellInRange(synthWindows, after, "C2B")).toBe(true);
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
    // Use synthetic rollup to test the helper's exclusion logic independent of
    // the fixture's actual date distribution, which may have all concepts sharing
    // the same window when analysis covers a full data period.
    const synthRollup = [
      { concept: "C4", date_start: "2026-05-01", date_end: "2026-06-30", spend: 100, results: 5 },
      { concept: "C2", date_start: "2026-05-01", date_end: "2026-07-31", spend: 200, results: 10 },
    ];
    const synthDates = (r: (typeof synthRollup)[number]) => ({ start: r.date_start, end: r.date_end });
    const all = sumInRange(synthRollup, null, synthDates, (r) => r.spend);
    const narrowed = sumInRange(
      synthRollup,
      { start: "2026-07-01", end: "2026-07-07" },
      synthDates,
      (r) => r.spend
    );
    // C4 flights end 2026-06-30, before the range → drop out.
    // C2 flights continue through 2026-07-31 → stay in.
    expect(narrowed).toBeLessThan(all);
    expect(narrowed).toBeGreaterThan(0);
  });
});
