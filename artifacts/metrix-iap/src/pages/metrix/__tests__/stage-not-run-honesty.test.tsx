// ─── StageNotRunState: an empty stage must not lie about why ──────────
//
// The Action Queue used to tell every user, on every account, forever:
//
//   "No actions yet — Run analysis to generate optimization recommendations
//    for this account."
//
// `metrixSeedAssembly` sets `optimization_loop: null` as a hardcoded literal
// and nothing writes it, so that instruction could not be satisfied by
// anyone. These tests pin the three states the generic copy collapsed, and
// the absence of the instruction itself.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StageNotRunState, useLoopStage } from "../shared";
import { renderHook } from "@testing-library/react";

const acct = (loop_status: Array<Record<string, unknown>> | undefined) =>
  ({ iap: loop_status ? { loop_status } : {} }) as never;

const BOOKSTER_NOTE =
  "Not yet run — golden-formula output requires the Creative Scan / Test Engine stage plus raw Meta exports with real ad_id.";
const ECAS_NOTE =
  "Not yet run — blocked on creative_scan (which is blocked on tracking fix + budget delivery).";

describe("StageNotRunState", () => {
  it("shows the stage's own note verbatim when the seed carries one", () => {
    render(
      <StageNotRunState
        title="No actions yet"
        stageLabel="Optimization Loop"
        stage="optimization_loop"
        account={acct([{ stage: "optimization_loop", status: "pending", note: BOOKSTER_NOTE }])}
      />,
    );
    expect(screen.getByText(BOOKSTER_NOTE)).toBeTruthy();
  });

  it("shows a DIFFERENT account's different real blocker — the note is not generic copy", () => {
    render(
      <StageNotRunState
        title="No actions yet"
        stageLabel="Optimization Loop"
        stage="optimization_loop"
        account={acct([{ stage: "optimization_loop", status: "pending", note: ECAS_NOTE }])}
      />,
    );
    expect(screen.getByText(ECAS_NOTE)).toBeTruthy();
    expect(screen.queryByText(BOOKSTER_NOTE)).toBeNull();
  });

  it("distinguishes a registered-but-noteless stage from an unregistered one", () => {
    const { unmount } = render(
      <StageNotRunState
        title="t" stageLabel="Optimization Loop" stage="optimization_loop"
        account={acct([{ stage: "optimization_loop", status: "pending", note: null }])}
      />,
    );
    expect(screen.getByText(/registered for this account and has not run yet/)).toBeTruthy();
    unmount();

    // No row at all — true of every manual-upload account in the seed. That
    // is a different fact from "pending" and must not read the same.
    render(
      <StageNotRunState
        title="t" stageLabel="Optimization Loop" stage="optimization_loop"
        account={acct([{ stage: "analysis_core", status: "complete", note: null }])}
      />,
    );
    expect(screen.getByText("The Optimization Loop stage has not run for this account.")).toBeTruthy();
    expect(screen.queryByText(/registered for this account/)).toBeNull();
  });

  it("never tells the reader to run analysis — analysis does not produce this stage", () => {
    for (const status of [
      [{ stage: "optimization_loop", status: "pending", note: BOOKSTER_NOTE }],
      [{ stage: "optimization_loop", status: "pending", note: null }],
      [{ stage: "analysis_core", status: "complete", note: null }],
    ]) {
      const { container, unmount } = render(
        <StageNotRunState
          title="No actions yet" stageLabel="Optimization Loop"
          stage="optimization_loop" account={acct(status)}
        />,
      );
      expect(container.textContent).not.toMatch(/run analysis/i);
      unmount();
    }
  });

  it("names the source table so the claim is checkable", () => {
    render(
      <StageNotRunState
        title="t" stageLabel="Optimization Loop" stage="optimization_loop"
        account={acct(undefined)}
      />,
    );
    expect(screen.getByText("loop_status → optimization_loop")).toBeTruthy();
  });

  it("handles a null account without throwing", () => {
    render(
      <StageNotRunState
        title="t" stageLabel="Optimization Loop" stage="optimization_loop" account={null}
      />,
    );
    expect(screen.getByText("The Optimization Loop stage has not run for this account.")).toBeTruthy();
  });
});

describe("useLoopStage", () => {
  it("finds the matching stage and returns null when absent", () => {
    const rows = [
      { stage: "analysis_core", status: "complete" },
      { stage: "optimization_loop", status: "pending", note: ECAS_NOTE },
    ];
    const { result } = renderHook(() => useLoopStage(acct(rows), "optimization_loop"));
    expect(result.current?.note).toBe(ECAS_NOTE);

    const { result: missing } = renderHook(() => useLoopStage(acct(rows), "creative_scan"));
    expect(missing.current).toBeNull();
  });
});
