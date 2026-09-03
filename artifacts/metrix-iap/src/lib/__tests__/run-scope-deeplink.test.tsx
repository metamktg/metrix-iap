// ─── Arriving already scoped to a run (N-5) ───────────────────────────
//
// A run row on Analysis History linked to "Open in Analysis Overview" and
// then asked the reader to find that same run again in the picker — the one
// choice they had just made. `?run=<id>` applies it on arrival.
//
// The rules that keep it from becoming a second source of truth:
//   · it writes into the SAME stored selection the picker owns, so the
//     picker still works and a later change is not fought by the URL;
//   · it applies once per account+run, not on every render;
//   · a run id the account does not have is ignored rather than emptying
//     the page — a stale link is a stale link, not a data loss.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedRunScope } from "../run-scope";
import type { AnalysisRun } from "@workspace/api-client-react";

const RUNS = [
  { id: "run-a", status: "success" },
  { id: "run-b", status: "success" },
] as unknown as AnalysisRun[];

function at(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  sessionStorage.clear();
  at("/app/analysis/overview");
});

describe("usePersistedRunScope — ?run=", () => {
  it("arrives scoped to the run the link names", () => {
    at("/app/analysis/overview?run=run-b");
    const { result } = renderHook(() => usePersistedRunScope("analysis-overview", "acct", RUNS));
    expect(result.current[0].allTime).toBe(false);
    expect(result.current[0].selectedRunIds).toEqual(["run-b"]);
  });

  it("hands the scope to the picker afterwards — a later choice is not overwritten", () => {
    at("/app/analysis/overview?run=run-b");
    const { result, rerender } = renderHook(() => usePersistedRunScope("analysis-overview", "acct", RUNS));
    act(() => { result.current[1]({ allTime: true, selectedRunIds: [] }); });
    rerender();
    // The URL still says run-b; the reader has since said "all time", and
    // that wins.
    expect(result.current[0].allTime).toBe(true);
  });

  it("ignores a run this account does not have, rather than emptying the page", () => {
    at("/app/analysis/overview?run=run-from-another-account");
    const { result } = renderHook(() => usePersistedRunScope("analysis-overview", "acct", RUNS));
    expect(result.current[0].allTime).toBe(true);
  });

  it("waits for the run list — nothing is applied while it is still loading", () => {
    at("/app/analysis/overview?run=run-b");
    const { result } = renderHook(() => usePersistedRunScope("analysis-overview", "acct", undefined));
    expect(result.current[0].allTime).toBe(true);
  });

  it("writes through the picker's own storage, so a reload keeps the scope", () => {
    at("/app/analysis/overview?run=run-a");
    renderHook(() => usePersistedRunScope("analysis-overview", "acct", RUNS));
    at("/app/analysis/overview");
    const { result } = renderHook(() => usePersistedRunScope("analysis-overview", "acct", RUNS));
    expect(result.current[0].selectedRunIds).toEqual(["run-a"]);
  });
});
