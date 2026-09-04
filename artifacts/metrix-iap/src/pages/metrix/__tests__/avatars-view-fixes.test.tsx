// ─── Strategy · Avatars — run scope wiring & hypothesis fold ───────────
// Covers data-coverage-audit fixes against the real bookster fixture:
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
//   3. Once matched_profile_ids DOES link a profile to a matrix column
//      (item 1's fixture gap, exercised here via a local, restored-after
//      mutation — never the checked-in fixture), computeProfilePerf's
//      real cell-summation narrows that profile's Spend/CPA/Link CVR for
//      real, AND the confidence badge honestly discloses whether its
//      grade describes those scoped numbers: carried-over all-time grades
//      get an "all-time" caveat, and a scoped sample too thin to trust
//      the all-time grade gets a real, recomputed "low" downgrade. A
//      profile with no matched columns at all (the fixture's actual,
//      unmodified state) gets its own "no matched avatars in this scope"
//      disclosure instead of silently freezing.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { buildResultScopes, defaultScopeId, eventInputsFromAccount, resolveScope, scopeRows } from "@/lib/result-scope";
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
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("AvatarsView · run-scope wiring narrows cell-attributed KPIs (item 1)", () => {
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

describe("AvatarsView · hypothesis fold surfaces real fields (item 2)", () => {
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

// ─── item 3: computeProfilePerf real narrowing + confidence disclosure ──
// The checked-in fixture carries matched_profile_ids: null on every matrix
// column (asserted below), which is exactly why item 1's ICP $ figures
// never narrow today. These tests locally attach ONE column to ONE profile
// — restored after every test, never touching the checked-in fixture file
// — to exercise computeProfilePerf's real cell-summation branch, then
// assert the confidence-disclosure behavior on top of it.
//
// Column C2's matrix cells (C2A-D) overlap performance_by_cell only via
// "C2B" (C2E/C2F are real rows but belong to newer, non-matrix cells) —
// concept "C2" is also this file's RUN_1_CONCEPT, so scoping to run_1
// keeps C2B in scope. The resulting scoped figures are real sums over
// C2B's three Result-type rows, computed once here and asserted verbatim.
const TIME_POOR_PROFILE_ID = "ICP_BOOK0_C2_TimePoorLearner";
const matrixColumns: Array<{ id: string; matched_profile_ids?: string[] | null }> =
  bookster.mst.historical_matrix_4x4.columns;
const c2Column = matrixColumns.find((c) => c.id === "C2");
if (!c2Column) throw new Error("fixture has no C2 matrix column for the confidence-disclosure test");
if (matrixColumns.some((c) => c.matched_profile_ids != null)) {
  throw new Error("fixture already carries matched_profile_ids. Item-1's no-op premise no longer holds");
}

const icpProfilesRaw: Array<{ profile_id: string; performance_data?: { spend?: number | null; confidence?: string | null } | null }> =
  bookster.iap.strategy.icp_profiles;
const timePoorProfile = icpProfilesRaw.find((p) => p.profile_id === TIME_POOR_PROFILE_ID);
if (!timePoorProfile?.performance_data) throw new Error(`fixture is missing ${TIME_POOR_PROFILE_ID}'s performance_data`);
const ORIGINAL_ALL_TIME_SPEND = timePoorProfile.performance_data.spend;

// The view reads its cells under the account's landing result scope
// (one event, or the allowed blend of terminal conversions — never every
// event summed together), so the scoped figures are computed over the same
// rows the page lands on: C2B's rows under that scope.
const LANDING_SCOPE = (() => {
  const built = buildResultScopes(eventInputsFromAccount(bookster as unknown as Parameters<typeof eventInputsFromAccount>[0]));
  const present = (bookster.iap.analysis.performance_by_cell as { "Result type": string }[]).map((r) => r["Result type"]);
  return resolveScope(built.scopes, defaultScopeId(built.groups, present));
})();
const C2B_ROWS = scopeRows(
  bookster.iap.analysis.performance_by_cell.filter((r: { cell_id: string }) => r.cell_id === "C2B") as { "Result type": string; "Amount spent (USD)": number; Results: number; "Link clicks": number }[],
  LANDING_SCOPE,
  (r) => r["Result type"],
);
const SCOPED_SPEND = C2B_ROWS.reduce((s: number, r: { "Amount spent (USD)": number }) => s + r["Amount spent (USD)"], 0);
const SCOPED_RESULTS = C2B_ROWS.reduce((s: number, r: { Results: number }) => s + r.Results, 0);
const SCOPED_LINK_CLICKS = C2B_ROWS.reduce((s: number, r: { "Link clicks": number }) => s + r["Link clicks"], 0);
const SCOPED_CPA = SCOPED_SPEND / SCOPED_RESULTS;
const SCOPED_CVR = (SCOPED_RESULTS / SCOPED_LINK_CLICKS) * 100;

function fmtUsd0(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtUsd2(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

describe("AvatarsView · matched avatars narrow ICP performance for real (item 3)", () => {
  afterEach(() => {
    c2Column.matched_profile_ids = null;
    timePoorProfile!.performance_data!.spend = ORIGINAL_ALL_TIME_SPEND;
  });

  it("sums this profile's real matched-cell rows once scoped, and flags the carried-over confidence grade as all-time (real sample, not a thin slice)", () => {
    c2Column.matched_profile_ids = [TIME_POOR_PROFILE_ID];
    renderAvatars();
    fireEvent.change(screen.getByPlaceholderText("Filter profiles…"), { target: { value: "time-poor" } });

    // Baseline (All time): the profile's precomputed all-time figure, no caveat.
    expect(screen.getByText(fmtUsd0(ORIGINAL_ALL_TIME_SPEND!))).toBeTruthy();
    expect(screen.queryByText("all-time")).toBeNull();
    expect(screen.queryByText("no matched avatars in this scope", { exact: false })).toBeNull();

    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-run_1"));

    // Real narrowing/summation over C2B's matched cell rows — not the
    // all-time fallback, and not a fabricated number.
    expect(screen.getByText(fmtUsd0(SCOPED_SPEND))).toBeTruthy();
    expect(screen.getByText(fmtUsd2(SCOPED_CPA))).toBeTruthy();
    expect(screen.getByText(`${SCOPED_CVR.toFixed(2)}%`)).toBeTruthy();

    // Confidence grade is carried over unchanged (this profile's real
    // all-time spend is $2,332 — the ~$1,228 scoped slice is a
    // substantial share of it, not a thin one) but honestly disclosed as
    // describing all-time data, not the scoped numbers above it. "High"
    // renders twice (the card's own confidence_level badge, independent
    // of perf, plus the Performance-section grade) — assert presence.
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.getByText("all-time")).toBeTruthy();
  });

  it("honestly downgrades confidence to a recomputed 'low' when the scoped slice is too thin a fraction of this profile's all-time spend to trust the all-time grade", () => {
    c2Column.matched_profile_ids = [TIME_POOR_PROFILE_ID];
    // Same real scoped $ figures as above, but against an inflated all-time
    // baseline so the scoped slice reads as the thin sliver the audit
    // flagged ("a profile scoped down to e.g. 2% of its original spend
    // still shows a high confidence badge") — this is the one number this
    // test overrides, and only to engineer the share, not to fabricate
    // scoped output: the scoped sum is still real, computed from C2B rows.
    timePoorProfile!.performance_data!.spend = 100_000;
    renderAvatars();
    fireEvent.change(screen.getByPlaceholderText("Filter profiles…"), { target: { value: "time-poor" } });

    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-run_1"));

    expect(screen.getByText(fmtUsd0(SCOPED_SPEND))).toBeTruthy();
    expect(screen.getByText("Low")).toBeTruthy();
    expect(screen.getByText("(narrow scoped sample)")).toBeTruthy();
  });
});

describe("AvatarsView · no matched avatars in scope discloses the all-time fallback (item 3)", () => {
  it("shows an honest 'all-time, no matched avatars' note on an ICP card when a run is scoped but the fixture's real matched_profile_ids gap leaves it unable to narrow", () => {
    // Uses the checked-in fixture completely unmodified: every column's
    // matched_profile_ids is null, so avatarsForProfile(...) is always []
    // and every profile falls back to all-time — the exact silent no-op
    // the audit flagged, now disclosed instead of silent.
    renderAvatars();
    fireEvent.change(screen.getByPlaceholderText("Filter profiles…"), { target: { value: "time-poor" } });

    expect(screen.queryByText("no matched avatars in this scope", { exact: false })).toBeNull();

    fireEvent.click(screen.getByTestId("button-run-scope"));
    fireEvent.click(screen.getByTestId("option-run-run_1"));

    expect(screen.getByText("no matched avatars in this scope", { exact: false })).toBeTruthy();
  });
});
