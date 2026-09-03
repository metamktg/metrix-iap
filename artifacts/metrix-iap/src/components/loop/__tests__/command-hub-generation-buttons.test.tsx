// ─── CommandHub — generation button disabled-while-running guard ────────────
//
// Confirms that the "Build Strategy", "Draft Briefs", and "Run Analysis"
// action buttons inside the CommandHub are disabled or absent while a run is
// in flight, and enabled (present and not disabled) in the idle state.
//
// Strategy / Briefs: the implementation renders the button with `disabled`
// when isRunning is true so users can see what action is locked — and so
// tests can assert the disabled state with a standard toBeDisabled() query.
//
// Analysis: when analysisRunning is true the Actions() function returns only
// the progress view (no button at all), so the test asserts the button is
// absent from the DOM.
//
// Covered regressions:
//   - Removing `disabled` from a running button → button becomes clickable
//   - Removing the isRunning check entirely → button fires a duplicate request
//   - Bleed between stages (e.g. briefsRunning disables the strategy button)
//   - Analysis "Run Analysis" button appearing while an analysis run is live
//
// Tests directly mount LoopCommandChain (not AdAccountOverview) following the
// pattern in LoopCommandChain-stale-badge.test.tsx.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AdAccount } from "@/lib/data/seedTypes";

// ── Per-test mutable state ────────────────────────────────────────────────
// Named with "mock" prefix so Vitest's hoisted vi.mock() factories can
// reference them before import declarations are evaluated.

const mockGenState = {
  strategyRunning: false,
  briefsRunning:   false,
  analysisRunning: false,
};

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetLatestAnalysisRun:         () => ({
    data: mockGenState.analysisRunning ? { run: { status: "running" } } : null,
    refetch: vi.fn(),
  }),
  getGetLatestAnalysisRunQueryKey: () => ["analysis", "latest"],
  getGetMetrixSeedQueryKey:        () => ["metrix", "seed"],
  getListWorkspaceReportsQueryKey: () => ["reports", "list"],
  useStartManualAnalysisRun:       () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateWorkspaceReport:        () => ({ mutate: vi.fn(), isPending: false }),
  useListWorkspaceReports:         () => ({ data: { reports: [] } }),
  useListManualImports:            () => ({ data: { imports: [{ id: "imp-1" }] } }),
  useListAnalysisRuns:             () => ({ data: { runs: [] } }),
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => ({ accounts: [], manager: null }),
}));

vi.mock("@/components/generation/GenerationControls", () => ({
  useGenerationRun: (_accountId: string | null, kind: string) => ({
    isRunning:       kind === "strategy" ? mockGenState.strategyRunning
                   : kind === "briefs"   ? mockGenState.briefsRunning
                   : false,
    lastRun:         null,
    lastError:       null,
    elapsedSeconds:  0,
    progressPercent: 0,
    start:           vi.fn(),
  }),
}));

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { LoopCommandChain } from "../LoopCommandChain";

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * A fully-configured account: analysis + strategy + briefs all present so the
 * CommandHub can reach the "idle generate" state in both stages.
 */
function makeCompleteAccount(): AdAccount {
  return {
    id:       "acc-1",
    name:     "Test Account",
    platform: "meta",
    iap: {
      analysis: {
        performance_by_cell:     [{}] as any,
        v3_variable_performance: [{}] as any,
      },
      strategy: {
        message_pillars:   [{}] as any,
        active_hypotheses: [] as any,
        icp_profiles:      [] as any,
        provenance:        "generated",
      },
      brief_builder: {
        draft_briefs: [{}] as any,
        provenance:   "generated",
      },
      loop_status: [] as any,
    },
  } as unknown as AdAccount;
}

function makeWrapper() {
  const location = memoryLocation({ path: "/app/analysis/overview", record: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <WouterRouter hook={location.hook}>{children}</WouterRouter>
      </QueryClientProvider>
    );
  };
}

function renderChain(account: AdAccount = makeCompleteAccount()) {
  return render(
    <LoopCommandChain accountId="acc-1" account={account} managerId="mgr-1" />,
    { wrapper: makeWrapper() },
  );
}

/**
 * Find a stage tile <button> by its visible label text.
 * The label is rendered in a <span> with uppercase tracking classes inside
 * the button — same approach used in LoopCommandChain-stale-badge.test.tsx.
 */
function getStageTile(container: HTMLElement, label: string): HTMLElement | null {
  // Stage tiles carry a stable data-testid (stage-tile-<stage>) since the
  // Nocturne stepper restyle — resolve the label to its stage key.
  const stage = label.toLowerCase() === "briefs" ? "briefs" : label.toLowerCase();
  return container.querySelector<HTMLElement>(`[data-testid="stage-tile-${stage}"]`);
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockGenState.strategyRunning = false;
  mockGenState.briefsRunning   = false;
  mockGenState.analysisRunning = false;
});

// ── Strategy — idle state ──────────────────────────────────────────────────

describe("CommandHub Strategy stage · idle (strategyRunning = false)", () => {
  it("Build Strategy button is present and enabled in the idle state", () => {
    renderChain();
    const tile = getStageTile(document.body, "Strategy");
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);
    // In idle state the Actions section renders the Build Strategy button
    // as a trigger for the confirmation panel.
    const btn = screen.getByRole("button", { name: /build strategy/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Actions section label reads 'Actions' (not 'Status') when idle", () => {
    renderChain();
    const tile = getStageTile(document.body, "Strategy");
    fireEvent.click(tile!);
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.queryByText("Status")).toBeNull();
  });
});

// ── Strategy — running: button must be disabled ────────────────────────────

describe("CommandHub Strategy stage · strategyRunning = true", () => {
  it("Build Strategy button is disabled while strategy is running", () => {
    mockGenState.strategyRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Strategy");
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);
    const btn = screen.getByRole("button", { name: /build strategy/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows 'Status' section label (not 'Actions') while strategy is running", () => {
    mockGenState.strategyRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Strategy");
    fireEvent.click(tile!);
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("progress phase label is visible alongside the disabled button while running", () => {
    mockGenState.strategyRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Strategy");
    fireEvent.click(tile!);
    // Phase label from PHASE_LABELS["strategy"] appears in both the running
    // strip and the hub Actions panel — getAllByText handles multiple matches.
    expect(screen.getAllByText(/loading analysis evidence/i).length).toBeGreaterThan(0);
  });

  it("Strategy tile itself is NOT disabled while running, running ≠ locked", () => {
    mockGenState.strategyRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Strategy");
    expect(tile).not.toBeNull();
    expect((tile as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Briefs — idle state ────────────────────────────────────────────────────

describe("CommandHub Briefs stage · idle (briefsRunning = false)", () => {
  it("Draft Briefs button is present and enabled in the idle state", () => {
    renderChain();
    const tile = getStageTile(document.body, "Briefs");
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);
    const btn = screen.getByRole("button", { name: /draft briefs/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Actions section label reads 'Actions' (not 'Status') when idle", () => {
    renderChain();
    const tile = getStageTile(document.body, "Briefs");
    fireEvent.click(tile!);
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.queryByText("Status")).toBeNull();
  });
});

// ── Briefs — running: button must be disabled ──────────────────────────────

describe("CommandHub Briefs stage · briefsRunning = true", () => {
  it("Draft Briefs button is disabled while briefs are running", () => {
    mockGenState.briefsRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Briefs");
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);
    const btn = screen.getByRole("button", { name: /draft briefs/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows 'Status' section label (not 'Actions') while briefs are running", () => {
    mockGenState.briefsRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Briefs");
    fireEvent.click(tile!);
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("progress phase label is visible alongside the disabled button while running", () => {
    mockGenState.briefsRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Briefs");
    fireEvent.click(tile!);
    // Phase label from PHASE_LABELS["briefs"] — getAllByText handles
    // the running strip + hub panel both showing the same text.
    expect(screen.getAllByText(/loading strategy context/i).length).toBeGreaterThan(0);
  });

  it("Briefs tile itself is NOT disabled while running, running ≠ locked", () => {
    mockGenState.briefsRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Briefs");
    expect(tile).not.toBeNull();
    expect((tile as HTMLButtonElement).disabled).toBe(false);
  });

  it("briefsRunning does not disable the Build Strategy button", () => {
    // A regression that confused stage assignments could bleed briefsRunning
    // into the strategy hub — verify the strategy button stays enabled.
    mockGenState.briefsRunning = true;
    renderChain();
    const strategyTile = getStageTile(document.body, "Strategy");
    expect(strategyTile).not.toBeNull();
    fireEvent.click(strategyTile!);
    const btn = screen.getByRole("button", { name: /build strategy/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Analysis — idle state ──────────────────────────────────────────────────

describe("CommandHub Analysis stage · idle (analysisRunning = false)", () => {
  it("Run Analysis button is present and enabled in the idle state", () => {
    renderChain();
    const tile = getStageTile(document.body, "Analysis");
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);
    // In idle state the Actions section renders the "Run Analysis" (or
    // "Re-run Analysis") button as a trigger for the confirmation panel.
    const btn = screen.getByRole("button", { name: /(re-?run|run) analysis/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Actions section label reads 'Actions' (not 'Status') when idle", () => {
    renderChain();
    const tile = getStageTile(document.body, "Analysis");
    fireEvent.click(tile!);
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.queryByText("Status")).toBeNull();
  });
});

// ── Analysis — running: button must be absent ──────────────────────────────

describe("CommandHub Analysis stage · analysisRunning = true", () => {
  it("Run Analysis button is absent while analysis is running", () => {
    // When analysisRunning is true the Actions() function returns only the
    // progress view — no button is rendered at all for the analysis stage.
    // A regression reintroducing the button would let users fire a second
    // concurrent run; this test catches that scenario.
    mockGenState.analysisRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Analysis");
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);
    expect(screen.queryByRole("button", { name: /(re-?run|run) analysis/i })).toBeNull();
  });

  it("shows 'Status' section label (not 'Actions') while analysis is running", () => {
    mockGenState.analysisRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Analysis");
    fireEvent.click(tile!);
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("progress phase label is visible in the hub while analysis is running", () => {
    mockGenState.analysisRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Analysis");
    fireEvent.click(tile!);
    // PHASE_LABELS["analysis"] at 0% starts with "Parsing performance data…"
    // Both the running strip and the hub panel show this label.
    expect(screen.getAllByText(/parsing performance data/i).length).toBeGreaterThan(0);
  });

  it("Analysis tile itself is NOT disabled while running, running ≠ locked", () => {
    mockGenState.analysisRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Analysis");
    expect(tile).not.toBeNull();
    expect((tile as HTMLButtonElement).disabled).toBe(false);
  });

  it("analysisRunning does not disable the Build Strategy button", () => {
    // A regression that confused stage assignments could bleed analysisRunning
    // into the strategy hub — verify the strategy button stays enabled.
    mockGenState.analysisRunning = true;
    renderChain();
    const strategyTile = getStageTile(document.body, "Strategy");
    expect(strategyTile).not.toBeNull();
    fireEvent.click(strategyTile!);
    const btn = screen.getByRole("button", { name: /build strategy/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
