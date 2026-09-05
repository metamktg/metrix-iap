// ─── Analysis Overview · the IAP Library module counts the run's rows ────
// The module row read "0 cell rows · 606 variable rows" for an account
// whose current run has 126: variable_performance keeps one row per run
// (the picker's history), and the count read every generation at once.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
);
const ACCOUNT_ID = "manual_9JGXU_AQJjxJ";
const account = (seed.ad_accounts as Record<string, any>[]).find((a) => a.id === ACCOUNT_ID)!;
const runId: string = account.iap.analysis.latest_analysis_run_id;
const rows: { manual_analysis_run_id?: string | null }[] = account.iap.analysis.v3_variable_performance;
const currentRunRows = rows.filter((r) => r.manual_analysis_run_id == null || r.manual_analysis_run_id === runId).length;

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AnalysisOverview } from "../analysis/AnalysisOverview";

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem("metrix_active_account_v1", JSON.stringify({ type: "ad_account", adAccountId: ACCOUNT_ID }));
  window.history.replaceState({}, "", "/app/analysis/overview");
});

describe("AnalysisOverview · IAP Library module count", () => {
  it("the fixture spans several runs, otherwise this proves nothing", () => {
    expect(rows.length).toBeGreaterThan(currentRunRows);
  });

  it("counts the current run's variable rows, not every generation", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AccountProvider>
            <DateRangeProvider>
              <AnalysisViewProvider>
                <AnalysisOverview />
              </AnalysisViewProvider>
            </DateRangeProvider>
          </AccountProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText(new RegExp(`${currentRunRows} variable rows`, "i"))).toBeTruthy();
    expect(screen.queryByText(new RegExp(`${rows.length} variable rows`, "i"))).toBeNull();
  });
});
