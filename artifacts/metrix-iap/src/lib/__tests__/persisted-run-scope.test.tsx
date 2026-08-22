// ─── usePersistedRunScope ──────────────────────────────────────────────
// Per-page, per-account sessionStorage persistence of the RunScopePicker
// selection, with a stale-run guard: once the run list loads, any stored
// run id that no longer exists resets the selection to All time.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedRunScope } from "@/lib/run-scope";
import { ALL_TIME_SELECTION } from "@/components/analysis/RunSelector";
import type { AnalysisRun } from "@workspace/api-client-react";

const ACCOUNT = "acct-1";
const KEY = `metrix.runScope.test-page.${ACCOUNT}`;

function mkRun(id: string): AnalysisRun {
  return { id, started_at: "2026-01-01T00:00:00Z" } as AnalysisRun;
}

const RUNS = [mkRun("run-a"), mkRun("run-b")];

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("usePersistedRunScope", () => {
  it("defaults to All time with nothing stored", () => {
    const { result } = renderHook(() => usePersistedRunScope("test-page", ACCOUNT, RUNS));
    expect(result.current[0]).toEqual(ALL_TIME_SELECTION);
  });

  it("persists a selection and restores it on remount", () => {
    const first = renderHook(() => usePersistedRunScope("test-page", ACCOUNT, RUNS));
    act(() => first.result.current[1]({ allTime: false, selectedRunIds: ["run-a"] }));
    first.unmount();

    const second = renderHook(() => usePersistedRunScope("test-page", ACCOUNT, RUNS));
    expect(second.result.current[0]).toEqual({ allTime: false, selectedRunIds: ["run-a"] });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      allTime: false,
      selectedRunIds: ["run-a"],
    });
  });

  it("scopes storage per account", () => {
    const a = renderHook(() => usePersistedRunScope("test-page", ACCOUNT, RUNS));
    act(() => a.result.current[1]({ allTime: false, selectedRunIds: ["run-b"] }));
    a.unmount();

    const other = renderHook(() => usePersistedRunScope("test-page", "acct-2", RUNS));
    expect(other.result.current[0]).toEqual(ALL_TIME_SELECTION);
  });

  it("falls back to All time when a stored run id no longer exists", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ allTime: false, selectedRunIds: ["deleted-run"] }));
    const { result } = renderHook(() => usePersistedRunScope("test-page", ACCOUNT, RUNS));
    expect(result.current[0]).toEqual(ALL_TIME_SELECTION);
    // Stored value is also reset so the stale id never comes back.
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(ALL_TIME_SELECTION);
  });

  it("keeps a stored selection while runs are still loading (undefined)", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ allTime: false, selectedRunIds: ["run-a"] }));
    const { result, rerender } = renderHook(
      ({ runs }: { runs: AnalysisRun[] | undefined }) =>
        usePersistedRunScope("test-page", ACCOUNT, runs),
      { initialProps: { runs: undefined as AnalysisRun[] | undefined } },
    );
    expect(result.current[0]).toEqual({ allTime: false, selectedRunIds: ["run-a"] });
    rerender({ runs: RUNS });
    expect(result.current[0]).toEqual({ allTime: false, selectedRunIds: ["run-a"] });
  });

  it("switching accounts restores each account's own selection without clobbering it", () => {
    // Account A selected run-a; account B selected b-run-1 (its own run list).
    const RUNS_B = [mkRun("b-run-1"), mkRun("b-run-2")];
    const KEY_B = "metrix.runScope.test-page.acct-2";
    sessionStorage.setItem(KEY, JSON.stringify({ allTime: false, selectedRunIds: ["run-a"] }));
    sessionStorage.setItem(KEY_B, JSON.stringify({ allTime: false, selectedRunIds: ["b-run-1"] }));

    const { result, rerender } = renderHook(
      ({ account, runs }: { account: string; runs: AnalysisRun[] }) =>
        usePersistedRunScope("test-page", account, runs),
      { initialProps: { account: ACCOUNT, runs: RUNS } },
    );
    expect(result.current[0]).toEqual({ allTime: false, selectedRunIds: ["run-a"] });

    // Switch to account B with its run list already loaded (cached). The
    // stale-run guard must NOT validate A's ids against B's runs and wipe
    // B's stored selection.
    rerender({ account: "acct-2", runs: RUNS_B });
    expect(result.current[0]).toEqual({ allTime: false, selectedRunIds: ["b-run-1"] });
    expect(JSON.parse(sessionStorage.getItem(KEY_B)!)).toEqual({
      allTime: false,
      selectedRunIds: ["b-run-1"],
    });

    // And switching back restores A's selection untouched.
    rerender({ account: ACCOUNT, runs: RUNS });
    expect(result.current[0]).toEqual({ allTime: false, selectedRunIds: ["run-a"] });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      allTime: false,
      selectedRunIds: ["run-a"],
    });
  });

  it("inert (controlled-child) hooks never validate or write the shared storage key", () => {
    // Parent owns "test-page" persistence and has run B selected; the
    // controlled child mounts an inert hook whose unused local state
    // defaults to All time — but simulate the reviewer scenario: the
    // stored value holds run A, the parent switches to run B, then a runs
    // refetch drops A. The inert child must not clobber B in storage.
    sessionStorage.setItem(KEY, JSON.stringify({ allTime: false, selectedRunIds: ["run-a"] }));

    const parent = renderHook(
      ({ runs }: { runs: AnalysisRun[] }) => usePersistedRunScope("test-page", ACCOUNT, runs),
      { initialProps: { runs: RUNS } },
    );
    const child = renderHook(
      ({ runs }: { runs: AnalysisRun[] }) =>
        usePersistedRunScope("test-page", ACCOUNT, runs, false),
      { initialProps: { runs: RUNS } },
    );
    // Inert hook ignores storage entirely.
    expect(child.result.current[0]).toEqual(ALL_TIME_SELECTION);

    // Parent selection moves A → B, then a refetch removes run A.
    act(() => parent.result.current[1]({ allTime: false, selectedRunIds: ["run-b"] }));
    const refreshed = [mkRun("run-b")];
    parent.rerender({ runs: refreshed });
    child.rerender({ runs: refreshed });

    // B survives in state and storage; the child wrote nothing.
    expect(parent.result.current[0]).toEqual({ allTime: false, selectedRunIds: ["run-b"] });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      allTime: false,
      selectedRunIds: ["run-b"],
    });

    // And inert setters keep working locally without touching storage.
    act(() => child.result.current[1]({ allTime: false, selectedRunIds: ["run-b"] }));
    expect(child.result.current[0]).toEqual({ allTime: false, selectedRunIds: ["run-b"] });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      allTime: false,
      selectedRunIds: ["run-b"],
    });
  });

  it("normalizes corrupt or invalid stored values to All time", () => {
    sessionStorage.setItem(KEY, "{not json");
    const a = renderHook(() => usePersistedRunScope("test-page", ACCOUNT, RUNS));
    expect(a.result.current[0]).toEqual(ALL_TIME_SELECTION);
    a.unmount();

    sessionStorage.setItem(KEY, JSON.stringify({ allTime: false, selectedRunIds: [] }));
    const b = renderHook(() => usePersistedRunScope("test-page", ACCOUNT, RUNS));
    expect(b.result.current[0]).toEqual(ALL_TIME_SELECTION);
  });
});
