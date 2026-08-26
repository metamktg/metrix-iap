// ─── Run warnings reach the screen that lists runs (C10) ──────────────
//
// csv_warnings has always been on the AnalysisRun the list endpoint
// returns, but only ManualAnalysisControls rendered it, and only for the
// LATEST run. A run started from the Loop command chain or the task tray
// surfaced its warnings nowhere, and the analysis history — the one screen
// that lists every run — showed none at all. Warnings belong wherever runs
// are started or listed.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const REDUCED_CONFIDENCE =
  "⚠ Reduced confidence: core metric columns are missing and will be null — Impressions. " +
  "Key analysis metrics (efficiency scores, CTR, CPM calculations) will be incomplete.";
const ROUTINE = 'Note: "Date" matched automatically to "Day" (via alias match) — no action needed.';

const RUNS = [
  {
    id: "run_warned",
    account_id: "bookster",
    status: "success",
    date_range: "30d",
    date_start: "2026-01-01",
    date_end: "2026-01-30",
    rows_ingested: 400,
    started_at: "2026-01-30T10:00:00.000Z",
    finished_at: "2026-01-30T10:05:00.000Z",
    csv_warnings: [REDUCED_CONFIDENCE, ROUTINE],
  },
  {
    id: "run_clean",
    account_id: "bookster",
    status: "success",
    date_range: "7d",
    date_start: "2026-01-20",
    date_end: "2026-01-27",
    rows_ingested: 90,
    started_at: "2026-01-27T10:00:00.000Z",
    finished_at: "2026-01-27T10:02:00.000Z",
    csv_warnings: null,
  },
];

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: RUNS }, isLoading: false }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AnalysisHistoryView } from "../analysis/AnalysisHistoryView";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderHistory() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <AnalysisHistoryView />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("AnalysisHistoryView — run warnings (C10)", () => {
  it("renders a warnings panel for the run that has warnings", () => {
    renderHistory();
    expect(screen.getAllByTestId("csv-warnings-panel").length).toBe(1);
  });

  it("leads with the reduced-confidence headline rather than a bare count", () => {
    renderHistory();
    expect(screen.getByText("Analysis succeeded with reduced confidence")).toBeTruthy();
  });

  it("keeps the routine mapping notice folded behind the finding", () => {
    renderHistory();
    // Collapsed by default: neither line is on screen until expanded.
    expect(screen.queryByText(new RegExp("via alias match"))).toBeNull();
    fireEvent.click(screen.getByText("Analysis succeeded with reduced confidence"));
    expect(screen.getByText(new RegExp("core metric columns are missing"))).toBeTruthy();
    expect(screen.getByText(new RegExp("1 routine notice"))).toBeTruthy();
  });

  it("renders no panel at all for a run with clean warnings", () => {
    renderHistory();
    // Only the warned run has one — a null csv_warnings must not produce an
    // empty amber box implying something was found.
    expect(screen.getAllByTestId("csv-warnings-panel").length).toBe(1);
  });
});
