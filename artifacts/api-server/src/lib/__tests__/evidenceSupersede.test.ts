// ─── Union with supersede over several analysis runs (sweep spec §5.1) ──

import { describe, expect, it } from "vitest";
import { effectiveWindow, orderRunsNewestFirst, supersedeRows, supersededRunIds, type RunWindow } from "../evidenceSupersede";

const run = (id: string, start: string | null, end: string | null, startedAt: string): RunWindow => ({
  id, date_start: start, date_end: end, started_at: startedAt,
});
const dated = (runId: string | null, start: string, end: string, v: string) => ({ manual_analysis_run_id: runId, date_start: start, date_end: end, v });
const undated = (runId: string | null, v: string) => ({ manual_analysis_run_id: runId, v });

// AUG covers August, SEP covers September, LATE re-measures Aug 20 to Sep 10 later than both.
const AUG = run("aug", "2026-08-01", "2026-08-31", "2026-09-01T10:00:00Z");
const SEP = run("sep", "2026-09-01", "2026-09-30", "2026-10-01T10:00:00Z");
const LATE = run("late", "2026-08-20", "2026-09-10", "2026-10-05T10:00:00Z");

describe("orderRunsNewestFirst and effectiveWindow", () => {
  it("orders by started_at and spans the earliest start to the latest end", () => {
    expect(orderRunsNewestFirst([AUG, LATE, SEP]).map((r) => r.id)).toEqual(["late", "sep", "aug"]);
    expect(effectiveWindow([AUG, SEP, LATE])).toEqual({ start: "2026-08-01", end: "2026-09-30" });
    expect(effectiveWindow([run("x", null, null, "2026-01-01T00:00:00Z")])).toBeNull();
  });
});

describe("supersedeRows · dated rows", () => {
  it("drops an older run's rows for the dates a newer selected run re-measured, keeps the rest", () => {
    const rows = [
      dated("aug", "2026-08-05", "2026-08-05", "aug early"),
      dated("aug", "2026-08-25", "2026-08-25", "aug late"),
      dated("sep", "2026-09-05", "2026-09-05", "sep early"),
      dated("sep", "2026-09-20", "2026-09-20", "sep late"),
      dated("late", "2026-08-25", "2026-08-25", "late aug"),
      dated("late", "2026-09-05", "2026-09-05", "late sep"),
      dated(null, "2026-08-25", "2026-08-25", "untagged"),
    ];
    expect(supersedeRows(rows, [AUG, SEP, LATE]).map((r) => r.v)).toEqual([
      "aug early", "sep late", "late aug", "late sep", "untagged",
    ]);
  });
  it("keeps a row whose period reaches outside every newer window", () => {
    const period = dated("aug", "2026-08-10", "2026-08-31", "aug period");
    expect(supersedeRows([period], [AUG, LATE])).toEqual([period]);
    const inside = dated("aug", "2026-08-20", "2026-08-31", "aug inside");
    expect(supersedeRows([inside], [AUG, LATE])).toEqual([]);
  });
  it("never supersedes with an older run, whatever its window", () => {
    const wide = run("wide", "2026-01-01", "2026-12-31", "2026-01-02T00:00:00Z");
    const rows = [dated("aug", "2026-08-05", "2026-08-05", "aug")];
    expect(supersedeRows(rows, [AUG, wide])).toEqual(rows);
  });
});

describe("supersedeRows · undated rows", () => {
  it("drops an older run's aggregates only when a newer run's window contains its whole window", () => {
    const whole = run("whole", "2026-08-01", "2026-09-30", "2026-10-10T00:00:00Z");
    const rows = [undated("aug", "aug"), undated("sep", "sep"), undated("late", "late"), undated(null, "untagged")];
    // LATE only partly overlaps AUG and SEP: both stay.
    expect(supersedeRows(rows, [AUG, SEP, LATE]).map((r) => r.v)).toEqual(["aug", "sep", "late", "untagged"]);
    // WHOLE contains every window: only its own rows and the untagged stay.
    expect(supersedeRows([...rows, undated("whole", "whole")], [AUG, SEP, LATE, whole]).map((r) => r.v)).toEqual(["untagged", "whole"]);
    expect(new Set(supersededRunIds([AUG, SEP, LATE, whole]))).toEqual(new Set(["aug", "sep", "late"]));
    expect(supersededRunIds([AUG, SEP, LATE])).toEqual([]);
  });
  it("keeps rows of a run without a window and rows of a run not in the list", () => {
    const blank = run("blank", null, null, "2026-01-01T00:00:00Z");
    const rows = [undated("blank", "blank"), undated("other", "other")];
    expect(supersedeRows(rows, [blank, LATE])).toEqual(rows);
  });
});
