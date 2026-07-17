// ─── Loop command chain state regression tests ────────────────────────
//
// Guards correct stage state rendering in LoopCommandChain for:
//   1. Configured account with full data (all stages complete)
//   2. Configured account with no analysis run yet (analysis next, rest locked)
//
// Also confirms the hooks-violation fix (hoisted useState/useMemo in
// AdAccountOverview above the early-return guards) does not regress under
// the jsdom test harness.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Seed fixture ─────────────────────────────────────────────────────────

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

// ── Mocks ────────────────────────────────────────────────────────────────
//
// LoopCommandChain makes two async calls: useGetLatestAnalysisRun (for the
// latest analysis run status) and useGenerationRun (for strategy/briefs
// generation run status). Both are mocked to idle/no-data so tests are
// deterministic without a live API server.

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({ data: null }),
    useGetLatestGenerationRun: () => ({ data: null }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("@/components/generation/GenerationControls", () => ({
  useGenerationRun: () => ({
    start: vi.fn(),
    isRunning: false,
    lastRun: null,
    lastError: null,
  }),
}));

// Mutable — swapped per test via renderOverview(seed).
let activeSeed: typeof baseSeed = baseSeed;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AdAccountOverview } from "../AdAccountOverview";

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

/** Returns true when the button element carries the HTML `disabled` attribute. */
function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true;
}

/**
 * Build a seed that includes a configured account with iap present but all
 * analysis/strategy/briefs arrays empty — as if the account is newly
 * configured and no analysis run has been executed yet.
 *
 * core_reanalysis_read is kept (non-null) so the `!core` early-return guard
 * in AdAccountOverview passes and LoopCommandChain actually renders.
 */
function seedWithNoAnalysisAccount() {
  const bookster = baseSeed.ad_accounts.find(
    (a: { id: string }) => a.id === "bookster"
  );
  const noAnalysisAccount = {
    ...bookster,
    id: "fresh_account",
    name: "Fresh Account",
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
    ad_accounts: [...baseSeed.ad_accounts, noAnalysisAccount],
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LoopCommandChain — configured account with full data (Bookster)", () => {
  it("renders the IAP Loop command chain", () => {
    selectAccount("bookster");
    renderOverview();
    expect(screen.getByText("IAP Loop")).toBeTruthy();
  });

  it("shows all 3 stages complete (✓ counter)", () => {
    selectAccount("bookster");
    const { container } = renderOverview();
    expect(container.textContent).toContain("✓");
  });

  it("Analysis stage tile is not locked (not disabled)", () => {
    selectAccount("bookster");
    renderOverview();
    const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
    expect(isDisabled(analysisTile)).toBe(false);
  });

  it("Strategy stage tile is not locked — analysis is complete", () => {
    selectAccount("bookster");
    renderOverview();
    const strategyTile = screen.getByRole("button", { name: /^strategy$/i });
    expect(isDisabled(strategyTile)).toBe(false);
  });

  it("Briefs stage tile is not locked — strategy is complete", () => {
    selectAccount("bookster");
    renderOverview();
    const briefsTile = screen.getByRole("button", { name: /^briefs$/i });
    expect(isDisabled(briefsTile)).toBe(false);
  });

  it("does not show the unconfigured state", () => {
    selectAccount("bookster");
    const { container } = renderOverview();
    expect(container.textContent).not.toContain("Connect Meta Ad Account");
    expect(container.textContent).not.toContain("Analysis data loading");
  });
});

describe("LoopCommandChain — configured account with no analysis run yet", () => {
  it("renders the IAP Loop command chain (not an early-return state)", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    expect(screen.getByText("IAP Loop")).toBeTruthy();
  });

  it("shows 0/3 complete counter — no stages have data", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("0/3");
  });

  it("Analysis stage tile is not locked — analysis is always the entry point", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    const analysisTile = screen.getByRole("button", { name: /^analysis$/i });
    expect(isDisabled(analysisTile)).toBe(false);
  });

  it("Strategy stage tile is locked — analysis has not run", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    // Strategy is locked when !analysisComplete && !strategyComplete && !strategyRunning
    const strategyTile = screen.getByRole("button", { name: /^strategy$/i });
    expect(isDisabled(strategyTile)).toBe(true);
  });

  it("Briefs stage tile is locked — strategy has not run", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    // Briefs is locked when !strategyComplete && !briefsComplete && !briefsRunning
    const briefsTile = screen.getByRole("button", { name: /^briefs$/i });
    expect(isDisabled(briefsTile)).toBe(true);
  });

  it("does not show the unconfigured state — the account is configured", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    const { container } = renderOverview(seed);
    expect(container.textContent).not.toContain("Connect Meta Ad Account");
    expect(container.textContent).not.toContain("Analysis data loading");
  });

  it("does not show a false Execute button enabled for locked stages", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    // Strategy and Briefs tiles are disabled — clicking them does nothing
    const strategyTile = screen.getByRole("button", { name: /^strategy$/i });
    const briefsTile = screen.getByRole("button", { name: /^briefs$/i });
    expect(isDisabled(strategyTile)).toBe(true);
    expect(isDisabled(briefsTile)).toBe(true);
  });
});

describe("LoopCommandChain — hooks-violation guard (hoisted useState/useMemo)", () => {
  // These two tests confirm that the hoisted useState/useMemo fix in
  // AdAccountOverview (above the early-return guards) does not violate the
  // Rules of Hooks under the jsdom test harness.

  it("renders without throwing for an unconfigured account (SKOV Pet)", () => {
    selectAccount("skov_pet");
    const { container } = renderOverview();
    // Unconfigured accounts get the UnconfiguredState — no IAP Loop visible
    expect(container.textContent).not.toContain("IAP Loop");
    expect(container.textContent).toContain("Connect Meta Ad Account");
  });

  it("renders without throwing for a manager view (no account selected)", () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ type: "manager", adAccountId: null })
    );
    const { container } = renderOverview();
    // Manager view: shows "No ad account selected", no loop
    expect(container.textContent).toContain("No ad account selected");
    expect(screen.queryByText("IAP Loop")).toBeNull();
  });

  it("renders the IAP Loop for a configured account — confirming hoisted hooks don't violate", () => {
    // The hoisted useState/useMemo in AdAccountOverview (above the early-return
    // guards) must execute unconditionally even when the component takes an
    // early-return path on another account. This test confirms no React
    // "rendered more/fewer hooks than expected" error surfaces for a configured
    // account that reaches LoopCommandChain.
    selectAccount("bookster");
    const { container } = renderOverview();
    expect(container.textContent).toContain("IAP Loop");
  });
});
