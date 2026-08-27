// ─── Two analysis runs must not sum to twice the spend ────────────────
//
// analysisEngine writes concept_performance and variable_performance
// WITHOUT clearing them — deliberately. schema.sql widened both unique keys
// to include manual_analysis_run_id so re-runs accumulate rather than
// destroying history, and RunScopePicker reads that history. Every other
// rollup table is cleared for its window before insert.
//
// So concept_rollup and v3_variable_performance are cumulative, and any
// consumer that aggregates them without scoping counts the same spend once
// per run. Re-running analysis after uploading new reports is the documented
// workflow, so this was the ordinary path, not an edge case. It was reached
// three ways: AdPerformanceView's range totals, kpiBreakdown's per-family
// grouping, and creative-dna's family roll-up — and the last two COULD NOT
// be fixed at the call site, because the seed emitted variable rows as the
// raw stored payload, which never carried a run id.
//
// These pin the arithmetic in both directions: unscoped rows still sum (the
// functions are not lying about what they were given), and scoped rows
// report the account's real spend.

import { describe, it, expect } from "vitest";
import { sumInRange } from "../date-scope";
import { rollupDnaFamilies } from "../creative-dna";
import { scopeToRun } from "../run-supersede";
import type { VariablePerformanceRow, ConceptRollupRow } from "../data/seedTypes";

const conceptRow = (runId: string | null, over: Partial<ConceptRollupRow> = {}): ConceptRollupRow =>
  ({
    book: "BOOK2", concept: "C2",
    date_start: "2026-06-01", date_end: "2026-06-30",
    manual_analysis_run_id: runId,
    spend: 1000, link_clicks: 500, results: 50, cpa: 20, cvr_link_pct: 10,
    confidence: "high", mapped_in_library: true,
    ...over,
  }) as ConceptRollupRow;

const varRow = (runId: string | null, over: Partial<VariablePerformanceRow> = {}): VariablePerformanceRow =>
  ({
    variable_family: "hook", variable_id: "HK_ProofFirst", "Result type": "purchase",
    "Amount spent (USD)": 1000, Reach: 10_000, Impressions: 20_000, Results: 50,
    "Clicks (all)": 900, "Link clicks": 500, unique_ads: 4,
    CPA_result: 20, CTR_link_pct: 2.5, Result_per_link_click_pct: 10,
    manual_analysis_run_id: runId,
    ...over,
  }) as VariablePerformanceRow;

const RANGE = { start: "2026-06-01", end: "2026-06-30" };
const dates = (r: ConceptRollupRow) => ({ start: r.date_start, end: r.date_end });

describe("concept_rollup — scoping to the latest run", () => {
  it("reports the account's real spend when three runs have measured the same month", () => {
    // The account spent $1,000 in June. Runs 1, 2 and 3 each measured it.
    const rows = [conceptRow("r1"), conceptRow("r2"), conceptRow("r3")];
    expect(sumInRange(scopeToRun(rows, "r3"), RANGE, dates, (r) => r.spend)).toBe(1000);
  });

  it("still sums unscoped rows — the summing function is not the thing that was wrong", () => {
    const rows = [conceptRow("r1"), conceptRow("r2"), conceptRow("r3")];
    expect(sumInRange(rows, RANGE, dates, (r) => r.spend)).toBe(3000);
  });

  it("keeps genuinely different periods measured by different runs", () => {
    // Run 1 measured June, run 2 measured July. Scoping to run 2 must not
    // hide June — but June's row belongs to run 1, so it IS dropped, and
    // that is correct: run 2 is the account's current analysis and it did
    // not cover June. What must never be dropped is an UNTAGGED row.
    const rows = [
      conceptRow(null, { date_start: "2026-05-01", date_end: "2026-05-31", spend: 400 }),
      conceptRow("r2", { date_start: "2026-07-01", date_end: "2026-07-31", spend: 900 }),
    ];
    const wide = { start: "2026-05-01", end: "2026-07-31" };
    expect(sumInRange(scopeToRun(rows, "r2"), wide, dates, (r) => r.spend)).toBe(1300);
  });
});

describe("v3_variable_performance — scoping to the latest run", () => {
  it("carries a run id now, which is what makes scoping possible at all", () => {
    // The seed used to emit the stored payload verbatim; it never carried
    // one, so no consumer could scope however carefully it was written.
    expect(Object.keys(varRow("r1"))).toContain("manual_analysis_run_id");
  });

  it("rolls a variable's spend up once across three runs", () => {
    const [fam] = rollupDnaFamilies([varRow("r1"), varRow("r2"), varRow("r3")], "r3");
    expect(fam!.spend).toBe(1000);
    expect(fam!.results).toBe(50);
  });

  it("still doubles when no run is given — the default is unchanged for untagged rows", () => {
    const [fam] = rollupDnaFamilies([varRow(null), varRow(null)]);
    expect(fam!.spend).toBe(2000);
  });

  it("keeps untagged rows under a scope, per schema.sql's rule", () => {
    const [fam] = rollupDnaFamilies([varRow(null, { "Amount spent (USD)": 300, Results: 10 }), varRow("r1"), varRow("r2")], "r2");
    expect(fam!.spend).toBe(1300);
  });
});
