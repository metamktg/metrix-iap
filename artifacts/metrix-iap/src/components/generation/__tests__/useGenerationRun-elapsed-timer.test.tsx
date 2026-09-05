// ─── useGenerationRun elapsed-timer seeding ───────────────────────────────
// Verifies that the elapsed-time counter in useGenerationRun seeds correctly
// from run.started_at on mount (page-reload mid-run) and falls back to
// Date.now() when started_at is absent.

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
  getListGenerationRunsQueryKey:     () => ["generation-runs"],
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

describe("useGenerationRun · elapsed-timer seeding", () => {
  it("seeds elapsed from started_at when mounted mid-run", () => {
    // Fix the current time so we can compute an exact expected delta.
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    const startedAt = new Date(now - 45_000).toISOString(); // 45 s ago

    mockGetLatestGenerationRun.mockReturnValue({
      data: { run: { id: "run-1", status: "running", started_at: startedAt } },
    });

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    expect(result.current.isRunning).toBe(true);

    // Advance 1 s so the setInterval callback fires once.
    act(() => { vi.advanceTimersByTime(1000); });

    // elapsed = floor((now + 1000 - (now - 45000)) / 1000) = 46
    expect(result.current.elapsedSeconds).toBe(46);
  });

  it("continues accumulating elapsed after seeding from started_at", () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    const startedAt = new Date(now - 20_000).toISOString(); // 20 s ago

    mockGetLatestGenerationRun.mockReturnValue({
      data: { run: { id: "run-2", status: "running", started_at: startedAt } },
    });

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    // After 5 more ticks from mount: elapsed = 20 + 5 = 25
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.elapsedSeconds).toBe(25);
  });

  it("falls back to Date.now() when started_at is absent", () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    // Running run but no started_at field
    mockGetLatestGenerationRun.mockReturnValue({
      data: { run: { id: "run-3", status: "running" } },
    });

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "briefs"),
      { wrapper },
    );

    expect(result.current.isRunning).toBe(true);

    // 1 tick — elapsed should be exactly 1 (seeded from Date.now())
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.elapsedSeconds).toBe(1);
  });

  it("falls back to Date.now() when started_at is null", () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    mockGetLatestGenerationRun.mockReturnValue({
      data: { run: { id: "run-4", status: "running", started_at: null } },
    });

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    act(() => { vi.advanceTimersByTime(3000); });
    // Seeded from Date.now(), so 3 ticks = 3 s
    expect(result.current.elapsedSeconds).toBe(3);
  });

  it("resets elapsed to 0 when isRunning becomes false", () => {
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    const startedAt = new Date(now - 10_000).toISOString();

    mockGetLatestGenerationRun.mockReturnValue({
      data: { run: { id: "run-5", status: "running", started_at: startedAt } },
    });

    const { result, rerender } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.elapsedSeconds).toBe(11);

    // Transition run to success — isRunning should become false
    mockGetLatestGenerationRun.mockReturnValue({
      data: { run: { id: "run-5", status: "success", started_at: startedAt } },
    });

    act(() => { rerender(); });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it("elapsed stays 0 when there is no active run", () => {
    mockGetLatestGenerationRun.mockReturnValue({ data: null });

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
  });
});
