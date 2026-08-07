// ─── useGenerationRun double-tap guard ────────────────────────────────────
// Confirms that rapid successive calls to start() fire the underlying
// mutation exactly once, and that isRunning becomes true synchronously on
// the first call — before the mutation promise resolves.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ── API hook mocks ────────────────────────────────────────────────────────

const mockMutate = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGenerateAccountStrategy: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useGenerateAccountBriefs: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useGetLatestGenerationRun: () => ({
    data: null,
  }),
  getGetLatestGenerationRunQueryKey: () => ["latest-gen-run"],
  getGetMetrixSeedQueryKey: () => ["metrix-seed"],
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
});

describe("useGenerationRun — double-tap guard", () => {
  it("isRunning is false before start() is called", () => {
    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );
    expect(result.current.isRunning).toBe(false);
  });

  it("isRunning becomes true synchronously on the first start() call", () => {
    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("a rapid second start() call is dropped — mutation fires only once", () => {
    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    act(() => {
      result.current.start();
      result.current.start();
      result.current.start();
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("isRunning resets after onError clears the firing guard", () => {
    let capturedOnError: ((err: unknown) => void) | undefined;

    mockMutate.mockImplementationOnce(
      (_vars: unknown, { onError }: { onError: (e: unknown) => void }) => {
        capturedOnError = onError;
      },
    );

    const { result } = renderHook(
      () => useGenerationRun("acc-1", "strategy"),
      { wrapper },
    );

    act(() => { result.current.start(); });
    expect(result.current.isRunning).toBe(true);

    act(() => { capturedOnError?.(new Error("network failure")); });
    expect(result.current.isRunning).toBe(false);

    // After clearing, a fresh start() should fire again
    mockMutate.mockClear();
    act(() => { result.current.start(); });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("start() is a no-op when accountId is null", () => {
    const { result } = renderHook(
      () => useGenerationRun(null, "strategy"),
      { wrapper },
    );

    act(() => { result.current.start(); });
    expect(mockMutate).not.toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
  });
});
