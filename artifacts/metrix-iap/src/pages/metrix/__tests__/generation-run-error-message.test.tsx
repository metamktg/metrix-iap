// ─── Generation run error-message verbatim surfacing tests ───────────────
//
// Guards three error-surfacing paths in the generation layer:
//
//  1. GenerationErrorNote (pure component): "Last generation run failed: <msg>"
//     must render the exact message prop — no truncation, no generic fallback.
//
//  2. useGenerationRun.lastError: the hook must derive lastError from
//     run.error_message when status === "error", falling back to a short
//     sentinel only when error_message is absent — never silently returning null.
//
//  3. Polling-settlement toast: when a polled run transitions to "error", the
//     toast description must equal run.error_message — not the generic fallback.
//
// Regression target: if the JSX text changes, the field name drifts, or the
// null-coalescing logic flips, these tests fail loudly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Per-test mutable state ─────────────────────────────────────────────────

let mockGenRunStatus: string | null = null;
let mockGenErrorMessage: string | null = null;

// Captured toast spy — shared so settlement tests can assert on it.
const mockToastFn = vi.fn();

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestGenerationRun: () => ({
      data: mockGenRunStatus
        ? {
            run: {
              id: "gen-run-1",
              status: mockGenRunStatus,
              error_message: mockGenErrorMessage,
            },
          }
        : null,
    }),
    useGenerateAccountStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useGenerateAccountBriefs: () => ({ mutate: vi.fn(), isPending: false }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
    getGetLatestGenerationRunQueryKey: () => ["metrix", "gen-run"],
  };
});

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToastFn }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { GenerationErrorNote, useGenerationRun } from "@/components/generation/GenerationControls";
import type { GenerationKind } from "@/components/generation/GenerationControls";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Thin wrapper that calls useGenerationRun and renders lastError into the DOM
 * so the test can assert on it without reaching into hook internals.
 */
function HookHarness({ kind }: { kind: GenerationKind }) {
  const { lastError } = useGenerationRun("acct-1", kind);
  return <div data-testid="last-error">{lastError ?? "__null__"}</div>;
}

function renderHook(kind: GenerationKind = "strategy") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HookHarness kind={kind} />
    </QueryClientProvider>,
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockGenRunStatus = null;
  mockGenErrorMessage = null;
  mockToastFn.mockClear();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GenerationErrorNote · verbatim message rendering", () => {
  it("renders the exact message inside the note text", () => {
    render(
      <GenerationErrorNote message="OpenAI rate limit exceeded. Retry in 60 s" />,
    );
    expect(
      screen.getByText(
        /Last generation run failed: OpenAI rate limit exceeded. Retry in 60 s/,
      ),
    ).toBeTruthy();
  });

  it("renders a different message verbatim. Not a hardcoded string", () => {
    render(
      <GenerationErrorNote message="Supabase query returned 0 analysis rows; nothing to generate from" />,
    );
    expect(
      screen.getByText(
        /Last generation run failed: Supabase query returned 0 analysis rows/,
      ),
    ).toBeTruthy();
  });

  it("renders nothing when message is null", () => {
    const { container } = render(<GenerationErrorNote message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(
      <GenerationErrorNote message="Something went wrong" onRetry={onRetry} />,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("does not render the Retry button when onRetry is absent", () => {
    render(<GenerationErrorNote message="Something went wrong" />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});

describe("useGenerationRun, lastError derived from run.error_message", () => {
  it("lastError equals run.error_message when status is 'error'", () => {
    mockGenRunStatus = "error";
    mockGenErrorMessage = "Zod validation failed: missing required field 'hypothesis'";
    renderHook("strategy");
    expect(screen.getByTestId("last-error").textContent).toBe(
      "Zod validation failed: missing required field 'hypothesis'",
    );
  });

  it("lastError equals run.error_message for briefs kind too", () => {
    mockGenRunStatus = "error";
    mockGenErrorMessage = "Brief pillar IDs do not match strategy pillars";
    renderHook("briefs");
    expect(screen.getByTestId("last-error").textContent).toBe(
      "Brief pillar IDs do not match strategy pillars",
    );
  });

  it("lastError falls back to 'Generation failed.' when status is 'error' but error_message is null", () => {
    mockGenRunStatus = "error";
    mockGenErrorMessage = null;
    renderHook("strategy");
    expect(screen.getByTestId("last-error").textContent).toBe("Generation failed.");
  });

  it("lastError is null (rendered as __null__) when status is 'success'", () => {
    mockGenRunStatus = "success";
    mockGenErrorMessage = null;
    renderHook("strategy");
    expect(screen.getByTestId("last-error").textContent).toBe("__null__");
  });

  it("lastError is null (rendered as __null__) when there is no run yet", () => {
    mockGenRunStatus = null;
    mockGenErrorMessage = null;
    renderHook("strategy");
    expect(screen.getByTestId("last-error").textContent).toBe("__null__");
  });

  it("lastError is null (rendered as __null__) while run is 'running'", () => {
    mockGenRunStatus = "running";
    mockGenErrorMessage = null;
    renderHook("strategy");
    expect(screen.getByTestId("last-error").textContent).toBe("__null__");
  });
});

// ── Stable harness component for settlement toast tests ───────────────────
//
// Must be declared at module scope so React sees a stable component identity
// across rerender() calls. An inline function defined inside a helper creates
// a new type per call, causing React to unmount/remount and losing hook state
// (polling flag, settledRunIds ref) — which would prevent the settlement
// effect from ever firing.

function SettlementHarness({ kind }: { kind: GenerationKind }) {
  useGenerationRun("acct-1", kind);
  return null;
}

/**
 * Renders SettlementHarness with a fresh QueryClient and returns the RTL
 * rerender() helper pre-bound so callers can drive status transitions.
 */
function makeSettlementHarness(kind: GenerationKind) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SettlementHarness kind={kind} />
    </QueryClientProvider>,
  );
  const rerender = (nextKind: GenerationKind = kind) =>
    utils.rerender(
      <QueryClientProvider client={queryClient}>
        <SettlementHarness kind={nextKind} />
      </QueryClientProvider>,
    );
  return { rerender };
}

describe("useGenerationRun · polling-settlement toast shows real error_message", () => {
  it("toast description equals run.error_message when polling settles to error (strategy)", async () => {
    // Step 1: render with a running run — this triggers setPolling(true) in
    // the hook's "keep polling while running" effect.
    mockGenRunStatus = "running";
    mockGenErrorMessage = null;
    const { rerender } = makeSettlementHarness("strategy");
    // Flush the synchronous effect that sets polling=true.
    await act(async () => {});

    // Step 2: transition the run to error with a known message.
    // rerender() keeps the same QueryClient and SettlementHarness identity, so
    // React preserves the hook instance (polling state + settledRunIds ref).
    mockGenRunStatus = "error";
    mockGenErrorMessage = "Zod validation failed: missing required field 'hypothesis'";
    rerender();
    await act(async () => {});

    // The settlement effect fires: polling=true, status≠running, id unseen →
    // toast is called with the real error_message, not the generic fallback.
    expect(mockToastFn).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Zod validation failed: missing required field 'hypothesis'",
        variant: "destructive",
      }),
    );
  });

  it("toast description equals run.error_message when polling settles to error (briefs)", async () => {
    mockGenRunStatus = "running";
    mockGenErrorMessage = null;
    const { rerender } = makeSettlementHarness("briefs");
    await act(async () => {});

    mockGenRunStatus = "error";
    mockGenErrorMessage = "Brief pillar IDs do not match strategy pillars";
    rerender();
    await act(async () => {});

    expect(mockToastFn).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Brief pillar IDs do not match strategy pillars",
        variant: "destructive",
      }),
    );
  });

  it("toast description falls back to generic message when error_message is null", async () => {
    mockGenRunStatus = "running";
    mockGenErrorMessage = null;
    const { rerender } = makeSettlementHarness("strategy");
    await act(async () => {});

    mockGenRunStatus = "error";
    mockGenErrorMessage = null;
    rerender();
    await act(async () => {});

    expect(mockToastFn).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "The generation run ended with an error.",
        variant: "destructive",
      }),
    );
  });

  it("no destructive toast when polling settles to success", async () => {
    mockGenRunStatus = "running";
    mockGenErrorMessage = null;
    const { rerender } = makeSettlementHarness("strategy");
    await act(async () => {});

    mockGenRunStatus = "success";
    mockGenErrorMessage = null;
    rerender();
    await act(async () => {});

    const destructiveCalls = mockToastFn.mock.calls.filter(
      ([arg]) => (arg as { variant?: string }).variant === "destructive",
    );
    expect(destructiveCalls).toHaveLength(0);
  });
});
