// ─── Generation run error-message verbatim surfacing tests ───────────────
//
// Guards two error-surfacing paths in the generation layer:
//
//  1. GenerationErrorNote (pure component): "Last generation run failed: <msg>"
//     must render the exact message prop — no truncation, no generic fallback.
//
//  2. useGenerationRun.lastError: the hook must derive lastError from
//     run.error_message when status === "error", falling back to a short
//     sentinel only when error_message is absent — never silently returning null.
//
// Regression target: if the JSX text changes, the field name drifts, or the
// null-coalescing logic flips, these tests fail loudly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Per-test mutable state ─────────────────────────────────────────────────

let mockGenRunStatus: string | null = null;
let mockGenErrorMessage: string | null = null;

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

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
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
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GenerationErrorNote — verbatim message rendering", () => {
  it("renders the exact message inside the note text", () => {
    render(
      <GenerationErrorNote message="OpenAI rate limit exceeded — retry in 60 s" />,
    );
    expect(
      screen.getByText(
        /Last generation run failed: OpenAI rate limit exceeded — retry in 60 s/,
      ),
    ).toBeTruthy();
  });

  it("renders a different message verbatim — not a hardcoded string", () => {
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

describe("useGenerationRun — lastError derived from run.error_message", () => {
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
