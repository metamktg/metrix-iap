// ─── Status hub · the Analysis builder ─────────────────────────────────
// Sweep spec §4.1, §4.2: what the four rows say is a function of the run
// records and the staged imports, nothing else.

import { describe, it, expect } from "vitest";
import type { AnalysisRun, ManualImport } from "@workspace/api-client-react";
import { buildAnalysisHub } from "../statusHub";

const T0 = Date.UTC(2026, 8, 5, 10, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

function run(over: Partial<AnalysisRun> & { id: string }): AnalysisRun {
  return {
    account_id: "acct", status: "success", date_range: "30d", date_start: "2026-08-04", date_end: "2026-09-02",
    rows_ingested: 21130, imports_used: 3, error_message: null, started_at: iso(T0), finished_at: iso(T0 + 300_000),
    creatives_linked: null, creatives_total: null, creatives_unlinked_names: null, csv_warnings: null,
    objectives_assessed: null, objective_flags: null, progress_pct: 100, progress_stage: "", stage_timings: null,
    ...over,
  } as AnalysisRun;
}
function imp(over: Partial<ManualImport> & { id: string; kind: ManualImport["kind"] }): ManualImport {
  return { account_id: "acct", filename: `${over.id}.csv`, size_bytes: 10, status: "staged", created_at: iso(T0), ...over } as ManualImport;
}
const base = { windowLabel: "30 days", creativeStep: null, starting: false, nowMs: T0 + 60_000, historyTo: "/app/analysis/history" };

describe("buildAnalysisHub · inputs", () => {
  it("counts the staged performance files by class, never the creatives, and names the window", () => {
    const hub = buildAnalysisHub({
      ...base,
      runs: [],
      imports: [
        imp({ id: "a", kind: "performance_ad_summary_csv" }),
        imp({ id: "b", kind: "performance_demo_csv" }),
        imp({ id: "c", kind: "performance_demo_csv", status: "processed" }),
        imp({ id: "d", kind: "creative_asset" }),
      ],
    });
    expect(hub.inputs.map((i) => i.label)).toEqual(["2 files staged", "Window · 30 days"]);
    expect(hub.inputs[0]?.detail).toBe("Ad Summary, Demographics");
  });
  it("says nothing is staged as a fragment with the next step, not a sentence", () => {
    const hub = buildAnalysisHub({ ...base, runs: [], imports: [] });
    expect(hub.inputs[0]).toEqual({ label: "Nothing staged", detail: "Add a performance export" });
  });
  it("carries the staged-creatives next step as one line with the Creative link", () => {
    const hub = buildAnalysisHub({ ...base, runs: [], imports: [], creativeStep: { kind: "deconstruct", pending: 2 } });
    expect(hub.inputs.at(-1)).toEqual({ label: "2 creatives staged, not deconstructed", detail: "Creative", to: "/app/creative" });
    const re = buildAnalysisHub({ ...base, runs: [], imports: [], creativeStep: { kind: "reanalyze", deconstructed: 4 } });
    expect(re.inputs.at(-1)?.label).toBe("4 deconstructed since the last run");
  });
});

describe("buildAnalysisHub · in flight", () => {
  it("reads the running run's stage, its percent only when reported, its elapsed and no ETA without evidence", () => {
    const live = run({ id: "live", status: "running", finished_at: null, started_at: iso(T0), progress_pct: 0, progress_stage: "Parsing demographics export" });
    const hub = buildAnalysisHub({ ...base, runs: [live], imports: [], nowMs: T0 + 45_000 });
    expect(hub.inFlight).toMatchObject({ runId: "live", stage: "Parsing demographics export", percent: null, elapsedSeconds: 45, etaSeconds: null, slowStage: null });
    const later = buildAnalysisHub({ ...base, runs: [{ ...live, progress_pct: 50 }], imports: [], nowMs: T0 + 45_000 });
    expect(later.inFlight?.percent).toBe(50);
  });
  it("takes the ETA from prior comparable runs", () => {
    const live = run({ id: "live", status: "running", finished_at: null, started_at: iso(T0 + 1_000_000), progress_stage: "Parsing" });
    const hub = buildAnalysisHub({ ...base, runs: [run({ id: "a" }), run({ id: "b", finished_at: iso(T0 + 420_000) }), live], imports: [], nowMs: T0 + 1_010_000 });
    expect(hub.inFlight?.etaSeconds).toBe(360);
  });
  it("shows the pre-flight from the click until the run row exists", () => {
    const hub = buildAnalysisHub({ ...base, runs: [], imports: [], starting: true });
    expect(hub.inFlight).toMatchObject({ runId: "", stage: "Validating staged files before the run starts", percent: null, elapsedSeconds: 0 });
  });
  it("is empty when nothing runs", () => {
    expect(buildAnalysisHub({ ...base, runs: [run({ id: "a" })], imports: [] }).inFlight).toBeNull();
  });
});

describe("buildAnalysisHub · completed and failed", () => {
  it("summarises the latest successful run and carries its warnings verbatim", () => {
    const hub = buildAnalysisHub({
      ...base,
      imports: [],
      runs: [
        run({ id: "old", started_at: iso(T0 - 900_000), finished_at: iso(T0 - 600_000), rows_ingested: 5 }),
        run({ id: "new", csv_warnings: ["[Overlap] one", "[Truth] two"] }),
      ],
    });
    expect(hub.lastCompleted).toMatchObject({ runId: "new", summary: "2026-08-04 → 2026-09-02 · 21,130 rows", warnings: ["[Overlap] one", "[Truth] two"], detailsTo: "/app/analysis/history" });
    expect(hub.history).toEqual({ to: "/app/analysis/history", count: 2 });
  });
  it("reports a failure while it is the latest thing that happened, with what the reader still has", () => {
    const hub = buildAnalysisHub({
      ...base,
      imports: [],
      runs: [
        run({ id: "ok", started_at: iso(T0 - 900_000), finished_at: iso(T0 - 600_000) }),
        run({ id: "bad", status: "error", error_message: "index row size 3432 exceeds btree version 4 maximum 2704", finished_at: iso(T0 + 10_000) }),
      ],
    });
    expect(hub.failed).toMatchObject({ runId: "bad", message: "index row size 3432 exceeds btree version 4 maximum 2704", retained: "The last successful run's data (2026-08-04 → 2026-09-02) is still shown" });
    expect(hub.lastCompleted?.runId).toBe("ok");
  });
  it("says there is no completed run to show when the failure is the only run", () => {
    const hub = buildAnalysisHub({ ...base, imports: [], runs: [run({ id: "bad", status: "error", error_message: null })] });
    expect(hub.failed).toMatchObject({ message: "The run ended with an error", retained: "No completed run to show yet" });
    expect(hub.lastCompleted).toBeNull();
    expect(hub.history.count).toBe(0);
  });
  it("drops the failed row once a later run succeeds or a new run is in flight", () => {
    const bad = run({ id: "bad", status: "error", started_at: iso(T0 - 100_000), finished_at: iso(T0 - 90_000) });
    expect(buildAnalysisHub({ ...base, imports: [], runs: [bad, run({ id: "ok" })] }).failed).toBeNull();
    const live = run({ id: "live", status: "running", finished_at: null, started_at: iso(T0 + 5000) });
    expect(buildAnalysisHub({ ...base, imports: [], runs: [bad, live] }).failed).toBeNull();
  });
});

// ─── Strategy, Creative and MST (sweep spec §4.2, §5, slice 3) ─────────

import type { GenerationRun } from "@workspace/api-client-react";
import { buildStrategyHub, buildCreativeHub, buildMstHub, strategyBaseInput } from "../statusHub";

function gen(over: Partial<GenerationRun> & { id: string; kind: GenerationRun["kind"] }): GenerationRun {
  return {
    account_id: "acct", status: "success", error_message: null, model: "claude-sonnet-4-6",
    started_at: iso(T0), finished_at: iso(T0 + 200_000),
    source_analysis_run_ids: null, source_analysis_all_time: false,
    source_generation_run_id: null, source_window_start: null, source_window_end: null, output_count: null,
    progress_done: 0, progress_total: null, progress_pct: 100, progress_stage: "",
    ...over,
  } as GenerationRun;
}
const analysisRuns: AnalysisRun[] = [
  run({ id: "a1", date_start: "2026-08-04", date_end: "2026-09-02", rows_ingested: 21130 }),
  run({ id: "a2", date_start: "2026-07-01", date_end: "2026-07-31", rows_ingested: 8000, started_at: iso(T0 - 5_000_000), finished_at: iso(T0 - 4_800_000) }),
];
const strategyBase = { analysisRuns, strategy: { provenance: "generated", pillars: 3, hypotheses: 4 }, starting: false, nowMs: T0 + 60_000, historyTo: "/app/strategy/history" };

describe("strategyBaseInput", () => {
  it("names all time as the account's current run, one run by its window and rows, several by their span and the supersede rule", () => {
    expect(strategyBaseInput({ allTime: true, selectedRunIds: [] }, analysisRuns)).toEqual({ label: "Based on · All time", detail: "the account's current analysis run" });
    expect(strategyBaseInput({ allTime: false, selectedRunIds: ["a1"] }, analysisRuns)).toEqual({ label: "Based on · Aug 4 – Sep 2", detail: "21,130 rows" });
    expect(strategyBaseInput({ allTime: false, selectedRunIds: ["a1", "a2"] }, analysisRuns)).toEqual({
      label: "Based on · 2 runs",
      detail: "Jul 1 – Sep 2, later run supersedes overlapping dates",
    });
    expect(strategyBaseInput({ allTime: false, selectedRunIds: ["gone"] }, analysisRuns).label).toBe("Based on · no analysis run selected");
  });
});

describe("buildStrategyHub", () => {
  it("puts the base on the inputs row, the last success with its pillars, window and model on the completed row, and counts the history", () => {
    const hub = buildStrategyHub({
      ...strategyBase,
      selection: { allTime: false, selectedRunIds: ["a1"] },
      runs: [
        gen({ id: "s1", kind: "strategy", output_count: 3, source_window_start: "2026-08-04", source_window_end: "2026-09-02" }),
        gen({ id: "s0", kind: "strategy", started_at: iso(T0 - 9_000_000), finished_at: iso(T0 - 8_800_000), output_count: 2 }),
      ],
      latest: null,
    });
    expect(hub.inputs).toEqual([{ label: "Based on · Aug 4 – Sep 2", detail: "21,130 rows" }]);
    expect(hub.lastCompleted).toMatchObject({ runId: "s1", summary: "3 pillars · 4 hypotheses · 2026-08-04 → 2026-09-02 · claude-sonnet-4-6", warnings: [], detailsTo: "/app/strategy/history" });
    expect(hub.history).toEqual({ to: "/app/strategy/history", count: 2 });
    expect(hub.inFlight).toBeNull();
    expect(hub.failed).toBeNull();
  });
  it("reads the running run's stage and percent, its elapsed, and an ETA from prior successes else the platform median", () => {
    const live = gen({ id: "live", kind: "strategy", status: "running", finished_at: null, started_at: iso(T0), progress_pct: 60, progress_stage: "Persisting pillars…" });
    const hub = buildStrategyHub({ ...strategyBase, selection: { allTime: true, selectedRunIds: [] }, runs: [live], latest: live, nowMs: T0 + 45_000 });
    expect(hub.inFlight).toMatchObject({ runId: "live", stage: "Persisting pillars…", percent: 60, elapsedSeconds: 45, etaSeconds: 210, slowStage: null });
    const withPrior = buildStrategyHub({
      ...strategyBase, selection: { allTime: true, selectedRunIds: [] }, latest: live, nowMs: T0 + 45_000,
      runs: [live, gen({ id: "p1", kind: "strategy", started_at: iso(T0 - 1_000_000), finished_at: iso(T0 - 1_000_000 + 300_000) })],
    });
    expect(withPrior.inFlight?.etaSeconds).toBe(300);
    // No percent yet: the fallback stage, no number.
    const fresh = buildStrategyHub({ ...strategyBase, selection: { allTime: true, selectedRunIds: [] }, runs: [], latest: { ...live, progress_pct: 0, progress_stage: "" } });
    expect(fresh.inFlight).toMatchObject({ stage: "Generating strategy from validated analysis…", percent: null });
  });
  it("shows the pre-flight from the click until the run row exists", () => {
    const hub = buildStrategyHub({ ...strategyBase, selection: { allTime: true, selectedRunIds: [] }, runs: [], latest: null, starting: true });
    expect(hub.inFlight).toMatchObject({ runId: "", stage: "Reading the analysis evidence before the run starts", percent: null });
  });
  it("reports the latest failure with the strategy unchanged, and drops it once a run is in flight", () => {
    const bad = gen({ id: "bad", kind: "strategy", status: "error", error_message: "model returned no pillars", started_at: iso(T0 + 1000), finished_at: iso(T0 + 2000) });
    const ok = gen({ id: "ok", kind: "strategy", output_count: 3 });
    const hub = buildStrategyHub({ ...strategyBase, selection: { allTime: true, selectedRunIds: [] }, runs: [ok, bad], latest: bad });
    expect(hub.failed).toMatchObject({ runId: "bad", message: "model returned no pillars", retained: "The current strategy is unchanged" });
    expect(hub.lastCompleted?.runId).toBe("ok");
    const live = gen({ id: "live", kind: "strategy", status: "running", finished_at: null, started_at: iso(T0 + 5000) });
    expect(buildStrategyHub({ ...strategyBase, selection: { allTime: true, selectedRunIds: [] }, runs: [ok, bad, live], latest: live }).failed).toBeNull();
  });
});

describe("buildCreativeHub", () => {
  const s1 = gen({ id: "s1", kind: "strategy", output_count: 3 });
  const creativeBase = { strategyRuns: [s1], baseStrategyRun: s1, basePillars: 3, creatives: { staged: 4, deconstructed: 1 }, briefs: { provenance: "generated", total: 16, static: 12, video: 3, ugc: 1 }, starting: false, nowMs: T0 + 60_000 };
  it("names the strategy run to brief, the staged creatives and their deconstruction state, and the brief set by format from its strategy run", () => {
    const b1 = gen({ id: "b1", kind: "briefs", started_at: iso(T0 + 100_000), finished_at: iso(T0 + 300_000), output_count: 16, source_generation_run_id: "s1" });
    const hub = buildCreativeHub({ ...creativeBase, runs: [b1], latest: b1 });
    expect(hub.inputs.map((i) => i.label)).toEqual(["Based on · strategy run of Sep 5, 2026 · 3 pillars", "4 creatives staged"]);
    expect(hub.inputs[1]?.detail).toBe("1 deconstructed");
    expect(hub.lastCompleted?.summary).toBe("16 briefs · 12 static · 3 video · 1 UGC · from strategy run of Sep 5, 2026 · 3 pillars");
    expect(hub.history).toEqual({ count: 1 });
  });
  it("says when the current briefs predate the current strategy, and briefs the imported set when no generated strategy exists", () => {
    const old = gen({ id: "b0", kind: "briefs", started_at: iso(T0 - 100_000), finished_at: iso(T0 - 50_000), output_count: 12 });
    const hub = buildCreativeHub({ ...creativeBase, runs: [old], latest: old, briefs: { provenance: "imported", total: 5, static: 5, video: 0, ugc: 0 } });
    expect(hub.inputs.at(-1)).toEqual({ label: "Current briefs predate the current strategy", detail: "Regenerate to match" });
    expect(hub.lastCompleted?.summary).toBe("12 briefs");
    const imported = buildCreativeHub({ ...creativeBase, strategyRuns: [], baseStrategyRun: null, basePillars: 5, runs: [], latest: null, creatives: { staged: 0, deconstructed: 0 } });
    expect(imported.inputs).toEqual([
      { label: "Based on · imported strategy", detail: "5 pillars" },
      { label: "No creatives staged", detail: "Optional" },
    ]);
  });
  it("reports a failure with the briefs unchanged", () => {
    const bad = gen({ id: "bad", kind: "briefs", status: "error", error_message: "no pillars", started_at: iso(T0 + 1000), finished_at: iso(T0 + 2000) });
    expect(buildCreativeHub({ ...creativeBase, runs: [bad], latest: bad }).failed).toMatchObject({ retained: "The current briefs are unchanged" });
  });
});

describe("buildMstHub", () => {
  it("names the brief set in use with a Creative link and the matrix's readiness, and carries no run rows", () => {
    const hub = buildMstHub({ briefs: { total: 16, provenance: "generated" }, briefsRun: gen({ id: "b1", kind: "briefs" }), matrix: { avatars: 4, cells: 16 } });
    expect(hub.inputs).toEqual([
      { label: "Brief set · 16 briefs", detail: "generated Sep 5, 2026", to: "/app/creative" },
      { label: "Matrix · 4 avatars · 16 cells" },
    ]);
    expect(hub.history).toBeUndefined();
    expect(hub.inFlight).toBeNull();
    const empty = buildMstHub({ briefs: { total: 0 }, briefsRun: null, matrix: null });
    expect(empty.inputs).toEqual([
      { label: "No brief set yet", detail: "Generate briefs", to: "/app/creative" },
      { label: "No matrix yet", detail: "The matrix reads briefed cells" },
    ]);
  });
});
