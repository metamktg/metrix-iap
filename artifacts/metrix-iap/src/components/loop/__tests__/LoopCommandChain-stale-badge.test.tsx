// ─── LoopCommandChain — stale badge rendering ─────────────────────────────
//
// Verifies that the stale indicator on each StageTile appears / disappears
// correctly for every key state combination:
//
//   • All fresh          — no stale badge on any tile
//   • Strategy stale     — stale badge on Strategy tile only
//   • Briefs stale       — stale badge on Briefs tile only
//   • Both stale         — stale badge on both Strategy and Briefs tiles
//   • Strategy running   — stale badge suppressed on Strategy tile
//   • Briefs running     — stale badge suppressed on Briefs tile
//
// Implementation note:
//   When a tile is stale, StageTile applies "border-orange-400/30" to its
//   outer <button> element. Tests detect staleness by checking that class
//   substring — mirroring the real rendering contract without reaching into
//   internal icon/SVG structure.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AdAccount } from "@/lib/data/seedTypes";

// ── Timestamps ────────────────────────────────────────────────────────────

const T_OLD = "2024-01-01T10:00:00.000Z";
const T_NEW = "2024-01-03T10:00:00.000Z";

// ── Mock state ────────────────────────────────────────────────────────────
// Variables must start with "mock" so Vitest's hoisted vi.mock() factory
// can reference them before import declarations are evaluated.

const mockAnalysisState = {
  run: null as { status: string; finished_at?: string | null } | null,
};

const mockGenState = {
  strategyRun:      null as { status: string; finished_at?: string | null } | null,
  briefRun:         null as { status: string; finished_at?: string | null } | null,
  strategyRunning:  false,
  briefRunning:     false,
};

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetLatestAnalysisRun: () => ({
    data: mockAnalysisState.run ? { run: mockAnalysisState.run } : null,
    refetch: vi.fn(),
  }),
  getGetLatestAnalysisRunQueryKey: () => ["analysis", "latest"],
  getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
  useStartManualAnalysisRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListWorkspaceReports: () => ({ data: { reports: [] } }),
  useListManualImports: () => ({ data: { imports: [] } }),
}));

vi.mock("@/components/generation/GenerationControls", () => ({
  useGenerationRun: (_accountId: string | null, kind: string) => ({
    isRunning:      kind === "strategy" ? mockGenState.strategyRunning : mockGenState.briefRunning,
    lastRun:        kind === "strategy" ? mockGenState.strategyRun    : mockGenState.briefRun,
    elapsedSeconds: 0,
    start:          vi.fn(),
  }),
}));

import { LoopCommandChain } from "../LoopCommandChain";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeCompleteAccount(): AdAccount {
  return {
    id:   "acc-1",
    name: "Test Account",
    iap: {
      analysis: {
        performance_by_cell:     [{}] as any,
        v3_variable_performance: [] as any,
      },
      strategy: {
        message_pillars:   [{}] as any,
        active_hypotheses: [] as any,
        icp_profiles:      [] as any,
        provenance:        "imported",
      },
      brief_builder: {
        draft_briefs: [{}] as any,
        provenance:   "imported",
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
    <LoopCommandChain accountId="acc-1" account={account} managerId="test-manager" />,
    { wrapper: makeWrapper() },
  );
}

// Find a stage tile <button> by its visible label ("Analysis" | "Strategy" | "Briefs").
// The label is rendered in a <span> with uppercase tracking classes inside the button.
function getStageTile(container: HTMLElement, label: string): HTMLElement | null {
  const spans = Array.from(container.querySelectorAll<HTMLElement>("span"));
  const labelSpan = spans.find(
    (s) => s.textContent?.trim() === label && /uppercase/.test(s.className),
  );
  return labelSpan?.closest("button") ?? null;
}

function isOrangeStale(tile: HTMLElement | null): boolean {
  return !!tile && tile.className.includes("orange-400");
}

// ── Suite ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockAnalysisState.run     = null;
  mockGenState.strategyRun  = null;
  mockGenState.briefRun     = null;
  mockGenState.strategyRunning = false;
  mockGenState.briefRunning    = false;
});

describe("LoopCommandChain — stale badge rendering", () => {
  it("shows no stale badge when all stages are fresh", () => {
    // Analysis ran, strategy + briefs generated AFTER analysis → all fresh
    mockAnalysisState.run    = { status: "success", finished_at: T_OLD };
    mockGenState.strategyRun = { status: "success", finished_at: T_NEW };
    mockGenState.briefRun    = { status: "success", finished_at: T_NEW };

    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Strategy"))).toBe(false);
    expect(isOrangeStale(getStageTile(container, "Briefs"))).toBe(false);
  });

  it("shows a stale badge on Strategy when analysis finished after strategy was generated", () => {
    // Analysis (T_NEW) > Strategy (T_OLD) → strategy stale; briefs fresh
    mockAnalysisState.run    = { status: "success", finished_at: T_NEW };
    mockGenState.strategyRun = { status: "success", finished_at: T_OLD };
    mockGenState.briefRun    = { status: "success", finished_at: T_NEW };

    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Strategy"))).toBe(true);
    expect(isOrangeStale(getStageTile(container, "Briefs"))).toBe(false);
  });

  it("shows a stale badge on Briefs when analysis finished after briefs were generated", () => {
    // Analysis (T_NEW) > Briefs (T_OLD), strategy is fresh → only briefs stale
    mockAnalysisState.run    = { status: "success", finished_at: T_NEW };
    mockGenState.strategyRun = { status: "success", finished_at: T_NEW };
    mockGenState.briefRun    = { status: "success", finished_at: T_OLD };

    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Strategy"))).toBe(false);
    expect(isOrangeStale(getStageTile(container, "Briefs"))).toBe(true);
  });

  it("shows stale badges on both Strategy and Briefs after a fresh analysis run", () => {
    // Analysis (T_NEW) > Strategy (T_OLD) and Briefs (T_OLD) → both stale
    mockAnalysisState.run    = { status: "success", finished_at: T_NEW };
    mockGenState.strategyRun = { status: "success", finished_at: T_OLD };
    mockGenState.briefRun    = { status: "success", finished_at: T_OLD };

    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Strategy"))).toBe(true);
    expect(isOrangeStale(getStageTile(container, "Briefs"))).toBe(true);
  });

  it("suppresses the stale badge on Strategy while strategy is running", () => {
    // Timestamps say strategy is stale, but strategyRunning suppresses the badge
    mockAnalysisState.run       = { status: "success", finished_at: T_NEW };
    mockGenState.strategyRun    = { status: "success", finished_at: T_OLD };
    mockGenState.briefRun       = { status: "success", finished_at: T_NEW };
    mockGenState.strategyRunning = true;

    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Strategy"))).toBe(false);
  });

  it("suppresses the stale badge on Briefs while briefs are running", () => {
    // Timestamps say briefs are stale, but briefRunning suppresses the badge
    mockAnalysisState.run    = { status: "success", finished_at: T_NEW };
    mockGenState.strategyRun = { status: "success", finished_at: T_NEW };
    mockGenState.briefRun    = { status: "success", finished_at: T_OLD };
    mockGenState.briefRunning = true;

    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Briefs"))).toBe(false);
  });

  it("shows no stale badge when analysis has no successful run yet", () => {
    // analysisFinishedAt is null (failed run) → staleness cannot be computed
    mockAnalysisState.run    = { status: "error", finished_at: T_NEW };
    mockGenState.strategyRun = { status: "success", finished_at: T_OLD };
    mockGenState.briefRun    = { status: "success", finished_at: T_OLD };

    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Strategy"))).toBe(false);
    expect(isOrangeStale(getStageTile(container, "Briefs"))).toBe(false);
  });

  it("shows no stale badges at all when timestamps are absent (fresh account)", () => {
    // No runs at all — all timestamps null
    const { container } = renderChain();

    expect(isOrangeStale(getStageTile(container, "Strategy"))).toBe(false);
    expect(isOrangeStale(getStageTile(container, "Briefs"))).toBe(false);
  });
});
