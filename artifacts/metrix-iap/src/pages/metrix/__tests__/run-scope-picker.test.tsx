// ─── Compact run-scope picker tests ────────────────────────────────────
// 1. RunScopePicker enforces the 3-run selection cap: picking a 4th run
//    shows the cap note instead of silently selecting it.
// 2. Selecting a specific run actually narrows view content (ConceptMapView
//    rendered controlled, the same wiring MstCrossMapView uses). The
//    checked-in fixture's rollup rows are all legacy (null run id) — which
//    must always pass — so the narrowing test tags concepts with synthetic
//    run ids, mirroring the run-scope.ts "never hide untagged rows" rule.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

// Deep-clone the fixture and tag bookster's concept rollup rows with
// synthetic run ids: the first concept → run_a, every other → run_b.
const seed = JSON.parse(JSON.stringify(baseSeed));
const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const rollup: Array<{ concept: string; manual_analysis_run_id: string | null }> =
  bookster.iap.analysis.concept_rollup ?? [];
const concepts = [...new Set(rollup.map((r) => r.concept))];
// Pick a concept that actually owns cells in performance_by_cell (cell ids
// are prefixed by their concept code, e.g. cell "C2B" → concept "C2") but
// not ALL of them, so scoping to run_a provably narrows the view.
const cells: Array<{ cell_id: string }> = bookster.iap.analysis.performance_by_cell;
const RUN_A_CONCEPT = concepts.find(
  (c) =>
    cells.some((r) => r.cell_id.startsWith(c)) &&
    !cells.every((r) => r.cell_id.startsWith(c)),
)!;
if (!RUN_A_CONCEPT) throw new Error("fixture has no concept suitable for the narrowing test");
for (const r of rollup) {
  r.manual_analysis_run_id = r.concept === RUN_A_CONCEPT ? "run_a" : "run_b";
}

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import {
  RunScopePicker,
  ALL_TIME_SELECTION,
  type RunSelectorValue,
} from "@/components/analysis/RunSelector";
import { ConceptMapView } from "../mst/ConceptMapView";
import type { AnalysisRun } from "@workspace/api-client-react";

const ACCOUNT_KEY = "metrix_active_account_v1";

function makeRun(id: string, n: number): AnalysisRun {
  return {
    id,
    status: "success",
    date_range: "7d",
    date_start: `2025-01-0${n}`,
    date_end: `2025-01-0${n + 1}`,
    rows_ingested: 10 * n,
    started_at: `2025-01-0${n}T10:0${n}:00.000Z`,
    finished_at: `2025-01-0${n}T10:1${n}:00.000Z`,
  } as AnalysisRun;
}

const RUNS: AnalysisRun[] = [1, 2, 3, 4].map((n) => makeRun(`run_${n}`, n));

function PickerHarness() {
  const [value, setValue] = useState<RunSelectorValue>(ALL_TIME_SELECTION);
  return <RunScopePicker runs={RUNS} value={value} onChange={setValue} />;
}

function renderScoped(runScope: RunSelectorValue) {
  sessionStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <DateRangeProvider>
          <AnalysisViewProvider>
            <ConceptMapView renderHeader={false} runScope={runScope} onRunScopeChange={() => {}} />
          </AnalysisViewProvider>
        </DateRangeProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

describe("RunScopePicker 3-run cap", () => {
  it("allows up to 3 runs and shows the cap note instead of selecting a 4th", () => {
    render(<PickerHarness />);
    fireEvent.click(screen.getByTestId("button-run-scope"));

    for (const id of ["run_1", "run_2", "run_3"]) {
      fireEvent.click(screen.getByTestId(`option-run-${id}`));
    }
    // No cap note while at the cap boundary via legal picks.
    expect(screen.queryByTestId("text-run-cap")).toBeNull();

    // A 4th pick must NOT select — it surfaces the cap note instead.
    fireEvent.click(screen.getByTestId("option-run-run_4"));
    expect(screen.getByTestId("text-run-cap")).toBeTruthy();

    // Trigger label reflects exactly the 3 selected runs, never the 4th.
    const label = screen.getByTestId("button-run-scope").textContent ?? "";
    expect(label).not.toContain("All time");
    // Deselecting one run clears the cap note and allows the 4th.
    fireEvent.click(screen.getByTestId("option-run-run_1"));
    fireEvent.click(screen.getByTestId("option-run-run_4"));
    expect(screen.queryByTestId("text-run-cap")).toBeNull();
  });

  it("falls back to All time when every run is deselected", () => {
    render(<PickerHarness />);
    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-run_1"));
    fireEvent.click(screen.getByTestId("option-run-run_1"));
    expect(screen.getByTestId("button-run-scope").textContent).toContain("All time");
  });
});

describe("run selection narrows view content", () => {
  const cellCount = (text: string | null) => {
    const m = /Creative cells(\d+)/.exec(text ?? "");
    return m ? Number(m[1]) : null;
  };

  it("ConceptMapView shows fewer creative cells scoped to one run than all time", () => {
    const all = renderScoped(ALL_TIME_SELECTION);
    const allCells = cellCount(all.container.textContent);
    expect(allCells).toBeGreaterThan(0);
    cleanup();

    const scoped = renderScoped({ allTime: false, selectedRunIds: ["run_a"] });
    const scopedCells = cellCount(scoped.container.textContent);
    expect(scopedCells).not.toBeNull();
    expect(scopedCells!).toBeGreaterThan(0);
    expect(scopedCells!).toBeLessThan(allCells!);
  });
});
