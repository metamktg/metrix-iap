// ─── Analysis Command Center — canvas fidelity fixes ───────────────────
// Nocturne canvas parity: the header carries the same real date-range /
// Export control cluster as AdAccountOverview (OverviewHeaderControls),
// the execution card's tiles are honest pre-run readiness stats (staged
// imports, ads in scope, run window, objectives) instead of stale
// analysis-derived numbers, and staged manual imports get their own card
// separate from the run trigger.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseSeed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

type MockRun = {
  id: string;
  status: string;
  date_range?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  rows_ingested?: number | null;
  started_at: string;
};

let mockRuns: MockRun[] = [];
let mockImports: { id: string; filename: string; kind: string; status: string }[] = [];
let navigateSpy: ReturnType<typeof vi.fn>;

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ["/app/analysis", navigateSpy],
  };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: mockRuns } }),
    useListManualImports: () => ({ data: { imports: mockImports } }),
    useGetAccountStageStatus: () => ({ data: null }),
    getListAnalysisRunsQueryKey: () => ["analysis-runs"],
    getListManualImportsQueryKey: () => ["manual-imports"],
    getGetAccountStageStatusQueryKey: () => ["stage-status"],
    ApiError: class ApiError extends Error {},
  };
});

vi.mock("@workspace/command-deck/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => baseSeed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisCommandCenter } from "@/pages/metrix/analysis/AnalysisCommandCenter";

const SESSION_KEY = "metrix_active_account_v1";
function selectBookster() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
}

function renderCC() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisCommandCenter />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  mockRuns = [];
  mockImports = [];
  navigateSpy = vi.fn();
  selectBookster();
});

afterEach(() => {
  cleanup();
});

describe("AnalysisCommandCenter — header control cluster", () => {
  it("renders the real date-range pills and an Export button that navigates to /app/exports/analysis", async () => {
    await act(async () => { renderCC(); });
    expect(screen.getByRole("group", { name: "Date range" })).toBeTruthy();
    const exportBtn = screen.getByRole("button", { name: "Export" });
    fireEvent.click(exportBtn);
    expect(navigateSpy).toHaveBeenCalledWith("/app/exports/analysis");
  });
});

describe("AnalysisCommandCenter — execution card is honest pre-run readiness", () => {
  it("shows real staged-imports, ads-in-scope, window, and objectives tiles", async () => {
    mockImports = [
      { id: "imp-1", filename: "demo.csv", kind: "performance_demo_csv", status: "staged" },
      { id: "imp-2", filename: "placement.csv", kind: "performance_placement_csv", status: "staged" },
    ];
    await act(async () => { renderCC(); });
    expect(screen.getByText("Staged imports")).toBeTruthy();
    expect(screen.getByText("Ads in scope")).toBeTruthy();
    expect(screen.getByText("Objectives")).toBeTruthy();
    // Bookster's fixture account has 61 registered ads and one configured objective ("app" → "App").
    expect(screen.getByText("61")).toBeTruthy();
    expect(screen.getByText("App")).toBeTruthy();
    // Default run window mirrors AnalysisControls' own default ("30d").
    expect(screen.getByText("30 days")).toBeTruthy();
  });

  it("never shows a leftover analysis-derived tile — tile count reflects staged imports, not stale prior-run rows", async () => {
    mockImports = [];
    await act(async () => { renderCC(); });
    // Zero staged imports is an honest "0", not blank or a stale number.
    const tileWrapper = screen.getByText("Staged imports").parentElement;
    expect(tileWrapper?.textContent).toContain("0");
  });
});

describe("AnalysisCommandCenter — Manual import card", () => {
  it("shows an honest empty state when nothing is staged", async () => {
    mockImports = [];
    await act(async () => { renderCC(); });
    expect(screen.getByText("Manual import")).toBeTruthy();
    expect(screen.getByText("Upload performance exports from Settings → General before running analysis.")).toBeTruthy();
  });

  it("lists each staged file with a Staged badge, separate from the run trigger card", async () => {
    mockImports = [
      { id: "imp-1", filename: "demographics-export.csv", kind: "performance_demo_csv", status: "staged" },
      { id: "imp-2", filename: "placement-export.csv", kind: "performance_placement_csv", status: "staged" },
      { id: "imp-3", filename: "old-file.csv", kind: "performance_demo_csv", status: "processed" },
    ];
    await act(async () => { renderCC(); });
    expect(screen.getByText("demographics-export.csv")).toBeTruthy();
    expect(screen.getByText("placement-export.csv")).toBeTruthy();
    // A processed (already-consumed) import is not part of the current staging area.
    expect(screen.queryByText("old-file.csv")).toBeNull();
    expect(screen.getAllByText("Staged").length).toBe(2);
  });
});

describe("AnalysisCommandCenter — Run history card", () => {
  it("shows an honest empty state when no runs exist yet", async () => {
    mockRuns = [];
    await act(async () => { renderCC(); });
    expect(screen.getByText("No analysis runs yet for this account.")).toBeTruthy();
  });

  it("filters recent runs by the header's selected window", async () => {
    const now = Date.now();
    mockRuns = [
      { id: "run-recent", status: "success", started_at: new Date(now - 2 * 86_400_000).toISOString(), date_start: "2026-08-10", date_end: "2026-08-17" },
      { id: "run-old", status: "success", started_at: new Date(now - 60 * 86_400_000).toISOString(), date_start: "2026-06-10", date_end: "2026-06-17" },
    ];
    await act(async () => { renderCC(); });
    // Default "all" shows both real runs.
    expect(screen.getByText("2026-08-10 → 2026-08-17")).toBeTruthy();
    expect(screen.getByText("2026-06-10 → 2026-06-17")).toBeTruthy();

    const sevenDayPill = screen.getByRole("button", { name: "7d" });
    await act(async () => { fireEvent.click(sevenDayPill); });
    expect(screen.getByText("2026-08-10 → 2026-08-17")).toBeTruthy();
    expect(screen.queryByText("2026-06-10 → 2026-06-17")).toBeNull();
  });
});
