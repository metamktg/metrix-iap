// ─── KPI drill-down — tile click opens the modal in every view ───────
// One consistent modal everywhere: clicking a unified KPI tile body must
// open KpiDrilldownModal (data-testid="kpi-drilldown-modal") on Manager
// Overview, Ad Account Overview, Analysis Overview, Ad Performance, and
// Budget. Renders against the checked-in seed fixture.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cloneElement, type ReactElement } from "react";
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

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 500, height: 300 }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { ManagerOverview } from "../ManagerOverview";
import { AdAccountOverview } from "../AdAccountOverview";
import { AnalysisOverview } from "../analysis/AnalysisOverview";
import { AdPerformanceView } from "../analysis/AdPerformanceView";
import { BudgetView } from "../analysis/BudgetView";

const SESSION_KEY = "metrix_active_account_v1";

function select(type: "manager" | "ad_account", adAccountId: string | null) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type, adAccountId }));
}

function renderView(View: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <View />
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

/** Click the tile's main stat body (the drill-down affordance). */
function clickTileBody(tile: HTMLElement) {
  // The tile body is a button-like clickable region; the first button is
  // the metric label dropdown — click the tile element itself and any
  // click-forwarding wrapper inside it.
  const clickable = tile.querySelector('[data-testid="kpi-tile-body"]') ?? tile;
  fireEvent.click(clickable);
}

describe("clicking a KPI tile opens the drill-down modal", () => {
  it("Manager Overview — modal opens with per-account breakdown + coverage disclosure", () => {
    select("manager", null);
    const { container } = renderView(ManagerOverview);
    clickTileBody(within(container).getAllByTestId("kpi-tile")[0]);
    const modal = screen.getByTestId("kpi-drilldown-modal");
    expect(within(modal).getByTestId("window-coverage-disclosure")).toBeTruthy();
    expect(within(modal).getAllByTestId("account-window-label").length).toBeGreaterThan(0);
  });

  const ACCOUNT_SCOPED: [string, React.ComponentType][] = [
    ["Ad Account Overview", AdAccountOverview],
    ["Analysis Overview", AnalysisOverview],
    ["Ad Performance", AdPerformanceView],
    ["Budget", BudgetView],
  ];

  for (const [name, View] of ACCOUNT_SCOPED) {
    it(`${name} (Bookster) — modal opens with the account explorer`, () => {
      select("ad_account", "bookster");
      const { container } = renderView(View);
      clickTileBody(within(container).getAllByTestId("kpi-tile")[0]);
      const modal = screen.getByTestId("kpi-drilldown-modal");
      expect(within(modal).getByTestId("kpi-drilldown-window")).toBeTruthy();
    });
  }
});
