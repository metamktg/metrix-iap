// ─── Conversion-export confirmation gate (LoopCommandChain) ───────────────
//
// When a staged manual import looks like a Meta conversion-event export
// rather than a delivery export, the API rejects the start-analysis request
// with 409 + code "conversion_export_confirmation_required" instead of
// silently ingesting impossible CTR/CPM data. This confirms the Analysis
// Command Hub in LoopCommandChain surfaces that as a confirm/cancel dialog
// (not a dead-end error) and only resubmits with confirm_conversion_export
// after the user chooses "Run anyway".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Seed fixture ──────────────────────────────────────────────────────────

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

// ── Per-test mutable state ────────────────────────────────────────────────

let mockMutateAsync = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({
      data: null,
      refetch: vi.fn(),
    }),
    useStartManualAnalysisRun: () => ({
      mutate: vi.fn(),
      mutateAsync: mockMutateAsync,
      isPending: false,
    }),
    useGetLatestGenerationRun: () => ({ data: null }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    useListWorkspaceReports: () => ({ data: { reports: [] } }),
    useListManualImports: () => ({ data: { imports: [{ id: "imp-1" }] } }),
    useListAnalysisRuns: () => ({ data: { runs: [] } }),
    getGetLatestAnalysisRunQueryKey: () => ["latest-analysis-run"],
    getGetMetrixSeedQueryKey: () => ["metrix-seed"],
  };
});

vi.mock("@/components/generation/GenerationControls", () => ({
  useGenerationRun: () => ({
    start: vi.fn(),
    isRunning: false,
    elapsedSeconds: 0,
    lastRun: null,
    lastError: null,
  }),
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Active seed (mutated per test) ────────────────────────────────────────

let activeSeed: typeof baseSeed = baseSeed;

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AdAccountOverview } from "../../../pages/metrix/AdAccountOverview";
import { ApiError } from "@workspace/api-client-react";

// ── Helpers ───────────────────────────────────────────────────────────────

const SESSION_KEY = "metrix_active_account_v1";

function selectAccount(adAccountId: string) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId })
  );
}

function renderOverview(seed: typeof baseSeed = baseSeed) {
  activeSeed = seed;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AdAccountOverview />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function seedWithManualAccount() {
  const bookster = baseSeed.ad_accounts.find(
    (a: { id: string }) => a.id === "bookster"
  );
  const manualAccount = {
    ...bookster,
    id: "manual_account",
    name: "Manual Account",
    platform: "manual",
    iap: {
      ...bookster.iap,
      analysis: {
        performance_by_cell: [],
        v3_variable_performance: [],
      },
      strategy: null,
      brief_builder: null,
      optimization_loop: null,
    },
  };
  return {
    ...baseSeed,
    ad_accounts: [...baseSeed.ad_accounts, manualAccount],
  };
}

function conversionExportError() {
  const response = new Response(null, { status: 409, statusText: "Conflict" });
  return new ApiError(
    response,
    {
      code: "conversion_export_confirmation_required",
      message: "One of your staged files looks like a conversion export, not a delivery export.",
      files: ["conversions_export.csv"],
    },
    { method: "POST", url: "/api/metrix/accounts/manual_account/analysis-runs" }
  );
}

function openAndConfirm() {
  const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
  fireEvent.click(analysisTile);
  const runBtn = screen.getByRole("button", { name: /run analysis/i });
  fireEvent.click(runBtn);
  const confirmBtn = screen.getByRole("button", { name: /run analysis/i });
  fireEvent.click(confirmBtn);
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
  mockMutateAsync = vi.fn();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LoopCommandChain — conversion-export confirmation gate", () => {
  it("shows a confirm/cancel dialog instead of a dead-end error on 409 conversion_export_confirmation_required", async () => {
    mockMutateAsync.mockRejectedValueOnce(conversionExportError());
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    openAndConfirm();

    await waitFor(() => {
      expect(
        screen.getByText(/this looks like a conversion export, not a delivery export/i)
      ).toBeTruthy();
    });
    expect(screen.getByText(/conversions_export\.csv/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /run anyway/i })).toBeTruthy();
  });

  it("clicking 'Run anyway' resubmits with confirm_conversion_export: true", async () => {
    mockMutateAsync.mockRejectedValueOnce(conversionExportError());
    mockMutateAsync.mockResolvedValueOnce({});
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    openAndConfirm();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run anyway/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /run anyway/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });
    const [secondCallArg] = mockMutateAsync.mock.calls[1];
    expect(secondCallArg).toMatchObject({
      accountId: "manual_account",
      data: { confirm_conversion_export: true },
    });
  });

  it("cancelling the dialog does not resubmit", async () => {
    mockMutateAsync.mockRejectedValueOnce(conversionExportError());
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    openAndConfirm();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run anyway/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/this looks like a conversion export, not a delivery export/i)
      ).toBeNull();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
