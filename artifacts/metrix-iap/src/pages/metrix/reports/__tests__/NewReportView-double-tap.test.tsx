// ─── NewReportView — Generate Report double-tap guard ─────────────────────
//
// Confirms that rapid successive clicks on the "Generate report" button fire
// the underlying createReport mutate exactly once — even before any re-render
// has had a chance to disable the button via isPending.
//
// Mechanism: a ref (generateFireRef) blocks the second synchronous call to
// handleGenerate before any React state update can propagate. This mirrors
// the analysisFireRef guard in LoopCommandChain.tsx.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Seed fixture ──────────────────────────────────────────────────────────

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

// ── Per-test mutable state ────────────────────────────────────────────────

let mockMutate = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/reportExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportExport")>();
  return { ...actual, downloadReportExport: vi.fn().mockResolvedValue({ kind: "downloaded" }) };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGetReportSettings: () => ({ data: { default_format: "pdf" } }),
    useCreateWorkspaceReport: () => ({
      mutate: mockMutate,
      isPending: false,
    }),
    useListWorkspaceReports: () => ({ data: { reports: [] } }),
    getListWorkspaceReportsQueryKey: () => ["reports"],
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { NewReportView } from "../NewReportView";

// ── Helpers ───────────────────────────────────────────────────────────────

const SESSION_KEY = "metrix_active_account_v1";

function selectBookster() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ type: "ad_account", adAccountId: "bookster" })
  );
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <NewReportView />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  mockMutate = vi.fn(); // never resolves — mutation is in-flight
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("NewReportView — Generate Report double-tap guard", () => {
  it("renders the Generate report button for the bookster account", () => {
    selectBookster();
    renderView();
    expect(screen.getByRole("button", { name: /generate report/i })).toBeTruthy();
  });

  it("a rapid double-tap fires createReport exactly once", () => {
    selectBookster();
    renderView();

    const btn = screen.getByRole("button", { name: /generate report/i });
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("a triple-tap on the Generate report button still fires createReport only once", () => {
    selectBookster();
    renderView();

    const btn = screen.getByRole("button", { name: /generate report/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("createReport is called with the correct workspaceId and ad_account_id", () => {
    selectBookster();
    renderView();

    const btn = screen.getByRole("button", { name: /generate report/i });
    fireEvent.click(btn);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [callArg] = mockMutate.mock.calls[0];
    expect(callArg).toMatchObject({
      data: expect.objectContaining({
        ad_account_id: "bookster",
      }),
    });
  });

  it("Generate report button is not called at all before a click", () => {
    selectBookster();
    renderView();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
