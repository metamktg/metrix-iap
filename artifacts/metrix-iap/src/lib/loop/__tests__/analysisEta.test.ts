// ─── Analysis ETA · evidence only ──────────────────────────────────────
// Sweep spec §4.3: an ETA appears only from comparable prior runs, reads
// "usually about N min", and a stage running past twice its usual duration
// on this account is named. Everything is asserted through the one public
// function the hub calls, so the helpers behind it stay private.

import { describe, it, expect } from "vitest";
import type { AnalysisRun } from "@workspace/api-client-react";
import { estimateAnalysisEta, usuallyAboutLabel } from "../analysisEta";

const T0 = Date.UTC(2026, 8, 5, 10, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

function run(over: Partial<AnalysisRun> & { id: string }): AnalysisRun {
  return {
    account_id: "acct",
    status: "success",
    date_range: "30d",
    date_start: "2026-08-04",
    date_end: "2026-09-02",
    rows_ingested: 1000,
    imports_used: 3,
    error_message: null,
    started_at: iso(T0),
    finished_at: iso(T0 + 300_000),
    creatives_linked: null,
    creatives_total: null,
    creatives_unlinked_names: null,
    csv_warnings: null,
    objectives_assessed: null,
    objective_flags: null,
    progress_pct: 100,
    progress_stage: "",
    stage_timings: null,
    ...over,
  } as AnalysisRun;
}

const live = (over: Partial<AnalysisRun> = {}) =>
  run({ id: "live", status: "running", finished_at: null, started_at: iso(T0 + 1_000_000), progress_stage: "Parsing", ...over });

describe("estimateAnalysisEta · the ETA", () => {
  it("has no ETA and no basis without a comparable run", () => {
    expect(estimateAnalysisEta([], live(), T0 + 1_010_000)).toEqual({ etaSeconds: null, basisRuns: 0, slowStage: null });
  });

  it("is the median duration of the prior successful runs: the middle for odd counts, the mean of the middle pair for even", () => {
    const three = [run({ id: "a", finished_at: iso(T0 + 120_000) }), run({ id: "b" }), run({ id: "c", finished_at: iso(T0 + 900_000) })];
    expect(estimateAnalysisEta([...three, live()], live(), T0 + 1_010_000)).toMatchObject({ etaSeconds: 300, basisRuns: 3 });
    const four = [...three, run({ id: "d", finished_at: iso(T0 + 600_000) })];
    expect(estimateAnalysisEta([...four, live()], live(), T0 + 1_010_000).etaSeconds).toBe((300 + 600) / 2);
  });

  it("prefers runs of the same date-range preset and falls back to every finished run without one", () => {
    const runs = [
      run({ id: "s30a", date_range: "30d" }),
      run({ id: "s30b", date_range: "30d", finished_at: iso(T0 + 600_000) }),
      run({ id: "s7", date_range: "7d", finished_at: iso(T0 + 60_000) }),
    ];
    expect(estimateAnalysisEta([...runs, live({ date_range: "30d" })], live({ date_range: "30d" }), T0).etaSeconds).toBe(450);
    expect(estimateAnalysisEta([...runs, live({ date_range: "14d" })], live({ date_range: "14d" }), T0).etaSeconds).toBe(300);
  });

  it("never counts the run in flight, a failed run, an unfinished one, or one whose finish precedes its start", () => {
    const runs = [
      run({ id: "good" }),
      run({ id: "err", status: "error", finished_at: iso(T0 + 5_000) }),
      run({ id: "open", finished_at: null }),
      run({ id: "back", finished_at: iso(T0 - 1_000) }),
    ];
    expect(estimateAnalysisEta([...runs, live()], live(), T0)).toMatchObject({ etaSeconds: 300, basisRuns: 1 });
  });
});

describe("estimateAnalysisEta · the slow stage", () => {
  const reconciling = "Reconciling reports against the control source";
  const prior = run({
    id: "p",
    started_at: iso(T0),
    finished_at: iso(T0 + 100_000),
    stage_timings: [
      { stage: "Parsing demographics export", pct: 5, at: iso(T0) },
      { stage: reconciling, pct: 86, at: iso(T0 + 40_000) },
    ],
  });
  const liveStart = T0 + 1_000_000;
  const inReconciling = live({
    started_at: iso(liveStart),
    progress_stage: reconciling,
    stage_timings: [
      { stage: "Parsing demographics export", pct: 5, at: iso(liveStart) },
      { stage: reconciling, pct: 86, at: iso(liveStart + 30_000) },
    ],
  });

  it("names the current stage once it has run past twice its usual duration here", () => {
    // Usual: 60 s in reconciliation (its entry to the finish). 130 s in it now.
    expect(estimateAnalysisEta([prior, inReconciling], inReconciling, liveStart + 160_000).slowStage).toBe(reconciling);
    // 110 s in it: not yet past twice the usual.
    expect(estimateAnalysisEta([prior, inReconciling], inReconciling, liveStart + 140_000).slowStage).toBeNull();
  });

  it("measures the stage from the run's start when the in-flight row carries no timings yet", () => {
    const bare = live({ started_at: iso(liveStart), progress_stage: reconciling, stage_timings: null });
    expect(estimateAnalysisEta([prior, bare], bare, liveStart + 130_000).slowStage).toBe(reconciling);
  });

  it("accumulates a repeated stage label on the prior run before comparing", () => {
    const repeated = run({
      id: "r",
      started_at: iso(T0),
      finished_at: iso(T0 + 100_000),
      stage_timings: [
        { stage: reconciling, pct: 86, at: iso(T0) },
        { stage: "Writing", pct: 88, at: iso(T0 + 20_000) },
        { stage: reconciling, pct: 87, at: iso(T0 + 70_000) },
      ],
    });
    // Usual: 20 + 30 = 50 s. 101 s in it now: past twice.
    expect(estimateAnalysisEta([repeated, inReconciling], inReconciling, liveStart + 131_000).slowStage).toBe(reconciling);
    // 99 s: not past twice 50.
    expect(estimateAnalysisEta([repeated, inReconciling], inReconciling, liveStart + 129_000).slowStage).toBeNull();
  });

  it("never flags a stage under a 30 s floor even when the usual duration is tiny", () => {
    const quick = run({ id: "q", started_at: iso(T0), finished_at: iso(T0 + 10_000), stage_timings: [{ stage: "Finalizing", pct: 97, at: iso(T0 + 9_000) }] });
    const finalizing = live({ started_at: iso(liveStart), progress_stage: "Finalizing", stage_timings: [{ stage: "Finalizing", pct: 97, at: iso(liveStart) }] });
    expect(estimateAnalysisEta([quick, finalizing], finalizing, liveStart + 29_000).slowStage).toBeNull();
    expect(estimateAnalysisEta([quick, finalizing], finalizing, liveStart + 31_000).slowStage).toBe("Finalizing");
  });

  it("does not flag a stage no prior run recorded, and nothing on a settled run", () => {
    const writing = live({ started_at: iso(liveStart), progress_stage: "Writing" });
    expect(estimateAnalysisEta([prior, writing], writing, liveStart + 999_000).slowStage).toBeNull();
    expect(estimateAnalysisEta([prior], run({ id: "done" }), liveStart + 999_000).slowStage).toBeNull();
  });
});

describe("usuallyAboutLabel", () => {
  it("rounds to whole minutes and never says less than one", () => {
    expect(usuallyAboutLabel(20)).toBe("usually about 1 min");
    expect(usuallyAboutLabel(150)).toBe("usually about 3 min");
    expect(usuallyAboutLabel(1841)).toBe("usually about 31 min");
  });
});
