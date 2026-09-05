// ─── The persisted run scope's per-page default (sweep spec §5.1) ──────
// A page that has stored nothing shows its default: All time on the
// analysis surfaces, the newest successful run with rollups on Strategy.
// A stored choice always wins, a stale stored run falls back, and nothing
// is written to storage until the reader chooses.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AnalysisRun } from "@workspace/api-client-react";
import { usePersistedRunScope } from "../run-scope";

const run = (id: string, startedAt: string, over: Partial<AnalysisRun> = {}): AnalysisRun =>
  ({ id, status: "success", date_range: "30d", started_at: startedAt, finished_at: startedAt, rollups_retained: true, ...over }) as AnalysisRun;

const RUNS: AnalysisRun[] = [
  run("older", "2026-08-01T10:00:00Z"),
  run("newest", "2026-09-04T10:00:00Z"),
  run("failed", "2026-09-05T10:00:00Z", { status: "error" }),
  run("dropped", "2026-09-05T11:00:00Z", { rollups_retained: false }),
];

beforeEach(() => sessionStorage.clear());

describe("usePersistedRunScope with a default", () => {
  it("shows the default until the reader chooses, then stores the choice", () => {
    const { result } = renderHook(() => usePersistedRunScope("strategy-base-run", "acct", RUNS, true, "latest-success"));
    expect(result.current[0]).toEqual({ allTime: false, selectedRunIds: ["newest"] });
    expect(sessionStorage.getItem("metrix.runScope.strategy-base-run.acct")).toBeNull();
    act(() => result.current[1]({ allTime: true, selectedRunIds: [] }));
    expect(result.current[0]).toEqual({ allTime: true, selectedRunIds: [] });
    expect(JSON.parse(sessionStorage.getItem("metrix.runScope.strategy-base-run.acct")!)).toEqual({ allTime: true, selectedRunIds: [] });
  });
  it("prefers a stored choice over the default, and falls back to it when the stored run is gone", () => {
    sessionStorage.setItem("metrix.runScope.strategy-base-run.acct", JSON.stringify({ allTime: false, selectedRunIds: ["older"] }));
    const { result } = renderHook(() => usePersistedRunScope("strategy-base-run", "acct", RUNS, true, "latest-success"));
    expect(result.current[0]).toEqual({ allTime: false, selectedRunIds: ["older"] });
    sessionStorage.setItem("metrix.runScope.strategy-base-run.other", JSON.stringify({ allTime: false, selectedRunIds: ["gone"] }));
    const stale = renderHook(() => usePersistedRunScope("strategy-base-run", "other", RUNS, true, "latest-success"));
    // The stale-run guard resets the stored value to All time, which is then what the page shows.
    expect(stale.result.current[0]).toEqual({ allTime: true, selectedRunIds: [] });
  });
  it("keeps All time as the default for every other page, and for latest-success until the list is known or holds a success", () => {
    expect(renderHook(() => usePersistedRunScope("iap-library", "acct", RUNS)).result.current[0]).toEqual({ allTime: true, selectedRunIds: [] });
    expect(renderHook(() => usePersistedRunScope("strategy-base-run", "acct", undefined, true, "latest-success")).result.current[0]).toEqual({ allTime: true, selectedRunIds: [] });
    const failedOnly = [run("failed", "2026-09-05T10:00:00Z", { status: "error" })];
    expect(renderHook(() => usePersistedRunScope("strategy-base-run", "acct", failedOnly, true, "latest-success")).result.current[0]).toEqual({ allTime: true, selectedRunIds: [] });
  });
});
