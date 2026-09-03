// ─── Loop command chain state regression tests ────────────────────────
//
// Guards correct stage state rendering in LoopCommandChain for:
//   1. Configured account with full data (all stages complete)
//   2. Configured account with no analysis run yet (analysis next, rest locked)
//   3. Strategy stage running (running ≠ locked; tile data-state "running"; hub label "Running")
//   4. Analysis stage running (tile data-state "running")
//
// Also confirms the hooks-violation fix (hoisted useState/useMemo in
// AdAccountOverview above the early-return guards) does not regress under
// the jsdom test harness.

import { withUnconfiguredAccount } from "@/test-fixtures/unconfigured";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Seed fixture ─────────────────────────────────────────────────────────

const baseSeed = withUnconfiguredAccount(JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
), "skov_pet");

// ── Per-test mutable state ────────────────────────────────────────────────
//
// These are read by the vi.mock factory closures below. Set them before
// renderOverview() in tests that need non-default values; they are reset
// to defaults in beforeEach so existing tests are unaffected.

let activeSeed: typeof baseSeed = baseSeed;
let mockStrategyRunning = false;
let mockBriefsRunning = false;
let mockAnalysisRunStatus: string | null = null;
let mockAnalysisErrorMessage: string | null = null;
let mockStrategyLastError: string | null = null;
let mockBriefsLastError: string | null = null;

// ── Mocks ────────────────────────────────────────────────────────────────
//
// LoopCommandChain makes two async calls: useGetLatestAnalysisRun (for the
// latest analysis run status) and useGenerationRun (for strategy/briefs
// generation run status). Both are mocked to idle/no-data so tests are
// deterministic without a live API server.

let mockReportCount = 0;

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({
      data: mockAnalysisRunStatus
        ? { run: { status: mockAnalysisRunStatus, error_message: mockAnalysisErrorMessage } }
        : null,
    }),
    useGetLatestGenerationRun: () => ({ data: null }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    useListWorkspaceReports: () => ({
      data: { reports: Array.from({ length: mockReportCount }, (_, i) => ({ id: String(i), ad_account_id: "bookster" })) },
    }),
    useListManualImports: () => ({ data: { imports: [] } }),
  };
});

vi.mock("@/components/generation/GenerationControls", () => ({
  useGenerationRun: (_accountId: unknown, kind: string) => ({
    start: vi.fn(),
    isRunning:
      kind === "strategy"
        ? mockStrategyRunning
        : kind === "briefs"
          ? mockBriefsRunning
          : false,
    elapsedSeconds: 0,
    lastRun: null,
    lastError:
      kind === "strategy"
        ? mockStrategyLastError
        : kind === "briefs"
          ? mockBriefsLastError
          : null,
  }),
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => activeSeed,
  useMetrixIsRefetching: () => false,
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
function seedWithNoAnalysisAccount(): typeof baseSeed {
  const bookster = baseSeed.ad_accounts.find(
    (a: { id: string }) => a.id === "bookster"
  )!;
  // Deliberately partial: the account under test HAS no analysis, which is
  // exactly what the strict seed type will not express — hence the cast.
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
  } as unknown as (typeof baseSeed)["ad_accounts"][number];
  return {
    ...baseSeed,
    ad_accounts: [...baseSeed.ad_accounts, noAnalysisAccount],
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  activeSeed = baseSeed;
  mockStrategyRunning = false;
  mockBriefsRunning = false;
  mockAnalysisRunStatus = null;
  mockAnalysisErrorMessage = null;
  mockStrategyLastError = null;
  mockBriefsLastError = null;
  mockReportCount = 0;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LoopCommandChain — configured account with full data (Bookster)", () => {
  it("renders the IAP Loop command chain", () => {
    selectAccount("bookster");
    renderOverview();
    expect(screen.getByText("IAP Loop")).toBeTruthy();
  });

  it("shows all 5 stage tiles complete when reports also exist", () => {
    // The header counter badge is gone (canvas spec has none) — completion
    // reads entirely off each stage tile's own data-state attribute.
    mockReportCount = 1;
    selectAccount("bookster");
    const { container } = renderOverview();
    for (const stage of ["data", "analysis", "strategy", "briefs", "report"]) {
      const tile = container.querySelector(`[data-testid="stage-tile-${stage}"]`);
      expect(tile?.getAttribute("data-state")).toBe("complete");
    }
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
    // By test id, not by name: while running the tile's accessible name
    // carries its status, and a /strategy/i substring now also matches the
    // overview's recommendation tiles (whose prose cites the strategy map).
    const strategyTile = screen.getByTestId("stage-tile-strategy");
    expect(isDisabled(strategyTile)).toBe(false);
  });

  // The tile that drafts briefs is the loop's Creative stage; it takes its
  // label from navTree's LOOP_STAGES (stage key stays "briefs").
  it("Creative (briefs) stage tile is not locked — strategy is complete", () => {
    selectAccount("bookster");
    renderOverview();
    const briefsTile = screen.getByRole("button", { name: /^creative$/i });
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

  it("Data stage is complete for a live Meta account, the rest are not", () => {
    // fresh_account inherits platform "Meta Ads" from Bookster.
    // isLiveMeta recognises "meta ads" as a live Meta connection, so the
    // Data stage is complete (source connected) even without an analysis run.
    // Analysis/Strategy/Briefs/Report all still pending.
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    const { container } = renderOverview(seed);
    const dataTile = container.querySelector('[data-testid="stage-tile-data"]');
    expect(dataTile?.getAttribute("data-state")).toBe("complete");
    for (const stage of ["analysis", "strategy", "briefs", "report"]) {
      const tile = container.querySelector(`[data-testid="stage-tile-${stage}"]`);
      expect(tile?.getAttribute("data-state")).not.toBe("complete");
    }
  });

  it("Data stage tile is not locked — data is the entry point", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    const dataTile = screen.getByRole("button", { name: /^data$/i });
    expect(isDisabled(dataTile)).toBe(false);
  });

  it("Analysis stage tile is NOT locked — Data is complete for a live Meta account", () => {
    // isLiveMeta=true (platform "Meta Ads") → dataComplete=true → Analysis
    // becomes the "next" step, not locked. Locked = disabled only when
    // !dataComplete && !analysisComplete && !analysisRunning.
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

  it("Creative (briefs) stage tile is locked — strategy has not run", () => {
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    // Briefs is locked when !strategyComplete && !briefsComplete && !briefsRunning
    const briefsTile = screen.getByRole("button", { name: /^creative$/i });
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
    const briefsTile = screen.getByRole("button", { name: /^creative$/i });
    expect(isDisabled(strategyTile)).toBe(true);
    expect(isDisabled(briefsTile)).toBe(true);
  });
});

describe("LoopCommandChain — Strategy stage running", () => {
  // When a strategy generation run is in flight, useGenerationRun returns
  // isRunning: true for kind === "strategy".  The tile must not be disabled
  // (running ≠ locked), the tile carries data-state="running", and opening
  // the Command Hub must show the "Running" status label.
  //
  // Note: when isRunning, StageTile appends an elapsed-time "0:00" span inside
  // the button, so its accessible name becomes "Strategy0:00" rather than the
  // idle "Strategy". This group used an unanchored /strategy/i to match both
  // forms; the overview now also carries recommendation tiles whose prose
  // cites the strategy map, so that substring resolved to two elements. The
  // stage tile's own test id names exactly one thing under either state.

  it("Strategy tile is not disabled while running — running ≠ locked", () => {
    mockStrategyRunning = true;
    selectAccount("bookster");
    renderOverview();
    const strategyTile = screen.getByTestId("stage-tile-strategy");
    expect(isDisabled(strategyTile)).toBe(false);
  });

  it("Strategy tile carries data-state=\"running\" while strategy is running", () => {
    // The header counter badge is gone (canvas spec has none) — running
    // state reads off the tile's own data-state attribute instead.
    mockStrategyRunning = true;
    selectAccount("bookster");
    const { container } = renderOverview();
    const strategyTile = container.querySelector('[data-testid="stage-tile-strategy"]');
    expect(strategyTile?.getAttribute("data-state")).toBe("running");
  });

  it("Command Hub status label reads 'Running' when strategy is running", () => {
    mockStrategyRunning = true;
    selectAccount("bookster");
    renderOverview();
    // Click the Strategy tile to open the Command Hub
    const strategyTile = screen.getByTestId("stage-tile-strategy");
    fireEvent.click(strategyTile);
    // The hub header renders the status label "Running" (amber badge)
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("Execute button is suppressed (Actions replaced by Status) while running", () => {
    mockStrategyRunning = true;
    selectAccount("bookster");
    renderOverview();
    const strategyTile = screen.getByTestId("stage-tile-strategy");
    fireEvent.click(strategyTile);
    // When running, the hub renders "Status" not "Actions" as the section label,
    // and the generate/regenerate button is not present.
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.queryByText(/Generate Strategy/i)).toBeNull();
    expect(screen.queryByText(/Regenerate/i)).toBeNull();
  });
});

describe("LoopCommandChain — Analysis stage running", () => {
  // When an analysis run is in flight, useGetLatestAnalysisRun returns
  // { run: { status: "running" } }.  The Analysis tile must not be disabled
  // (analysis is never locked), the tile carries data-state="running", and
  // opening the hub must show the "Running" status label.
  //
  // Note: when isRunning, StageTile appends an elapsed-time "0:00" span, so
  // the accessible name becomes "Analysis0:00". Selectors use /analysis/i
  // without anchors to match both the idle and running forms.

  it("Analysis tile is not disabled while running", () => {
    mockAnalysisRunStatus = "running";
    selectAccount("bookster");
    renderOverview();
    // Name may be "Analysis0:00" when running (elapsed timer rendered in tile)
    // Use starts-with anchor so "Go to Analysis" CTA buttons are excluded.
    const analysisTile = screen.getByRole("button", { name: /^analysis/i });
    expect(isDisabled(analysisTile)).toBe(false);
  });

  it("Analysis tile carries data-state=\"running\" while analysis is running", () => {
    // The header counter badge is gone (canvas spec has none) — running
    // state reads off the tile's own data-state attribute instead.
    mockAnalysisRunStatus = "running";
    selectAccount("bookster");
    const { container } = renderOverview();
    const analysisTile = container.querySelector('[data-testid="stage-tile-analysis"]');
    expect(analysisTile?.getAttribute("data-state")).toBe("running");
  });

  it("Command Hub status label reads 'Running' when analysis is running", () => {
    mockAnalysisRunStatus = "running";
    selectAccount("bookster");
    renderOverview();
    // Name is "Analysis0:00" when running; starts-with anchor excludes "Go to Analysis" CTAs.
    const analysisTile = screen.getByRole("button", { name: /^analysis/i });
    fireEvent.click(analysisTile);
    expect(screen.getByText("Running")).toBeTruthy();
  });
});

describe("LoopCommandChain — Analysis stage failed", () => {
  // A run that ended in "error" must be visibly distinct from both "running"
  // and "not started yet" — the bug this guards against left a failed run
  // looking identical to an untouched stage once it settled.

  it("Analysis tile shows a Failed label, not the idle stage name", () => {
    mockAnalysisRunStatus = "error";
    mockAnalysisErrorMessage = "Could not parse the uploaded file.";
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Failed");
  });

  it("Analysis tile is not disabled while failed — user can reopen it", () => {
    mockAnalysisRunStatus = "error";
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    renderOverview(seed);
    const analysisTile = screen.getByRole("button", { name: /failed/i });
    expect(isDisabled(analysisTile)).toBe(false);
  });

  it("shows a persistent failed strip with the error message and a retry link", () => {
    mockAnalysisRunStatus = "error";
    mockAnalysisErrorMessage = "Could not parse the uploaded file.";
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Analysis failed — not running");
    expect(container.textContent).toContain("Could not parse the uploaded file.");
    expect(screen.getByText(/Review & retry/i)).toBeTruthy();
  });

  it("does not show the failed strip once analysis data exists (superseded by a later success)", () => {
    // Bookster's seed already has analysis data (analysisComplete = true),
    // so a stale "error" status from an old run must not resurface as failed.
    mockAnalysisRunStatus = "error";
    selectAccount("bookster");
    const { container } = renderOverview();
    expect(container.textContent).not.toContain("Analysis failed — not running");
  });
});

describe("LoopCommandChain — Strategy stage failed", () => {
  it("Strategy tile shows Failed and strip surfaces the error, not silently reverting to Next", () => {
    // Bookster already has strategy data (strategyComplete = true), which
    // would suppress the failed strip (superseded by success) — use a fresh
    // account with no strategy yet to exercise the general failed path.
    mockStrategyLastError = "The engine could not generate message pillars.";
    const seed = seedWithNoAnalysisAccount();
    selectAccount("fresh_account");
    const { container } = renderOverview(seed);
    expect(container.textContent).toContain("Failed");
    expect(container.textContent).toContain("Strategy failed — not running");
    expect(container.textContent).toContain("The engine could not generate message pillars.");
  });
});

describe("LoopCommandChain — hooks-violation guard (hoisted useState/useMemo)", () => {
  // These two tests confirm that the hoisted useState/useMemo fix in
  // AdAccountOverview (above the early-return guards) does not violate the
  // Rules of Hooks under the jsdom test harness.

  it("renders without throwing for an unconfigured account (SKOV Pet)", () => {
    selectAccount("skov_pet");
    const { container } = renderOverview();
    // Unconfigured accounts now show the IAP Loop blueprint (all stages
    // locked/pending) above the UnconfiguredState checklist — same structural
    // frame as a configured account so every account sees the full loop.
    expect(container.textContent).toContain("IAP Loop");
    expect(container.textContent).toContain("Connect data source");
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
