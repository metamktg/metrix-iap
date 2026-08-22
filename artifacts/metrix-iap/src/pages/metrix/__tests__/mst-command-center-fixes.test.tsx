// ─── MST Command Center — run scope, per-ad drawer, Link CVR fix ───────
// Covers three of the four data-coverage-audit fixes against the real
// bookster fixture:
//   1. The RunScopePicker actually narrows avatar-tile KPIs (spend, Link
//      CVR) once wired — not just a cosmetic control. Concept rollup rows
//      are tagged with synthetic run ids (mirrors run-scope-page-e2e.test)
//      so scoping provably drops one avatar's performance_by_cell rows.
//   2. The per-ad drawer (DrawerAdList) shows each AdRecord's own
//      .performance, not the shared cell-level rollup — two ads on the
//      same matrix cell must show different spend.
//   3. computeColumnPerf's "Link CVR" is now results ÷ link clicks × 100
//      (matching ICP performance_data.cvr_link_pct), not the old
//      link-clicks ÷ impressions × 100 (which was actually CTR).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
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
// Same derivation as run-scope-page-e2e.test.tsx: the concept that owns
// SOME but not ALL performance_by_cell rows is RUN_1_CONCEPT.
const seed = JSON.parse(JSON.stringify(baseSeed));
const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const rollup: Array<{ concept: string; manual_analysis_run_id: string | null }> =
  bookster.iap.analysis.concept_rollup ?? [];
const cellRowsRaw: Array<{
  cell_id: string;
  "Amount spent (USD)": number;
  Results: number;
  Impressions: number;
  "Link clicks": number;
}> = bookster.iap.analysis.performance_by_cell;
const concepts = [...new Set(rollup.map((r) => r.concept))];
const RUN_1_CONCEPT = concepts.find(
  (c) =>
    cellRowsRaw.some((r) => r.cell_id.startsWith(c)) &&
    !cellRowsRaw.every((r) => r.cell_id.startsWith(c)),
);
if (!RUN_1_CONCEPT) throw new Error("fixture has no concept suitable for the narrowing test");
for (const r of rollup) {
  r.manual_analysis_run_id = r.concept === RUN_1_CONCEPT ? "run_1" : "run_2";
}

// performance_by_cell rows partitioned by which synthetic run tag their
// concept carries. Scoping to "run_1" keeps only run1OwnedRows (and their
// avatar column); scoping to "run_2" keeps only run2OwnedRows.
const run1OwnedRows = cellRowsRaw.filter((r) => r.cell_id.startsWith(RUN_1_CONCEPT));
const run2OwnedRows = cellRowsRaw.filter((r) => !r.cell_id.startsWith(RUN_1_CONCEPT));
if (run2OwnedRows.length === 0) throw new Error("fixture has no column excluded by RUN_1_CONCEPT");

function sumSpend(rows: typeof cellRowsRaw): number {
  return rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
}
function realCvr(rows: typeof cellRowsRaw): number | null {
  const results = rows.reduce((s, r) => s + r.Results, 0);
  const linkClicks = rows.reduce((s, r) => s + r["Link clicks"], 0);
  return linkClicks > 0 ? (results / linkClicks) * 100 : null;
}
function wrongCtr(rows: typeof cellRowsRaw): number | null {
  const impressions = rows.reduce((s, r) => s + r.Impressions, 0);
  const linkClicks = rows.reduce((s, r) => s + r["Link clicks"], 0);
  return impressions > 0 ? (linkClicks / impressions) * 100 : null;
}

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
    // MST is gated on "at least one generated brief" — unlock it so the
    // avatar-tile grid (the thing under test) actually renders.
    useGetAccountStageStatus: () => ({
      data: {
        analysis: { status: "success", validated: true, last_run_at: null, date_range: null, progress_pct: 0, progress_stage: "" },
        strategy: { status: "success", last_run_at: null },
        briefs: { status: "success", last_run_at: null, count: 3 },
        mst: { unlocked: true },
      },
    }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { MstCommandCenter } from "../mst/MstCommandCenter";
import { fmtUSD, fmtPct } from "../shared";
import type { AnalysisRun } from "@workspace/api-client-react";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderMst() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <MstCommandCenter />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("MstCommandCenter — run-scope wiring narrows avatar KPIs", () => {
  it("Top spend share tile reflects the scoped avatar total, and the excluded avatar's stats disappear", () => {
    const view = renderMst();

    const allTimeTop = sumSpend(run1OwnedRows) >= sumSpend(run2OwnedRows)
      ? sumSpend(run1OwnedRows) : sumSpend(run2OwnedRows);
    expect(view.container.textContent).toContain(fmtUSD(allTimeTop, 0));

    // Scope to the run that excludes RUN_1_CONCEPT's own column.
    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-run_2"));

    // The RUN_1_CONCEPT column's performance rows are gone under run_2 —
    // its avatar tile no longer renders a Link CVR stat at all.
    const droppedSpendText = fmtUSD(sumSpend(run1OwnedRows), 0);
    if (sumSpend(run1OwnedRows) > 0) {
      expect(view.container.textContent).not.toContain(droppedSpendText);
    }

    // The surviving column's own total is unaffected and still shown.
    if (sumSpend(run2OwnedRows) > 0) {
      expect(view.container.textContent).toContain(fmtUSD(sumSpend(run2OwnedRows), 0));
    }

    // Back to All time restores the original top figure. The popover
    // stays open across in-popover selections (only the trigger toggles
    // it), so no extra click on the trigger is needed here.
    fireEvent.click(screen.getByTestId("option-run-all-time"));
    expect(view.container.textContent).toContain(fmtUSD(allTimeTop, 0));
  });
});

describe("MstCommandCenter — Link CVR correctness (item 4)", () => {
  it("shows results ÷ link clicks, not link clicks ÷ impressions (CTR)", () => {
    renderMst();
    const cvr = realCvr(run1OwnedRows);
    const ctr = wrongCtr(run1OwnedRows);
    expect(cvr).not.toBeNull();
    expect(ctr).not.toBeNull();
    // Sanity: the two formulas must actually diverge on this fixture,
    // otherwise the assertion below wouldn't distinguish the bug fix.
    expect(Math.abs((cvr as number) - (ctr as number))).toBeGreaterThan(1);
    expect(screen.getByText(fmtPct(cvr as number))).toBeTruthy();
    expect(screen.queryByText(fmtPct(ctr as number))).toBeNull();
  });
});

describe("MstCommandCenter — per-ad drawer shows real per-ad numbers (item 3)", () => {
  it("two ads sharing a cell show their own distinct spend, not the shared cell rollup", () => {
    renderMst();

    // C1A carries exactly two real ad records with different spend —
    // find them straight from the (untagged-for-run-scope) fixture ads.
    const ads: Array<{ ad_name: string; cell?: string; variation?: string; test_id?: string; performance?: { spend: number } }> =
      bookster.ads;
    const c1aAds = ads.filter((a) => a.cell === "C1A");
    expect(c1aAds.length).toBeGreaterThanOrEqual(2);
    const [adOne, adTwo] = c1aAds;
    expect(adOne.performance?.spend).not.toBe(adTwo.performance?.spend);

    // Open that avatar's drawer via its ICP code (unique per column).
    fireEvent.click(screen.getByText("CN_ICP_Achiever"));

    const rowOne = screen.getByText(adOne.ad_name).closest('[data-testid^="drawer-ad-row-"]') as HTMLElement;
    const rowTwo = screen.getByText(adTwo.ad_name).closest('[data-testid^="drawer-ad-row-"]') as HTMLElement;
    expect(rowOne).toBeTruthy();
    expect(rowTwo).toBeTruthy();
    expect(rowOne).not.toBe(rowTwo);

    expect(within(rowOne).getByText(fmtUSD(adOne.performance!.spend, 0))).toBeTruthy();
    expect(within(rowTwo).getByText(fmtUSD(adTwo.performance!.spend, 0))).toBeTruthy();

    // Real, previously-unsurfaced identifiers now show per ad.
    if (adOne.test_id) expect(within(rowOne).getByText(adOne.test_id)).toBeTruthy();
    if (adTwo.test_id) expect(within(rowTwo).getByText(adTwo.test_id)).toBeTruthy();
    if (adOne.variation) expect(within(rowOne).getByText(`Var ${adOne.variation}`)).toBeTruthy();
  });
});

// AdRecord.performance is documented as a full-window aggregate — it has no
// run identity, so it can never narrow the way the tile's cell-level Spend/
// CPA/CVR/CPM do. Once a run scope is active, the drawer must disclose that
// its per-ad figures are still full-window, on a different time base than
// the tile above. The all-time/no-scope view has no such mismatch to
// disclose, so the note must not appear there.
describe("MstCommandCenter — per-ad drawer discloses its full-window time base under an active run scope", () => {
  const CAVEAT_TEXT =
    "Per-ad Spend and Results below are full-window totals, not scoped to the run selection above.";

  it("shows the caveat once the page is scoped to a specific run", () => {
    renderMst();
    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-run_2"));

    fireEvent.click(screen.getByText("CN_ICP_Achiever"));
    expect(screen.getByText(CAVEAT_TEXT)).toBeTruthy();
  });

  it("stays hidden in the default All-time view, where tile and per-ad figures already share one time base", () => {
    renderMst();
    fireEvent.click(screen.getByText("CN_ICP_Achiever"));
    expect(screen.queryByText(CAVEAT_TEXT)).toBeNull();
  });
});
