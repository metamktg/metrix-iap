// ─── LoopCommandChain — real server progress label in the running strip ──────
//
// Task 617: Verifies that the running strip (and CommandHub Actions section)
// renders the correct phase label as the generation run transitions between
// states during live polling.
//
// Two main scenarios:
//   A. progress_pct > 0  → strip shows the server-provided stage string
//                          (not the elapsed-time PHASE_LABELS fallback)
//   B. progress_pct = 0  → strip shows the PHASE_LABELS fallback string
//
// The mock for useGenerationRun returns a `lastRun` object that mirrors what
// the real hook provides after polling the DB; the LoopCommandChain reads
// lastRun.progress_pct / lastRun.progress_stage directly from it to decide
// which label to render.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AdAccount } from "@/lib/data/seedTypes";

// ── Per-test mutable mock state ───────────────────────────────────────────
// Named with "mock" prefix so Vitest's hoisted vi.mock() factories can
// reference them before import declarations are evaluated.

type MockRunState = {
  kind: "strategy" | "briefs" | null;
  isRunning: boolean;
  progressPct: number | null;
  progressStage: string | null;
  elapsedSeconds: number;
};

const mockRunState: MockRunState = {
  kind: null,
  isRunning: false,
  progressPct: null,
  progressStage: null,
  elapsedSeconds: 5,
};

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetLatestAnalysisRun:         () => ({ data: null, refetch: vi.fn() }),
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
  useGenerationRun: (_accountId: string | null, kind: string) => {
    const active = kind === mockRunState.kind;
    return {
      isRunning:       active && mockRunState.isRunning,
      lastRun:         active && mockRunState.isRunning
        ? {
            id:             "run-test",
            status:         "running",
            progress_pct:   mockRunState.progressPct,
            progress_stage: mockRunState.progressStage,
          }
        : null,
      lastError:       null,
      elapsedSeconds:  active && mockRunState.isRunning ? mockRunState.elapsedSeconds : 0,
      progressPercent: 0,
      progressStage:   null,
      start:           vi.fn(),
    };
  },
}));

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { LoopCommandChain } from "../LoopCommandChain";

// ── Helpers ───────────────────────────────────────────────────────────────

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
  mockRunState.kind           = null;
  mockRunState.isRunning      = false;
  mockRunState.progressPct    = null;
  mockRunState.progressStage  = null;
  mockRunState.elapsedSeconds = 5;
});

// ── Running strip — server progress label ─────────────────────────────────

describe("LoopCommandChain running strip — real server stage label", () => {
  it("shows the server-provided stage string when strategy progress_pct > 0", () => {
    mockRunState.kind          = "strategy";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 60;
    mockRunState.progressStage = "Persisting pillars…";

    renderChain();

    // The running strip renders: "<StageLabel> · <phaseLabel>"
    // getAllByText handles both the strip and any hub panel matches.
    const matches = screen.getAllByText(/persisting pillars/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows the server-provided stage string when briefs progress_pct > 0", () => {
    mockRunState.kind          = "briefs";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 48;
    mockRunState.progressStage = "Writing creative briefs…";

    renderChain();

    const matches = screen.getAllByText(/writing creative briefs/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("running strip percentage reads the server pct value", () => {
    mockRunState.kind          = "strategy";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 60;
    mockRunState.progressStage = "Persisting pillars…";

    renderChain();

    // The strip renders the pct as e.g. "60%"
    const pctEl = screen.getAllByText(/60%/);
    expect(pctEl.length).toBeGreaterThan(0);
  });
});

// ── Running strip — fallback label when pct = 0 ───────────────────────────

describe("LoopCommandChain running strip — PHASE_LABELS fallback when progress_pct = 0", () => {
  it("shows the PHASE_LABELS[strategy][0] fallback when progress_pct is 0", () => {
    mockRunState.kind          = "strategy";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 0;
    mockRunState.progressStage = null;
    mockRunState.elapsedSeconds = 0;

    renderChain();

    // PHASE_LABELS.strategy[0] = "Loading analysis evidence…" at pct=0
    const matches = screen.getAllByText(/loading analysis evidence/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows the PHASE_LABELS[strategy][0] fallback when progress_pct is null (legacy run)", () => {
    mockRunState.kind          = "strategy";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = null;
    mockRunState.progressStage = null;
    mockRunState.elapsedSeconds = 0;

    renderChain();

    const matches = screen.getAllByText(/loading analysis evidence/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows the PHASE_LABELS[briefs][0] fallback when briefs progress_pct is 0", () => {
    mockRunState.kind          = "briefs";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 0;
    mockRunState.progressStage = null;
    mockRunState.elapsedSeconds = 0;

    renderChain();

    // PHASE_LABELS.briefs[0] = "Loading strategy context…" at pct=0
    const matches = screen.getAllByText(/loading strategy context/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});

// ── Polling cycle: label updates when progress_pct transitions 0 → 60 ────

describe("LoopCommandChain running strip — polling transition 0 → 60", () => {
  it("label updates from fallback to server stage when progress_pct transitions 0 → 60", () => {
    // Phase 1: run just started, no server progress yet
    mockRunState.kind          = "strategy";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 0;
    mockRunState.progressStage = null;
    mockRunState.elapsedSeconds = 0;

    const { rerender } = renderChain();

    // Fallback label is shown first
    expect(screen.getAllByText(/loading analysis evidence/i).length).toBeGreaterThan(0);
    // Server stage is NOT shown yet
    expect(screen.queryByText(/persisting pillars/i)).toBeNull();

    // Phase 2: poll fires — server has written pct=60
    mockRunState.progressPct   = 60;
    mockRunState.progressStage = "Persisting pillars…";

    act(() => {
      rerender(
        <LoopCommandChain accountId="acc-1" account={makeCompleteAccount()} managerId="mgr-1" />,
      );
    });

    // Server stage label now appears
    expect(screen.getAllByText(/persisting pillars/i).length).toBeGreaterThan(0);
    // Fallback label is gone
    expect(screen.queryByText(/loading analysis evidence/i)).toBeNull();
  });
});

// ── CommandHub Actions panel — server stage label ─────────────────────────

describe("CommandHub Actions — server stage label while strategy is running", () => {
  it("shows server stage string in the Actions progress panel when progress_pct > 0", () => {
    mockRunState.kind          = "strategy";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 60;
    mockRunState.progressStage = "Persisting pillars…";

    renderChain();

    // Open the Strategy CommandHub
    const strategyTile = getStageTile(document.body, "Strategy");
    expect(strategyTile).not.toBeNull();
    fireEvent.click(strategyTile!);

    // The Actions section of the hub also shows the phase label
    const matches = screen.getAllByText(/persisting pillars/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("shows PHASE_LABELS fallback in the Actions panel when progress_pct is 0", () => {
    mockRunState.kind          = "strategy";
    mockRunState.isRunning     = true;
    mockRunState.progressPct   = 0;
    mockRunState.progressStage = null;
    mockRunState.elapsedSeconds = 0;

    renderChain();

    const strategyTile = getStageTile(document.body, "Strategy");
    expect(strategyTile).not.toBeNull();
    fireEvent.click(strategyTile!);

    expect(screen.getAllByText(/loading analysis evidence/i).length).toBeGreaterThan(0);
  });
});
