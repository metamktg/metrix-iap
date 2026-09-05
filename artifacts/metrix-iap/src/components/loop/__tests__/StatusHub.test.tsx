// ─── StatusHub · four rows, the loop's vocabulary, prose behind disclosure ──

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { StatusHub } from "../StatusHub";
import type { StatusHubModel } from "@/lib/loop/statusHub";

afterEach(cleanup);

const empty: StatusHubModel = {
  inputs: [{ label: "Nothing staged", detail: "Add a performance export" }],
  inFlight: null,
  lastCompleted: null,
  failed: null,
  history: { to: "/app/analysis/history", count: 0 },
};

describe("StatusHub", () => {
  it("is a labelled region with the Staged and History rows always, and no Running, Completed or Failed row without one", () => {
    render(<StatusHub model={empty} label="Analysis status" />);
    const hub = screen.getByRole("region", { name: "Analysis status" });
    expect(within(hub).getByText("Staged")).toBeTruthy();
    expect(within(hub).getByText("Nothing staged")).toBeTruthy();
    expect(within(hub).getByText("No completed runs yet")).toBeTruthy();
    expect(screen.queryByTestId("status-hub-in-flight")).toBeNull();
    expect(screen.queryByTestId("status-hub-completed")).toBeNull();
    expect(screen.queryByTestId("status-hub-failed")).toBeNull();
  });

  it("renders the run in flight as a labelled bar with the engine's stage, the elapsed time and the evidence-based ETA", () => {
    render(
      <StatusHub
        label="Analysis status"
        model={{
          ...empty,
          inFlight: { runId: "r1", startedAt: "2026-09-05T10:00:00Z", stage: "Reconciling: the ledger", percent: 87, elapsedSeconds: 754, etaSeconds: 1841, slowStage: null },
        }}
      />,
    );
    const row = screen.getByTestId("status-hub-in-flight");
    expect(within(row).getByText("Running")).toBeTruthy();
    expect(within(row).getByText("Reconciling: the ledger")).toBeTruthy();
    expect(within(row).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("87");
    expect(within(row).getByTestId("status-hub-elapsed").textContent).toContain("12m 34s elapsed");
    expect(within(row).getByTestId("status-hub-elapsed").textContent).toContain("usually about 31 min");
    expect(screen.queryByTestId("status-hub-slow-stage")).toBeNull();
  });

  it("shows no ETA and no percentage when the engine has reported neither, and names a stage running past its usual duration", () => {
    render(
      <StatusHub
        label="Analysis status"
        model={{
          ...empty,
          inFlight: { runId: "r1", startedAt: "2026-09-05T10:00:00Z", stage: "Reconciling reports against the control source", percent: null, elapsedSeconds: 0, etaSeconds: null, slowStage: "Reconciling reports against the control source" },
        }}
      />,
    );
    const row = screen.getByTestId("status-hub-in-flight");
    expect(within(row).getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();
    expect(within(row).getByTestId("status-hub-elapsed").textContent).toContain("Starting");
    expect(within(row).getByTestId("status-hub-elapsed").textContent).not.toContain("usually about");
    expect(within(row).getByTestId("status-hub-slow-stage").textContent).toContain("is taking longer than usual");
  });

  it("summarises the last completed run and discloses its warnings on demand", () => {
    render(
      <StatusHub
        label="Analysis status"
        model={{
          ...empty,
          lastCompleted: { runId: "ok", finishedAt: "2026-09-04T11:52:48Z", summary: "2026-08-04 → 2026-09-02 · 21,130 rows", warnings: ["[Overlap] file A lost 12 ads to file B", "[Truth] two daily summaries are one control"], detailsTo: "/app/analysis/history" },
          history: { to: "/app/analysis/history", count: 3 },
        }}
      />,
    );
    const row = screen.getByTestId("status-hub-completed");
    expect(within(row).getByText("Completed")).toBeTruthy();
    expect(within(row).getByText("2026-08-04 → 2026-09-02 · 21,130 rows")).toBeTruthy();
    expect(screen.queryByText("[Overlap] file A lost 12 ads to file B")).toBeNull();
    fireEvent.click(screen.getByTestId("status-hub-warnings"));
    expect(screen.getByText("[Overlap] file A lost 12 ads to file B")).toBeTruthy();
    expect(screen.getByText("3 completed runs")).toBeTruthy();
  });

  it("clips a failure's message on the first layer, keeps the whole text behind the reveal, and says what is still shown", () => {
    const message = "index row size 3432 exceeds btree version 4 maximum 2704 for index variable_segment_performance_account_id_manual_analysis_run_key";
    render(
      <StatusHub
        label="Analysis status"
        model={{ ...empty, failed: { runId: "bad", finishedAt: "2026-09-04T10:00:00Z", message, retained: "The last successful run's data is still shown" } }}
      />,
    );
    const row = screen.getByTestId("status-hub-failed");
    expect(within(row).getByText("Failed")).toBeTruthy();
    expect(within(row).getByText("· The last successful run's data is still shown")).toBeTruthy();
    expect(screen.queryByText(message)).toBeNull();
    fireEvent.click(screen.getByTestId("status-hub-failure"));
    expect(screen.getByText(message)).toBeTruthy();
  });
});
