// ─── Analysis run double-tap guard ────────────────────────────────────────
//
// Confirms that rapid successive clicks on the "Run Analysis" confirm button
// fire the underlying mutateAsync exactly once — even before any re-render
// has had a chance to disable the button via isPending.
//
// Mechanism: a ref (analysisFireRef) blocks the second synchronous call to
// handleStartAnalysis before any React state update can propagate. This
// mirrors the firingRef guard in useGenerationRun (GenerationControls.tsx).

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
  useGenerationRun: (_accountId: unknown, kind: string) => ({
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

/**
 * Build a seed with a manual (non-Meta) account that has staged imports but
 * no analysis run yet. isLiveMeta = false so the confirmation panel executes
 * onStartAnalysis() rather than navigating away.
 */
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

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
  mockMutateAsync = vi.fn(() => new Promise(() => {})); // never resolves by default
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LoopCommandChain · analysis run double-tap guard", () => {
  it("mutateAsync is not called before the Analysis hub confirmation step", () => {
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("opening the Analysis hub and clicking 'Run Analysis' shows the confirmation screen", () => {
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
    fireEvent.click(analysisTile);

    // Hub is open — "Run Analysis" button takes us to the confirmation panel
    const runBtn = screen.getByRole("button", { name: /run analysis/i });
    fireEvent.click(runBtn);

    // Confirmation panel: shows "Data source" context
    expect(screen.getByText("Data source")).toBeTruthy();
  });

  it("a rapid double-tap on the confirm button fires mutateAsync exactly once", () => {
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    // Step 1: open the Analysis Command Hub
    const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
    fireEvent.click(analysisTile);

    // Step 2: click "Run Analysis" to enter the confirmation screen
    const runBtn = screen.getByRole("button", { name: /run analysis/i });
    fireEvent.click(runBtn);

    // Step 3: find the confirm button (now shows "Run Analysis" inside the
    // confirmation panel, next to a Cancel button)
    const confirmBtn = screen.getByRole("button", { name: /run analysis/i });

    // Step 4: double-tap — the second click must be a no-op
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("triple-tap on the confirm button still fires mutateAsync only once", () => {
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
    fireEvent.click(analysisTile);

    const runBtn = screen.getByRole("button", { name: /run analysis/i });
    fireEvent.click(runBtn);

    const confirmBtn = screen.getByRole("button", { name: /run analysis/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("confirm button is disabled immediately after the first click (before mutateAsync resolves)", async () => {
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    // Open the Analysis Command Hub
    const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
    fireEvent.click(analysisTile);

    // Enter the confirmation panel
    const runBtn = screen.getByRole("button", { name: /run analysis/i });
    fireEvent.click(runBtn);

    // Confirm button is present and enabled before the click
    expect(screen.getByRole("button", { name: /run analysis/i })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /run analysis/i }) as HTMLButtonElement).disabled
    ).toBe(false);

    // Click the confirm button — mutateAsync returns a never-resolving promise
    // (set in beforeEach) so the run is permanently "in flight" for this test.
    fireEvent.click(screen.getByRole("button", { name: /run analysis/i }));

    // After setAnalysisFiring(true) propagates, the outer component passes
    // analysisStarting={true} to CommandHub. CommandHub re-renders Actions,
    // which replaces the button label with "Starting…" and sets disabled={true}.
    //
    // NOTE: Actions is defined inside CommandHub and rendered as <Actions />,
    // so every re-render creates a new function reference, causing React to
    // unmount + remount Actions and replace the button DOM node. We therefore
    // re-query from screen rather than using a stale pre-click reference.
    await waitFor(() => {
      const startingBtn = screen.queryByRole("button", { name: /starting/i });
      expect(startingBtn).toBeTruthy();
      expect((startingBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("mutateAsync receives the selected date range on first call", () => {
    const seed = seedWithManualAccount();
    selectAccount("manual_account");
    renderOverview(seed);

    const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
    fireEvent.click(analysisTile);

    const runBtn = screen.getByRole("button", { name: /run analysis/i });
    fireEvent.click(runBtn);

    const confirmBtn = screen.getByRole("button", { name: /run analysis/i });
    fireEvent.click(confirmBtn);

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    const [callArg] = mockMutateAsync.mock.calls[0];
    expect(callArg).toMatchObject({
      accountId: "manual_account",
      data: { date_range: expect.stringMatching(/^(7d|14d|30d|all)$/) },
    });
  });
});
