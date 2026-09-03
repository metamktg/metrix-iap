// ─── Analysis-validated gating regression tests ─────────────────────────
// The Strategy stage (and downstream stages) must unlock only when the
// analysis is VALIDATED — status=success plus the server-side completeness
// check (stage-status `analysis.validated`). All command centers derive
// readiness from the same buildLoopStages helper, so gating it here keeps
// every module consistent.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildLoopStages, type StageStatusLike } from "../shared";
import { GenerationProgressBar } from "@/components/generation/GenerationControls";

function status(overrides: Partial<StageStatusLike["analysis"]>): StageStatusLike {
  return {
    analysis: { status: "success", validated: true, ...overrides },
    strategy: { status: "none" },
    briefs: { status: "none", count: 0 },
    mst: { unlocked: false },
  };
}

describe("buildLoopStages analysis-validated gating", () => {
  it("unlocks Strategy and Action when analysis is success AND validated", () => {
    const stages = buildLoopStages(status({}));
    expect(stages.find((s) => s.id === "strategy")!.status).not.toBe("locked");
    expect(stages.find((s) => s.id === "action")!.status).not.toBe("locked");
  });

  it("keeps Strategy and Action locked when analysis succeeded but is NOT validated", () => {
    const stages = buildLoopStages(status({ validated: false }));
    expect(stages.find((s) => s.id === "strategy")!.status).toBe("locked");
    expect(stages.find((s) => s.id === "action")!.status).toBe("locked");
  });

  it("keeps Strategy locked when analysis has not run", () => {
    const stages = buildLoopStages(status({ status: "none", validated: false }));
    expect(stages.find((s) => s.id === "strategy")!.status).toBe("locked");
  });

  it("treats a missing validated field as ready (backwards-compatible payloads)", () => {
    const stages = buildLoopStages(status({ validated: undefined }));
    expect(stages.find((s) => s.id === "strategy")!.status).not.toBe("locked");
  });
});

describe("GenerationProgressBar", () => {
  it("renders the stage label and percentage while running", () => {
    render(
      <GenerationProgressBar isRunning={true} progressPercent={42} stageLabel="Generating strategy…" />,
    );
    expect(screen.getByTestId("generation-progress-bar")).toBeTruthy();
    expect(screen.getByText("Generating strategy…")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("renders nothing when not running", () => {
    const { container } = render(
      <GenerationProgressBar isRunning={false} progressPercent={0} stageLabel="x" />,
    );
    expect(container.querySelector("[data-testid='generation-progress-bar']")).toBeNull();
  });
});
