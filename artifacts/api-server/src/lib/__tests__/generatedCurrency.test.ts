// ─── Which generated set is current (GAP-01) ──────────────────────────
//
// Generation runs no longer delete the set they supersede, so an account can
// hold several generated sets at once and every reader has to say which one
// is live. These tests pin the shared answer that the seed, the generation
// engine, the deconstruction matcher and the stage-status count all derive
// from — the alternative being to establish it once and thread it by hand,
// which is the failure mode this codebase has already shipped four times.

import { describe, it, expect } from "vitest";
import {
  resolveCurrentGeneratedSet,
  splitBySource,
  successfulRunsNewestFirst,
} from "../generatedCurrency";

type Row = Record<string, any>;

const OLD = "aaaaaaaa-0000-4000-8000-000000000001";
const NEW = "bbbbbbbb-0000-4000-8000-000000000002";

const run = (id: string, kind: string, startedAt: string, status = "success"): Row => ({
  id,
  kind,
  status,
  started_at: startedAt,
});

const gen = (runId: string, id: string): Row => ({
  brief_id: id,
  source: "generated",
  generation_run_id: runId,
});

const imported = (id: string): Row => ({ brief_id: id, source: "imported" });

describe("successfulRunsNewestFirst", () => {
  it("orders successful runs of the requested kind newest first", () => {
    const runs = successfulRunsNewestFirst(
      [
        run(OLD, "briefs", "2026-08-01T00:00:00Z"),
        run(NEW, "briefs", "2026-08-20T00:00:00Z"),
      ],
      "briefs",
    );
    expect(runs.map((r) => r.id)).toEqual([NEW, OLD]);
  });

  it("excludes other kinds and unsuccessful runs", () => {
    const runs = successfulRunsNewestFirst(
      [
        run(OLD, "strategy", "2026-08-20T00:00:00Z"),
        run(NEW, "briefs", "2026-08-19T00:00:00Z", "error"),
      ],
      "briefs",
    );
    expect(runs).toEqual([]);
  });
});

describe("resolveCurrentGeneratedSet", () => {
  const runs = successfulRunsNewestFirst(
    [run(OLD, "briefs", "2026-08-01T00:00:00Z"), run(NEW, "briefs", "2026-08-20T00:00:00Z")],
    "briefs",
  );

  it("returns only the newest run's rows when several sets survive", () => {
    const { rows, run: chosen } = resolveCurrentGeneratedSet(
      [gen(OLD, "GEN_BRIEF_old_1"), gen(NEW, "GEN_BRIEF_new_1"), gen(NEW, "GEN_BRIEF_new_2")],
      runs,
    );
    expect(rows.map((r) => r["brief_id"])).toEqual(["GEN_BRIEF_new_1", "GEN_BRIEF_new_2"]);
    expect(chosen?.id).toBe(NEW);
  });

  it("falls through to the newest run that still HAS rows", () => {
    // The newest run's output can be removed out of band. The honest answer
    // is then the newest set that actually survives — not "nothing generated"
    // while real rows sit in the table.
    const { rows, run: chosen } = resolveCurrentGeneratedSet([gen(OLD, "GEN_BRIEF_old_1")], runs);
    expect(rows.map((r) => r["brief_id"])).toEqual(["GEN_BRIEF_old_1"]);
    expect(chosen?.id).toBe(OLD);
  });

  it("keeps rows that map to no successful run rather than dropping them", () => {
    const { rows, run: chosen } = resolveCurrentGeneratedSet([gen("ghost-run", "GEN_BRIEF_x")], runs);
    expect(rows.map((r) => r["brief_id"])).toEqual(["GEN_BRIEF_x"]);
    expect(chosen).toBeNull();
  });

  it("returns an empty set, and no run, when nothing was generated", () => {
    expect(resolveCurrentGeneratedSet([], runs)).toEqual({ rows: [], run: null });
  });
});

describe("splitBySource", () => {
  const runs = successfulRunsNewestFirst(
    [run(OLD, "briefs", "2026-08-01T00:00:00Z"), run(NEW, "briefs", "2026-08-20T00:00:00Z")],
    "briefs",
  );

  it("excludes archived generated sets from both the current set and the active one", () => {
    const out = splitBySource(
      [imported("IMP_1"), gen(OLD, "GEN_BRIEF_old_1"), gen(NEW, "GEN_BRIEF_new_1")],
      runs,
    );
    expect(out.imported.map((r) => r["brief_id"])).toEqual(["IMP_1"]);
    expect(out.generated.map((r) => r["brief_id"])).toEqual(["GEN_BRIEF_new_1"]);
    // A generated set REPLACES the imported one — it is never merged with it.
    expect(out.active.map((r) => r["brief_id"])).toEqual(["GEN_BRIEF_new_1"]);
  });

  it("falls back to the imported rows only, never the raw array", () => {
    // The regression this pins: before archiving, "no current generated set"
    // meant the array held imported rows and nothing else, so falling back to
    // it whole was harmless. Archived rows live in that array now, and
    // returning it whole would render superseded briefs as live.
    const out = splitBySource([imported("IMP_1"), gen(OLD, "GEN_BRIEF_old_1")], []);
    expect(out.generated.map((r) => r["brief_id"])).toEqual(["GEN_BRIEF_old_1"]);
    const noRuns = splitBySource([imported("IMP_1")], []);
    expect(noRuns.active.map((r) => r["brief_id"])).toEqual(["IMP_1"]);
  });

  it("counts only the live set, so a count cannot climb across regenerations", () => {
    // stage-status reports this number and gates MST unlock on it.
    const twoRunsOfTwo = [gen(OLD, "b1"), gen(OLD, "b2"), gen(NEW, "b3"), gen(NEW, "b4")];
    expect(splitBySource(twoRunsOfTwo, runs).active).toHaveLength(2);
  });
});
