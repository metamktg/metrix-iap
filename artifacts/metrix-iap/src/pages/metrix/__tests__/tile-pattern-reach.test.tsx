// ─── The Library's tile pattern, on the pages whose subject it is ─────
//
// Task #38: "apply the IAP Library tile pattern throughout". Two pages were
// carrying the account's most interpretive content with no measured header:
//
//   · Creative DNA — the page ABOUT variables had no tiles at all, so a
//     reader arrived at gene loci with no idea how much money the scope in
//     front of them represents.
//   · Avatars — four structural counts (how many profiles, pillars,
//     segments, matrix avatars) and not one figure about money.
//
// Both now carry a configurable KpiTileRow built from the SAME scoped rows
// the content below them reads, so a tile can never disagree with the cards
// under it, and both open the shared breakdown rather than a bespoke one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

vi.mock("@/contexts/MetrixDataContext", () => ({
  useMetrixSeed: () => seed,
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: [] } }),
    useSyncCreativeLinks: () => ({ mutateAsync: vi.fn(), isPending: false }),
    getAuthMeQueryKey: () => ["auth", "me"],
    getGetMetrixSeedQueryKey: () => ["metrix", "seed"],
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AnalysisDnaView } from "../analysis/AnalysisDnaView";
import { AvatarsView } from "../strategy/AvatarsView";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderPage(ui: React.ReactElement, url: string) {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  window.history.replaceState({}, "", url);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>{ui}</AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

describe("Creative DNA — measured header", () => {
  it("carries a configurable tile row over the same rows the page reads", () => {
    renderPage(<AnalysisDnaView />, "/app/analysis/dna");
    const row = screen.getByTestId("dna-tile-row");
    expect(within(row).getAllByTestId("kpi-tile").length).toBeGreaterThan(0);
    // Configurable: each tile's label is the trigger for its own metric
    // picker, the same affordance the Library's tiles have.
    const triggers = within(row).getAllByRole("button", { expanded: false });
    expect(triggers.length).toBeGreaterThan(0);
    fireEvent.click(triggers[0]!);
    expect(screen.getByTestId("kpi-metric-dropdown")).toBeTruthy();
  });

  it("opens the shared breakdown from a tile rather than a bespoke one", () => {
    renderPage(<AnalysisDnaView />, "/app/analysis/dna");
    const tile = within(screen.getByTestId("dna-tile-row")).getAllByTestId("kpi-tile-body")[0]!;
    fireEvent.click(tile);
    expect(screen.getByTestId("kpi-drilldown-modal")).toBeTruthy();
    // The breakdown the modal offers includes the variable families — the
    // page's own subject.
    const breakdown = screen.getByLabelText("Breakdown") as HTMLSelectElement;
    expect([...breakdown.options].some((o) => o.value.startsWith("var:"))).toBe(true);
  });
});

describe("Avatars — audience performance beside the structural counts", () => {
  it("keeps the counts and adds the money", () => {
    renderPage(<AvatarsView />, "/app/strategy/avatars");
    // The structural tiles stay: they answer "how many", which the
    // performance row does not.
    expect(screen.getAllByText("ICP profiles").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Segments").length).toBeGreaterThan(0);
    // And the measured row exists, labelled for what it is.
    const row = screen.getByTestId("audience-tile-row");
    expect(within(row).getAllByTestId("kpi-tile").length).toBeGreaterThan(0);
    expect(screen.getByText(/Audience performance/i)).toBeTruthy();
  });

  it("opens the breakdown from an audience tile", () => {
    renderPage(<AvatarsView />, "/app/strategy/avatars");
    const tile = within(screen.getByTestId("audience-tile-row")).getAllByTestId("kpi-tile-body")[0]!;
    fireEvent.click(tile);
    expect(screen.getByTestId("kpi-drilldown-modal")).toBeTruthy();
  });
});
