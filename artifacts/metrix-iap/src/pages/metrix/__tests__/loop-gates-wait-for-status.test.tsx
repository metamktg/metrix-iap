// ─── The loop gates wait for the stage status before claiming a lock ────
//
// `useStageStatus` answers with its defaults (nothing validated, nothing
// unlocked) until its query resolves. A gate that read `met` alone showed
// "Run analysis first" on the Strategy centre and "Generate briefs first"
// on the MST centre for one round trip on EVERY visit, then swapped to the
// real content: the reader was told the stage was locked on the strength
// of a default. Locked copy is a claim about the account; it waits.
//
// The MST gate also follows the rule the Strategy and Creative gates
// already follow (see loop-gates-read-data-not-runs.test.tsx): it asks for
// the INPUT the stage reads. The bookster fixture carries a matrix with
// briefed cells and no briefs generation run, and the Account Overview
// names those cells ("MST active · 16 matrix cells"); the MST page must
// not say the account has no briefs beneath that.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

const LOCKED_STATUS = {
  analysis: { status: "none", validated: false, last_run_at: null, date_range: null, progress_pct: 0, progress_stage: "" },
  strategy: { status: "none", last_run_at: null },
  briefs: { status: "none", last_run_at: null, count: 0 },
  mst: { unlocked: false },
};

// Mutable per test: what the stage-status hook answers.
let statusResponse: { data: typeof LOCKED_STATUS | undefined; isLoading: boolean } = { data: undefined, isLoading: true };

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetAccountStageStatus: () => statusResponse,
    useGetLatestGenerationRun: () => ({ data: null }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    useListAnalysisRuns: () => ({ data: { runs: [] }, isLoading: false }),
    useListManualImports: () => ({ data: { imports: [] } }),
    useListWorkspaceReports: () => ({ data: { reports: [] } }),
    getGetLatestGenerationRunQueryKey: () => ["latest-gen-run"],
    getGetMetrixSeedQueryKey: () => ["metrix-seed"],
    getGetAccountStageStatusQueryKey: () => ["stage-status"],
    getListAnalysisRunsQueryKey: () => ["analysis-runs"],
    ApiError: class ApiError extends Error {},
  };
});

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

let seedForTest: unknown = baseSeed;
vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seedForTest,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { StrategyCommandCenter } from "@/pages/metrix/strategy/StrategyCommandCenter";
import { MstCommandCenter } from "@/pages/metrix/mst/MstCommandCenter";

const SESSION_KEY = "metrix_active_account_v1";

function renderPage(ui: React.ReactElement) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>{ui}</AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const renderStrategy = () => renderPage(<StrategyCommandCenter />);
const renderMst = () => renderPage(<MstCommandCenter />);

function matrixColumnCount(seed: typeof baseSeed): number {
  const acct = (seed.ad_accounts as { id: string; mst?: { historical_matrix_4x4?: { columns?: unknown[] } } }[])
    .find((a) => a.id === "bookster");
  return acct?.mst?.historical_matrix_4x4?.columns?.length ?? 0;
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  seedForTest = baseSeed;
  statusResponse = { data: undefined, isLoading: true };
});

afterEach(() => cleanup());

describe("Strategy Command Center · the gate waits for the stage status", () => {
  it("shows no locked copy while the status is loading, only a labelled placeholder", async () => {
    await act(async () => { renderStrategy(); });
    expect(screen.queryByText("Run analysis first")).toBeNull();
    expect(screen.getByTestId("prerequisite-gate-loading")).toBeTruthy();
  });

  it("locks once the status has loaded and says the analysis is not validated", async () => {
    statusResponse = { data: LOCKED_STATUS, isLoading: false };
    await act(async () => { renderStrategy(); });
    expect(screen.getByText("Run analysis first")).toBeTruthy();
    expect(screen.queryByTestId("prerequisite-gate-loading")).toBeNull();
  });
});

describe("MST Command Center · the gate waits, then asks for the matrix before the run record", () => {
  it("the fixture is the case this guards: a matrix with cells, no briefs run", () => {
    expect(matrixColumnCount(baseSeed)).toBeGreaterThan(0);
  });

  it("shows no locked copy while the status is loading", async () => {
    await act(async () => { renderMst(); });
    expect(screen.queryByText("Generate briefs first")).toBeNull();
  });

  it("opens on the fixture's matrix even when the server reports no live briefs", async () => {
    statusResponse = { data: LOCKED_STATUS, isLoading: false };
    await act(async () => { renderMst(); });
    expect(screen.queryByText("Generate briefs first")).toBeNull();
    expect(screen.getByText("Avatars")).toBeTruthy();
  });

  it("still locks when there is no matrix and no live briefs", async () => {
    const stripped = JSON.parse(JSON.stringify(baseSeed));
    for (const acct of stripped.ad_accounts) {
      if (acct.id === "bookster" && acct.mst) acct.mst.historical_matrix_4x4 = null;
    }
    seedForTest = stripped;
    statusResponse = { data: LOCKED_STATUS, isLoading: false };
    await act(async () => { renderMst(); });
    expect(screen.getByText("Generate briefs first")).toBeTruthy();
  });
});
