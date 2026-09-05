// ─── stage_timings · the run's stage boundaries, read and appended ─────
// Sweep spec §7.7: updateProgress writes one {stage, pct, at} per stage
// boundary, whole, with every progress update; the reader tolerates the
// cell's three real shapes (a parsed array, its text, null) and never
// throws on a malformed one, since progress display is non-critical.

import { describe, it, expect } from "vitest";
import { stageTimingsFromRow, nextStageTimings } from "../analysisEngine";

describe("stageTimingsFromRow", () => {
  it("reads a parsed jsonb array as PostgREST returns it", () => {
    expect(stageTimingsFromRow([{ stage: "Parsing demographics export", pct: 5, at: "2026-09-05T10:00:00.000Z" }])).toEqual([
      { stage: "Parsing demographics export", pct: 5, at: "2026-09-05T10:00:00.000Z" },
    ]);
  });
  it("reads the same array carried as text", () => {
    expect(stageTimingsFromRow('[{"stage":"Finalizing","pct":97,"at":"2026-09-05T10:30:00.000Z"}]')).toEqual([
      { stage: "Finalizing", pct: 97, at: "2026-09-05T10:30:00.000Z" },
    ]);
  });
  it("is null for a row written before the column existed and for anything that is not an array", () => {
    expect(stageTimingsFromRow(null)).toBeNull();
    expect(stageTimingsFromRow(undefined)).toBeNull();
    expect(stageTimingsFromRow("not json")).toBeNull();
    expect(stageTimingsFromRow({ stage: "x" })).toBeNull();
  });
  it("drops malformed entries and coerces a textual pct, never throwing", () => {
    expect(stageTimingsFromRow([null, "x", { stage: "A", at: "t", pct: "42" }, { stage: 3, at: "t" }, { stage: "B", at: "u" }])).toEqual([
      { stage: "A", pct: 42, at: "t" },
      { stage: "B", pct: 0, at: "u" },
    ]);
  });
});

describe("nextStageTimings", () => {
  it("appends in order and never rewrites what came before", () => {
    const first = nextStageTimings(undefined, "Parsing demographics export", 5, "t1");
    const second = nextStageTimings(first, "Parsing placements export", 20, "t2");
    expect(second).toEqual([
      { stage: "Parsing demographics export", pct: 5, at: "t1" },
      { stage: "Parsing placements export", pct: 20, at: "t2" },
    ]);
    expect(first).toHaveLength(1);
  });
  it("keeps a repeated label as its own boundary (the reconciliation stage writes two at 87%)", () => {
    const t = nextStageTimings(nextStageTimings(undefined, "Reconciling: the control per ad", 87, "t1"), "Reconciling: the ledger", 87, "t2");
    expect(t.map((x) => x.stage)).toEqual(["Reconciling: the control per ad", "Reconciling: the ledger"]);
  });
});
