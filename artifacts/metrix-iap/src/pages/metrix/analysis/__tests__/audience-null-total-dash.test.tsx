// ─── Audience tiles: a strict total that is null is a dash with the reason ──
// The Audience page read "Results 0" beside a prime segment carrying 1,270
// results (the no-cell fixture account, 2026-09-05): one of nineteen rows
// carried no result column, the strict sum went null, and null rendered
// as 0. Only a measured zero is a zero.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";

const ACCOUNT_ID = "manual_9JGXU_AQJjxJ";
const seed = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../test-fixtures/metrix_seed_bundle.json"), "utf-8"),
);
const account = (seed.ad_accounts as Record<string, any>[]).find((a) => a.id === ACCOUNT_ID)!;
const rows: Record<string, unknown>[] = account.iap.analysis.demographic_registration_signal;
const withResults = rows.filter((r) => r.Results != null).length;
const total = rows.filter((r) => r.Results != null).reduce((s, r) => s + Number(r.Results), 0);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getGetAnalysisSummaryQueryOptions: (accountId: string, preset: string) => ({ queryKey: ["analysis-summary", accountId, preset], queryFn: async () => ({}) }),
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
    getAuthMeQueryKey: () => ["auth", "me"],
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AudienceView } from "../AudienceView";

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); });

describe("AudienceView · null totals", () => {
  it("the fixture carries the case: one row without results among rows that have them", () => {
    expect(rows.length).toBeGreaterThan(withResults);
    expect(total).toBeGreaterThan(0);
  });

  it("the Results tile reads a dash with the reason, never 0, when a row lacks the field", () => {
    sessionStorage.setItem("metrix_active_account_v1", JSON.stringify({ type: "ad_account", adAccountId: ACCOUNT_ID }));
    window.history.replaceState({}, "", "/app/analysis/audience");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    render(
      <TooltipProvider>
        <QueryClientProvider client={client}>
          <AccountProvider>
            <DateRangeProvider>
              <AnalysisViewProvider>
                <AudienceView />
              </AnalysisViewProvider>
            </DateRangeProvider>
          </AccountProvider>
        </QueryClientProvider>
      </TooltipProvider>,
    );
    const tiles = document.querySelectorAll(".mx-kpi-tile");
    const texts = [...tiles].map((t) => t.textContent ?? "");
    const resultsTile = texts.find((t) => /^(Results|Purchases|Leads|Conversions)/i.test(t.trim()) || /Results/i.test(t));
    expect(resultsTile, texts.join(" || ")).toBeDefined();
    expect(resultsTile).not.toMatch(/(^|[^\d,.])0(?![\d,.%])/);
    expect(resultsTile).toMatch(/–/);
    expect(resultsTile).toMatch(new RegExp(`${rows.length - withResults} of ${rows.length} rows carry no results`));
  });
});
