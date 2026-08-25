// ─── A working run must not look like a dead one (BUG-42) ─────────────
//
// The engine writes no progress during the model call — strategy goes 10%
// "Calling strategy model…" straight to 60%. So without a clock, a healthy
// four-minute run and a run whose process died render IDENTICALLY.
//
// Both bug reports on 2026-08-25 were this. One run was genuinely wedged;
// the other was working and finished normally with 16 briefs. The operator
// saw the same screen both times.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GenerationProgressBar } from "../GenerationControls";

afterEach(() => cleanup());

const RUNNING = { isRunning: true, progressPercent: 10, stageLabel: "Calling brief model…" };

describe("GenerationProgressBar liveness", () => {
  it("shows elapsed time, the only thing that separates working from dead", () => {
    render(<GenerationProgressBar {...RUNNING} elapsedSeconds={255} typicalSeconds={210} />);
    expect(screen.getByTestId("generation-elapsed").textContent).toBe("4m 15s");
  });

  it("explains the held bar while the run is within its usual time", () => {
    render(<GenerationProgressBar {...RUNNING} elapsedSeconds={90} typicalSeconds={210} />);
    expect(screen.getByTestId("generation-pace-note").textContent).toContain("bar holds");
  });

  it("says so once the run overruns, rather than reassuring inaccurately", () => {
    render(<GenerationProgressBar {...RUNNING} elapsedSeconds={400} typicalSeconds={210} />);
    expect(screen.getByTestId("generation-pace-note").textContent).toContain("Longer than");
  });

  it("renders two runs at the same percentage DIFFERENTLY when their ages differ", () => {
    // The regression that matters. Same stage, same percent — a 30-second-old
    // run and a seven-minute-old one must not be indistinguishable.
    const { unmount } = render(
      <GenerationProgressBar {...RUNNING} elapsedSeconds={30} typicalSeconds={210} />,
    );
    const young = document.body.textContent ?? "";
    unmount();
    render(<GenerationProgressBar {...RUNNING} elapsedSeconds={420} typicalSeconds={210} />);
    const old = document.body.textContent ?? "";
    expect(young).not.toBe(old);
  });

  it("still renders without a clock, for callers that have no run timer", () => {
    render(<GenerationProgressBar {...RUNNING} />);
    expect(screen.getByTestId("generation-progress-bar")).toBeTruthy();
    expect(screen.queryByTestId("generation-elapsed")).toBeNull();
    expect(screen.queryByTestId("generation-pace-note")).toBeNull();
  });

  it("renders nothing at all when no run is in flight", () => {
    render(<GenerationProgressBar isRunning={false} progressPercent={0} stageLabel="" elapsedSeconds={10} typicalSeconds={210} />);
    expect(screen.queryByTestId("generation-progress-bar")).toBeNull();
  });
});
