// ─── CommandHub — generation button disabled-while-running guard ────────────
//
// Confirms that the "Build Strategy" and "Draft Briefs" action buttons inside
// the CommandHub are disabled while a generation run is in flight, and enabled
// (present and not disabled) in the idle state.
//
// The implementation renders the button with `disabled` when isRunning is true
// so users can see what action is locked — and so tests can assert the
// disabled state with a standard toBeDisabled() query.
//
// Covered regressions:
//   - Removing `disabled` from the running button → button becomes clickable
//   - Removing the isRunning check entirely → button fires a duplicate request
//   - Bleed between stages (e.g. briefsRunning disables the strategy button)
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
};

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetLatestAnalysisRun:         () => ({ data: null, refetch: vi.fn() }),
  getGetLatestAnalysisRunQueryKey: () => ["analysis", "latest"],
  getGetMetrixSeedQueryKey:        () => ["metrix", "seed"],
  useStartManualAnalysisRun:       () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListWorkspaceReports:         () => ({ data: { reports: [] } }),
  useListManualImports:            () => ({ data: { imports: [] } }),
  useListAnalysisRuns:             () => ({ data: { runs: [] } }),
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

vi.mock("@/hooks/use-toast", () => ({
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
  const spans = Array.from(container.querySelectorAll<HTMLElement>("span"));
  const labelSpan = spans.find(
    (s) => s.textContent?.trim() === label && /uppercase/.test(s.className),
  );
  return labelSpan?.closest("button") ?? null;
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockGenState.strategyRunning = false;
  mockGenState.briefsRunning   = false;
});

// ── Strategy — idle state ──────────────────────────────────────────────────

describe("CommandHub Strategy stage — idle (strategyRunning = false)", () => {
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

describe("CommandHub Strategy stage — strategyRunning = true", () => {
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

  it("Strategy tile itself is NOT disabled while running — running ≠ locked", () => {
    mockGenState.strategyRunning = true;
    renderChain();
    const tile = getStageTile(document.body, "Strategy");
    expect(tile).not.toBeNull();
    expect((tile as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Briefs — idle state ────────────────────────────────────────────────────

describe("CommandHub Briefs stage — idle (briefsRunning = false)", () => {
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

describe("CommandHub Briefs stage — briefsRunning = true", () => {
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

  it("Briefs tile itself is NOT disabled while running — running ≠ locked", () => {
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
