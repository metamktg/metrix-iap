// ─── Strategy · Avatars — run scope wiring & hypothesis fold ───────────
// Covers two of the four data-coverage-audit fixes against the real
// bookster fixture:
//   1. The RunScopePicker actually narrows AvatarsView's KPIs once wired
//      (not cosmetic). The fixture's ICP profiles carry no
//      matched_profile_ids, so per-ICP $ figures honestly fall back to
//      their precomputed all-time value under any scope (never
//      fabricated) — the audience-segment count/tiles are the real,
//      cell-attributed numbers that DO narrow, so that's what this test
//      exercises.
//   2. The hypothesis fold now renders HypothesisLabel/HypothesisStatusBadge
//      plus .risk and .expected_impact — real, previously-unsurfaced
//      ActiveHypothesis fields.

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

// Same synthetic run tagging as run-scope-page-e2e.test.tsx /
// mst-command-center-fixes.test.tsx: the concept that owns SOME but not
// ALL performance_by_cell (and, here, demographic_registration_signal)
// rows becomes RUN_1_CONCEPT; every rollup row is tagged run_1/run_2
// accordingly so scoping provably narrows cell-attributed data.
const seed = JSON.parse(JSON.stringify(baseSeed));
const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const rollup: Array<{ concept: string; manual_analysis_run_id: string | null }> =
  bookster.iap.analysis.concept_rollup ?? [];
const perfCells: Array<{ cell_id: string }> = bookster.iap.analysis.performance_by_cell;
const concepts = [...new Set(rollup.map((r) => r.concept))];
const RUN_1_CONCEPT = concepts.find(
  (c) => perfCells.some((r) => r.cell_id.startsWith(c)) && !perfCells.every((r) => r.cell_id.startsWith(c)),
);
if (!RUN_1_CONCEPT) throw new Error("fixture has no concept suitable for the narrowing test");
for (const r of rollup) {
  r.manual_analysis_run_id = r.concept === RUN_1_CONCEPT ? "run_1" : "run_2";
}

const demoRows: Array<{ cell_id: string; Age: string; Gender: string }> =
  bookster.iap.analysis.demographic_registration_signal ?? [];
function segCount(rows: typeof demoRows): number {
  return new Set(rows.map((r) => `${r.Age}|${r.Gender}`)).size;
}
const allSegs = segCount(demoRows);
const run1Segs = segCount(demoRows.filter((r) => r.cell_id.startsWith(RUN_1_CONCEPT)));
const run2Segs = segCount(demoRows.filter((r) => !r.cell_id.startsWith(RUN_1_CONCEPT)));
const NARROWING_RUN = run1Segs < allSegs ? "run_1" : run2Segs < allSegs ? "run_2" : null;
if (!NARROWING_RUN) throw new Error("fixture doesn't allow a demographic-narrowing demo");
const NARROWED_SEGS = NARROWING_RUN === "run_1" ? run1Segs : run2Segs;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

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
const RUNS: AnalysisRun[] = [makeRun("run_1", 1), makeRun("run_2", 2)];

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: RUNS }, isLoading: false }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AvatarsView } from "../strategy/AvatarsView";
import type { AnalysisRun } from "@workspace/api-client-react";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderAvatars() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <AvatarsView />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const segmentsCount = (text: string | null) => {
  const m = /Segments(\d+)/.exec(text ?? "");
  return m ? Number(m[1]) : null;
};

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("AvatarsView — run-scope wiring narrows cell-attributed KPIs (item 1)", () => {
  it("narrows the Segments tile when scoped to a run, and restores it on All time", () => {
    const view = renderAvatars();
    expect(segmentsCount(view.container.textContent)).toBe(allSegs);

    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId(`option-run-${NARROWING_RUN}`));

    expect(segmentsCount(view.container.textContent)).toBe(NARROWED_SEGS);
    expect(NARROWED_SEGS).toBeLessThan(allSegs);

    // The popover stays open across in-popover selections (only the
    // trigger button toggles it), so no extra trigger click is needed.
    fireEvent.click(screen.getByTestId("option-run-all-time"));
    expect(segmentsCount(view.container.textContent)).toBe(allSegs);
  });
});

describe("AvatarsView — hypothesis fold surfaces real fields (item 2)", () => {
  it("shows the hypothesis status/priority, risk, and expected impact for a real, populated hypothesis", () => {
    renderAvatars();

    // Narrow to the one ICP card HYP_001 targets, via the profile search box.
    fireEvent.change(screen.getByPlaceholderText("Filter profiles…"), { target: { value: "time-poor" } });

    fireEvent.click(screen.getByText("Profile detail"));

    // .status (P1) via HypothesisStatusBadge's real label mapping — this
    // ICP has more than one P1 hypothesis, so assert presence, not uniqueness.
    expect(screen.getAllByText("P1 · High priority").length).toBeGreaterThan(0);
    // .risk — previously never rendered anywhere on this page. Unique to
    // HYP_001 among this account's hypotheses.
    expect(screen.getByText(/Low - extends a proven lane/)).toBeTruthy();
    // .expected_impact — previously never rendered anywhere on this page.
    // Unique to HYP_001 among this account's hypotheses.
    expect(screen.getByText(/10-20% CPA improvement/)).toBeTruthy();
  });
});
