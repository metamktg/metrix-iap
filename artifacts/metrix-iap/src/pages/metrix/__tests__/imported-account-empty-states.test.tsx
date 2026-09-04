// ─── Empty states on an account whose analysis was imported ─────────────
//
// An account whose analysis arrived through the importer (bookster, ECAS)
// carries cell rows and totals, no manual run on record and no day-level
// ad_performance rows. Three surfaces read those absences as "nothing
// here" and contradicted the figures beside them:
//   the Analysis centre's run card: "No analysis has been run yet." under
//     an analysis export of 12 cell rows;
//   the Analysis Overview period bar: "No data uploaded yet" beside
//     $8,000.84 of spend;
//   the daily trend: "Select a data window to see the daily trend." with
//     no window to select.
// Each now names what is absent for THIS account.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let seedForTest: { ad_accounts: unknown[]; manager: null } = { ad_accounts: [], manager: null };

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({ data: null, refetch: vi.fn() }),
    useListAnalysisRuns: () => ({ data: { runs: [] } }),
    useStartManualAnalysisRun: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useListManualImports: () => ({ data: { imports: [] }, refetch: vi.fn() }),
    useGetManualPerformanceCsvFormat: () => ({ data: null }),
    useSyncCreativeLinks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useUpdateManualImportAdNames: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
    getListManualImportsQueryKey: () => ["metrix", "imports"],
  };
});

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seedForTest,
  useMetrixIsRefetching: () => false,
}));
vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { AnalysisControls } from "../ManualAnalysisControls";
import { DataWindowBar } from "../shared";
import { TrendSection } from "@/components/analysis/TrendSection";

function withClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const IMPORTED_ACCOUNT = {
  id: "imported-1",
  name: "Imported",
  status: "configured",
  iap: {
    analysis: {
      performance_by_cell: [
        {
          cell_id: "C1A", "Result type": "Purchases", "Amount spent (USD)": 120, Reach: 1000, Impressions: 2000,
          Results: 3, "Clicks (all)": 40, "Link clicks": 30, CPA_result: 40, CTR_link_pct: 1.5,
          Result_per_link_click_pct: 10, book2_concept_name: "Concept",
        },
      ],
      v3_variable_performance: [],
      concept_rollup: [],
      reconciliation: null,
    },
  },
};

beforeEach(() => {
  cleanup();
  seedForTest = { ad_accounts: [], manager: null };
});

describe("Analysis centre run card", () => {
  it("says the outputs were imported when cell rows exist without a run", () => {
    seedForTest = { ad_accounts: [IMPORTED_ACCOUNT], manager: null };
    withClient(<AnalysisControls accountId="imported-1" />);
    expect(screen.getByText("No in-app run recorded. This account's analysis was imported.")).toBeTruthy();
    expect(screen.queryByText("No analysis has been run yet.")).toBeNull();
  });

  it("keeps the plain empty state when the account has no outputs at all", () => {
    withClient(<AnalysisControls accountId="imported-1" />);
    expect(screen.getByText("No analysis has been run yet.")).toBeTruthy();
  });
});

describe("Period bar", () => {
  it("names the absent day-level rows instead of an upload", () => {
    render(<DataWindowBar windows={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("No day-level rows for this account")).toBeTruthy();
    expect(screen.queryByText(/No data uploaded yet/)).toBeNull();
  });
});

describe("Daily trend", () => {
  it("asks for a window when there are windows to choose", () => {
    withClient(<TrendSection accountId="imported-1" start={null} end={null} hasWindows />);
    expect(screen.getByText("Select a data window to see the daily trend.")).toBeTruthy();
  });

  it("says what it needs when the account has no window at all", () => {
    withClient(<TrendSection accountId="imported-1" start={null} end={null} hasWindows={false} />);
    expect(screen.getByText("The daily trend needs an ad-level daily export. None is staged for this account.")).toBeTruthy();
    expect(screen.queryByText(/Select a data window/)).toBeNull();
  });
});
