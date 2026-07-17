// ─── Analysis run error-message verbatim surfacing tests ─────────────────
//
// Guards that when a latestAnalysisRun has status === "error" and a real
// error_message string, that exact string appears in the AnalysisControls
// rendered output — not a generic fallback or nothing.
//
// Regression target: if the field name drifts (e.g. error_message →
// errorMessage) or the JSX condition changes, these tests fail loudly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Per-test mutable state ─────────────────────────────────────────────────

let mockRunStatus: string | null = null;
let mockErrorMessage: string | null = null;

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetLatestAnalysisRun: () => ({
      data: mockRunStatus
        ? {
            run: {
              id: "run-1",
              status: mockRunStatus,
              error_message: mockErrorMessage,
              date_start: null,
              date_end: null,
              rows_ingested: null,
              creatives_linked: 0,
              creatives_total: 0,
              creatives_unlinked_names: [],
            },
          }
        : null,
      refetch: vi.fn(),
    }),
    useStartManualAnalysisRun: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useListManualImports: () => ({
      data: { imports: [] },
      refetch: vi.fn(),
    }),
    useGetManualPerformanceCsvFormat: () => ({ data: null }),
    useSyncCreativeLinks: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useUpdateManualImportAdNames: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
    getListManualImportsQueryKey: () => ["metrix", "imports"],
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { AnalysisControls } from "../ManualAnalysisControls";

// ── Helpers ────────────────────────────────────────────────────────────────

function renderControls() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalysisControls accountId="test-account-1" />
    </QueryClientProvider>,
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  mockRunStatus = null;
  mockErrorMessage = null;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AnalysisControls — error run shows verbatim error_message", () => {
  it("renders the exact error_message string when run.status is 'error'", () => {
    mockRunStatus = "error";
    mockErrorMessage = "CSV column 'age' is missing from the placement export";
    renderControls();
    expect(
      screen.getByText("CSV column 'age' is missing from the placement export"),
    ).toBeTruthy();
  });

  it("renders a different error_message verbatim — not a hardcoded string", () => {
    mockRunStatus = "error";
    mockErrorMessage = "Date range exceeds data coverage: no rows after 2024-01-01";
    renderControls();
    expect(
      screen.getByText(
        "Date range exceeds data coverage: no rows after 2024-01-01",
      ),
    ).toBeTruthy();
  });

  it("does not show the error span when run.status is 'success'", () => {
    mockRunStatus = "success";
    mockErrorMessage = null;
    const { container } = renderControls();
    // The red error span must not appear; the success date row appears instead
    expect(container.querySelector(".text-red-400\\/80")).toBeNull();
  });

  it("does not show an error message when there is no run yet", () => {
    mockRunStatus = null;
    mockErrorMessage = null;
    const { container } = renderControls();
    expect(container.querySelector(".text-red-400\\/80")).toBeNull();
    expect(screen.getByText("No analysis has been run yet.")).toBeTruthy();
  });

  it("renders no error span when error_message is null even if status is 'error'", () => {
    mockRunStatus = "error";
    mockErrorMessage = null;
    const { container } = renderControls();
    // Condition is (status === "error" && error_message) — falsy message → no span
    expect(container.querySelector(".text-red-400\\/80")).toBeNull();
  });
});
