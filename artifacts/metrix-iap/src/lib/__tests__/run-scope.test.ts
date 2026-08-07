// ─── run-scope unit tests ──────────────────────────────────────────────
// Pure-helper coverage for analysis-run cell scoping: concept→run-id
// membership and cell run-scope checks, using synthetic rollup data (the
// checked-in fixture predates run-scoping, so its concept_rollup rows all
// carry manual_analysis_run_id: null — synthetic data exercises the
// specific-run and multi-run branches directly).

import { describe, it, expect } from "vitest";
import { getConceptRunIds, cellInRunScope } from "../run-scope";
import type { AnalysisData } from "../data/seedTypes";
import { ALL_TIME_SELECTION } from "@/components/analysis/RunSelector";

function analysisWith(
  rollup: { concept: string; manual_analysis_run_id: string | null }[]
): AnalysisData {
  return {
    performance_by_cell: [],
    v3_variable_performance: [],
    demographic_registration_signal: [],
    v3_placement_signal: [],
    c4e_placement_signal: [],
    top_checkout_cells: [],
    top_checkout_variables: [],
    concept_rollup: rollup.map((r) => ({
      book: "BOOK2",
      concept: r.concept,
      date_start: "2026-05-01",
      date_end: "2026-05-31",
      manual_analysis_run_id: r.manual_analysis_run_id,
      spend: null,
      link_clicks: null,
      results: null,
      cpa: null,
      cvr_link_pct: null,
      confidence: null,
      mapped_in_library: true,
    })),
  } as AnalysisData;
}

describe("getConceptRunIds", () => {
  it("maps each concept to the set of runs (including null) that produced it", () => {
    const analysis = analysisWith([
      { concept: "C2", manual_analysis_run_id: "run-a" },
      { concept: "C2", manual_analysis_run_id: "run-b" },
      { concept: "C4", manual_analysis_run_id: "run-a" },
    ]);
    const map = getConceptRunIds(analysis);
    expect(map.get("C2")).toEqual(new Set(["run-a", "run-b"]));
    expect(map.get("C4")).toEqual(new Set(["run-a"]));
  });

  it("returns an empty map for missing analysis", () => {
    expect(getConceptRunIds(null).size).toBe(0);
  });
});

describe("cellInRunScope", () => {
  const runIds = getConceptRunIds(
    analysisWith([
      { concept: "C2", manual_analysis_run_id: "run-a" },
      { concept: "C4", manual_analysis_run_id: "run-b" },
      { concept: "C7", manual_analysis_run_id: null },
    ])
  );

  it("includes everything under All time", () => {
    expect(cellInRunScope(runIds, ALL_TIME_SELECTION, "C2B")).toBe(true);
    expect(cellInRunScope(runIds, ALL_TIME_SELECTION, "C4E")).toBe(true);
  });

  it("includes a cell whose concept was produced by a selected run", () => {
    const selection = { allTime: false, selectedRunIds: ["run-a"] };
    expect(cellInRunScope(runIds, selection, "C2B")).toBe(true);
  });

  it("excludes a cell whose concept was produced only by an unselected run", () => {
    const selection = { allTime: false, selectedRunIds: ["run-a"] };
    expect(cellInRunScope(runIds, selection, "C4E")).toBe(false);
  });

  it("includes a cell whose concept has an untagged legacy rollup row, regardless of selection", () => {
    const selection = { allTime: false, selectedRunIds: ["run-a"] };
    expect(cellInRunScope(runIds, selection, "C7A")).toBe(true);
  });

  it("keeps cells with unknown concepts (never hide undatable rows)", () => {
    const selection = { allTime: false, selectedRunIds: ["run-a"] };
    expect(cellInRunScope(runIds, selection, "C99Z")).toBe(true);
  });

  it("a cell is in scope if ANY of its concept's runs matches ANY selected run", () => {
    const multiRun = getConceptRunIds(
      analysisWith([
        { concept: "C2", manual_analysis_run_id: "run-a" },
        { concept: "C2", manual_analysis_run_id: "run-b" },
      ])
    );
    expect(cellInRunScope(multiRun, { allTime: false, selectedRunIds: ["run-b"] }, "C2B")).toBe(true);
    expect(cellInRunScope(multiRun, { allTime: false, selectedRunIds: ["run-c"] }, "C2B")).toBe(false);
  });
});
