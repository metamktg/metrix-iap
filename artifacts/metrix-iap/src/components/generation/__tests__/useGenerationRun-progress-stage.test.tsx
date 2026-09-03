// ─── useGenerationRun — real server progress vs time-estimate fallback ───────
//
// Task 617: Confirms that useGenerationRun switches from the elapsed-time
// fallback to the real server value when progress_pct becomes non-zero, and
// reverts to the fallback (progressStage = null) when progress_pct is 0 or
// absent (e.g. columns not yet migrated on a legacy run).
//
// Covered behaviours:
//   - progress_pct > 0  → progressPercent = serverPct, progressStage = serverStage
//   - progress_pct = 0  → progressStage = null (caller uses PHASE_LABELS fallback)
//                          progressPercent comes from calcGenerationProgress (>0 once elapsed)
//   - progress_pct null → treated as 0 (same fallback path)
//   - polling cycle: pct 0 → 60 mid-run → progressStage updates to server value

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ── Configurable mock for useGetLatestGenerationRun ───────────────────────

const mockGetLatestGenerationRun = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
  useGenerateAccountBriefs:   () => ({ mutate: vi.fn(), isPending: false }),
  useGetLatestGenerationRun:  (...args: unknown[]) => mockGetLatestGenerationRun(...args),
  getGetLatestGenerationRunQueryKey: () => ["latest-gen-run"],
  getGetMetrixSeedQueryKey:          () => ["metrix-seed"],
  ApiError: class ApiError extends Error {},
}));

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { useGenerationRun } from "../GenerationControls";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Helpers ───────────────────────────────────────────────────────────────

function runningRun(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      run: {
        id: "run-1",
        status: "running",
        started_at: new Date(Date.now() - 5_000).toISOString(),
        ...overrides,
      },
    },
  };
}

// ── Real server progress (progress_pct > 0) ────────────────────────────────

describe("useGenerationRun · real server progress (progress_pct > 0)", () => {
  it("progressPercent equals the server value when progress_pct is non-zero", () => {
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 60, progress_stage: "Persisting pillars…" }),
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.progressPercent).toBe(60);
  });

  it("progressStage equals the server stage string when progress_pct is non-zero", () => {
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 60, progress_stage: "Persisting pillars…" }),
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.progressStage).toBe("Persisting pillars…");
  });

  it("progressPercent tracks whatever the server reports (e.g. 85%)", () => {
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 85, progress_stage: "Finalizing strategy…" }),
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.progressPercent).toBe(85);
    expect(result.current.progressStage).toBe("Finalizing strategy…");
  });

  it("works the same way for a briefs run", () => {
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 48, progress_stage: "Writing creative briefs…" }),
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "briefs"),
      { wrapper },
    );

    expect(result.current.progressPercent).toBe(48);
    expect(result.current.progressStage).toBe("Writing creative briefs…");
  });
});

// ── Time-estimate fallback (progress_pct = 0 / null) ─────────────────────

describe("useGenerationRun · time-estimate fallback when progress_pct is 0", () => {
  it("progressStage is null when progress_pct is 0 (caller uses PHASE_LABELS)", () => {
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 0, progress_stage: "" }),
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.isRunning).toBe(true);
    expect(result.current.progressStage).toBeNull();
  });

  it("progressStage is null when progress_pct is null (legacy run. Columns not yet migrated)", () => {
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: null, progress_stage: null }),
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.progressStage).toBeNull();
  });

  it("progressPercent comes from the elapsed-time estimate (not 0) after some seconds pass", () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    // Run started 30 s ago; no server progress yet
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 0, progress_stage: null }),
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    // Advance 5 s of ticks
    act(() => { vi.advanceTimersByTime(5000); });

    // elapsed ≈ 30+5 = 35 s; quadratic ease-out on 75-s expected: t=35/75≈0.467
    // ease = 1-(1-0.467)^2 ≈ 0.716 → pct = round(0.716*95) = 68
    // Just confirm it's above 0 (time-estimate is running) and below 95
    expect(result.current.progressPercent).toBeGreaterThan(0);
    expect(result.current.progressPercent).toBeLessThanOrEqual(95);
  });

  it("progressPercent is 0 when isRunning is false even if the run has a progress_pct", () => {
    mockGetLatestGenerationRun.mockReturnValue({
      data: {
        run: {
          id: "run-done",
          status: "success",
          progress_pct: 100,
          progress_stage: "Done",
        },
      },
    });

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.isRunning).toBe(false);
    expect(result.current.progressPercent).toBe(0);
    expect(result.current.progressStage).toBeNull();
  });
});

// ── Polling cycle: pct 0 → 60 mid-run ────────────────────────────────────

describe("useGenerationRun · polling cycle: progress_pct transitions 0 → 60", () => {
  it("switches from fallback to server value when progress_pct becomes non-zero", () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    // Phase 1: run just started, no server progress yet
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 0, progress_stage: null }),
    );

    const { result, rerender } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.progressStage).toBeNull();

    // Phase 2: poll fires — server has written pct=60, stage="Persisting pillars…"
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 60, progress_stage: "Persisting pillars…" }),
    );

    act(() => { rerender(); });

    expect(result.current.progressPercent).toBe(60);
    expect(result.current.progressStage).toBe("Persisting pillars…");
  });

  it("switching back to pct=0 (e.g. next stage not yet written) reverts to fallback", () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    // Start with real progress
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 60, progress_stage: "Persisting pillars…" }),
    );

    const { result, rerender } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.progressStage).toBe("Persisting pillars…");

    // Server resets pct to 0 between pipeline phases
    mockGetLatestGenerationRun.mockReturnValue(
      runningRun({ progress_pct: 0, progress_stage: null }),
    );

    act(() => { rerender(); });

    // Falls back: progressStage is null, progressPercent from elapsed time estimate
    expect(result.current.progressStage).toBeNull();
  });
});
