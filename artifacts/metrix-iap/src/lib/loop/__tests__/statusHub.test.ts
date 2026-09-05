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
