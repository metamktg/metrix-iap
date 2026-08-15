// ─── Conversion-export confirmation gate (TaskTray) ───────────────────────
//
// The Task Tray's "Run Analysis" quick-action calls the same
// useStartManualAnalysisRun mutation as the main Manual Analysis panel. When
// the API rejects a run with 409 + code "conversion_export_confirmation_required"
// (a staged file looks like a Meta conversion-event export rather than a
// delivery export), the tray must offer a confirm/cancel dialog rather than a
// dead-end error, and only resubmit with confirm_conversion_export after the
// user chooses "Run anyway".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskTray } from "../TaskTray";
import { _resetForTest } from "@/lib/data/trayStore";

// ── Mock wouter ───────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Router: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ["/", vi.fn()] as [string, ReturnType<typeof vi.fn>],
}));

// ── Mock AccountContext — ad_account view so TrayAnalysisConfigured renders

const mockUseAccount = vi.fn();

vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => mockUseAccount(),
  useScopedAdAccountId: () => "acct_1",
}));

// ── Mock TaskTrayContext ────────────────────────────────────────────────

vi.mock("@/contexts/TaskTrayContext", () => ({
  useTaskTray: () => ({ open: true, toggle: vi.fn(), close: vi.fn() }),
  TaskTrayProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock api-client-react ──────────────────────────────────────────────

let mockMutateAsync = vi.fn();

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useStartManualAnalysisRun: () => ({
      mutate: vi.fn(),
      mutateAsync: mockMutateAsync,
      isPending: false,
    }),
    useGetLatestAnalysisRun: () => ({
      data: { run: null },
      refetch: vi.fn(),
    }),
    getGetMetrixSeedQueryKey: () => ["metrix-seed"],
  };
});

import { ApiError } from "@workspace/api-client-react";

function conversionExportError() {
  const response = new Response(null, { status: 409, statusText: "Conflict" });
  return new ApiError(
    response,
    {
      code: "conversion_export_confirmation_required",
      message: "One of your staged files looks like a conversion export, not a delivery export.",
      files: ["conversions_export.csv"],
    },
    { method: "POST", url: "/api/metrix/accounts/acct_1/analysis-runs" }
  );
}

function baseAccountCtx() {
  return {
    manager: {
      id: "mgr",
      name: "Test Agency",
      type: "agency",
      overview_mode: "manager",
      configured_ad_accounts: 1,
      unconfigured_ad_accounts: 0,
      bottom_line_totals: {},
      recommendation_cards: [],
    },
    adAccounts: [],
    selectedAccountType: "ad_account" as const,
    activeManagerAccountId: "mgr",
    activeAdAccountId: "acct_1",
    activeAdAccount: {
      id: "acct_1",
      name: "Acct 1",
      status: "configured",
      iap: { strategy: null, brief_builder: null },
      listen: {},
    },
    selectManager: vi.fn(),
    selectAdAccount: vi.fn(),
    setActiveAdAccountId: vi.fn(),
  };
}

function renderTray() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskTray />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  _resetForTest();
  mockUseAccount.mockReturnValue(baseAccountCtx());
  mockMutateAsync = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("TaskTray — conversion-export confirmation gate", () => {
  it("shows a confirm/cancel dialog instead of a dead-end error on 409 conversion_export_confirmation_required", async () => {
    mockMutateAsync.mockRejectedValueOnce(conversionExportError());
    renderTray();

    fireEvent.click(screen.getByRole("button", { name: /run analysis/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/this looks like a conversion export, not a delivery export/i)
      ).toBeTruthy();
    });
    expect(screen.getByText(/conversions_export\.csv/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /run anyway/i })).toBeTruthy();
  });

  it("clicking 'Run anyway' resubmits with confirm_conversion_export: true", async () => {
    mockMutateAsync.mockRejectedValueOnce(conversionExportError());
    mockMutateAsync.mockResolvedValueOnce({});
    renderTray();

    fireEvent.click(screen.getByRole("button", { name: /run analysis/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run anyway/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /run anyway/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });
    const [secondCallArg] = mockMutateAsync.mock.calls[1];
    expect(secondCallArg).toMatchObject({
      accountId: "acct_1",
      data: expect.objectContaining({ confirm_conversion_export: true }),
    });
  });

  it("cancelling the dialog does not resubmit", async () => {
    mockMutateAsync.mockRejectedValueOnce(conversionExportError());
    renderTray();

    fireEvent.click(screen.getByRole("button", { name: /run analysis/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run anyway/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/this looks like a conversion export, not a delivery export/i)
      ).toBeNull();
    });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
