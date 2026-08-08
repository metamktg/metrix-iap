// ─── In-page run-scope picker e2e (jsdom) ─────────────────────────────
// Complements run-scope-picker.test.tsx (harness-level cap test +
// ConceptMapView narrowing) by driving the REAL RunScopePicker rendered
// inside IapLibraryView and StrategyOverview page headers:
//   1. open the popover (button-run-scope), select 3 runs, attempt a 4th
//      → cap note (text-run-cap) appears and the 4th is not selected;
//   2. selecting a single run narrows the page's content vs "All time"
//      (Creative cells tab count on IAP Library, Message pillars tile on
//      Strategy Overview).
//
// The checked-in fixture's rollup rows are legacy (null run id, always
// pass), so concepts are tagged with synthetic run ids: C4 → run_1,
// every other concept → run_2. Scoping to run_1 must therefore drop the
// C2* cells (IAP Library) and the C2-anchored pillars (Strategy).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Tag bookster's concept rollup rows with synthetic run ids so run
// scoping actually bites (untagged/legacy rows always pass by design).
const seed = JSON.parse(JSON.stringify(baseSeed));
const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const rollup: Array<{ concept: string; manual_analysis_run_id: string | null }> =
  bookster.iap.analysis.concept_rollup ?? [];
const cells: Array<{ cell_id: string }> = bookster.iap.analysis.performance_by_cell;
const concepts = [...new Set(rollup.map((r) => r.concept))];
// RUN_1_CONCEPT owns some but not all perf cells → scoping provably narrows.
const RUN_1_CONCEPT = concepts.find(
  (c) =>
    cells.some((r) => r.cell_id.startsWith(c)) &&
    !cells.every((r) => r.cell_id.startsWith(c)),
);
if (!RUN_1_CONCEPT) throw new Error("fixture has no concept suitable for the narrowing test");
for (const r of rollup) {
  r.manual_analysis_run_id = r.concept === RUN_1_CONCEPT ? "run_1" : "run_2";
}

// Strategy pillars are anchored to concepts via source_cells; the run that
// does NOT own any pillar-anchoring concept is the one that provably
// narrows the pillar count.
const pillarConcepts = new Set(
  (bookster.iap.strategy?.message_pillars ?? []).flatMap(
    (p: { source_cells: string[] }) => p.source_cells.map((c) => (concepts.find((k) => c.startsWith(k)) ?? c)),
  ),
);
const PILLAR_EXCLUDING_RUN = pillarConcepts.has(RUN_1_CONCEPT) ? "run_2" : "run_1";

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The pages fetch their run list via useListAnalysisRuns — serve the
// synthetic runs from the mock (4 of them so the cap is reachable).
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: RUNS }, isLoading: false }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { IapLibraryView } from "../analysis/IapLibraryView";
import { StrategyOverview } from "../strategy/StrategyOverview";
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

function renderView(View: React.ComponentType) {
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
            <View />
          </AnalysisViewProvider>
        </DateRangeProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

/** Open the page-header picker, select 3 runs, attempt a 4th; assert the
 *  cap note and that the 4th never selects. */
function exerciseCap() {
  fireEvent.click(screen.getByTestId("button-run-scope"));
  for (const id of ["run_1", "run_2", "run_3"]) {
    fireEvent.click(screen.getByTestId(`option-run-${id}`));
  }
  expect(screen.queryByTestId("text-run-cap")).toBeNull();

  fireEvent.click(screen.getByTestId("option-run-run_4"));
  expect(screen.getByTestId("text-run-cap")).toBeTruthy();

  // Trigger shows exactly 3 selections (count badge "3"), never a 4th.
  const trigger = screen.getByTestId("button-run-scope");
  expect(trigger.textContent).not.toContain("All time");
  expect(trigger.textContent).toContain("3");
}

const libCellCount = (text: string | null) => {
  const m = /Creative cells(\d+)/.exec(text ?? "");
  return m ? Number(m[1]) : null;
};

const pillarCount = (text: string | null) => {
  const m = /Message pillars(\d+)/.exec(text ?? "");
  return m ? Number(m[1]) : null;
};

describe("IAP Library — in-page run scope picker", () => {
  it("enforces the 3-run cap from the page header popover", () => {
    renderView(IapLibraryView);
    exerciseCap();
  });

  it("narrows the Creative cells count when scoped to one run", () => {
    const view = renderView(IapLibraryView);
    const allCells = libCellCount(view.container.textContent);
    expect(allCells).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-run_1"));

    const scopedCells = libCellCount(view.container.textContent);
    expect(scopedCells).not.toBeNull();
    expect(scopedCells!).toBeGreaterThan(0);
    expect(scopedCells!).toBeLessThan(allCells!);

    // Back to All time restores the full count.
    fireEvent.click(screen.getByTestId("option-run-all-time"));
    expect(libCellCount(view.container.textContent)).toBe(allCells);
  });
});

describe("Strategy Overview — in-page run scope picker", () => {
  it("enforces the 3-run cap from the page header popover", () => {
    renderView(StrategyOverview);
    exerciseCap();
  });

  it("narrows the Message pillars tile when scoped to one run", () => {
    const view = renderView(StrategyOverview);
    const allPillars = pillarCount(view.container.textContent);
    expect(allPillars).toBeGreaterThan(0);

    // Scope to the run that owns none of the pillar-anchoring concepts —
    // those pillars must drop out (pillars with no source cells always pass).
    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId(`option-run-${PILLAR_EXCLUDING_RUN}`));

    const scopedPillars = pillarCount(view.container.textContent);
    expect(scopedPillars).not.toBeNull();
    expect(scopedPillars!).toBeLessThan(allPillars!);

    fireEvent.click(screen.getByTestId("option-run-all-time"));
    expect(pillarCount(view.container.textContent)).toBe(allPillars);
  });
});
