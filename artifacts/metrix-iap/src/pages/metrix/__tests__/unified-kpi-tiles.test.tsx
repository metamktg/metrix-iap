// ─── Unified KPI tiles — view-level regression tests ──────────────────
// Every migrated view (Manager Overview, Ad Account Overview, Analysis
// Overview, Ad Performance, Budget) must mount the unified KpiTile
// (data-testid="kpi-tile") with its metric dropdown, and the manager
// spend tile's verbose per-account sub-text must be gone from the tile
// body (progressively disclosed via the ⓘ hover instead).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, within, waitFor, screen } from "@testing-library/react";
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

const ACCOUNT_SCOPED: [string, React.ComponentType][] = [
  ["Ad Account Overview", AdAccountOverview],
  ["Analysis Overview", AnalysisOverview],
  ["Ad Performance", AdPerformanceView],
  ["Budget", BudgetView],
];

describe("unified KPI tiles mount on every migrated view", () => {
  it("Manager Overview renders unified tiles with metric dropdowns", () => {
    select("manager", null);
    const { container } = renderView(ManagerOverview);
    const tiles = within(container).getAllByTestId("kpi-tile");
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    // Dropdown works: open the first tile's label picker.
    const label = within(tiles[0]).getAllByRole("button")[0];
    fireEvent.click(label);
    // Portalled to document.body so .mx-kpi-tile's overflow:hidden cannot
    // clip it — so it is not a descendant of the render container.
    expect(screen.getByTestId("kpi-metric-dropdown")).toBeTruthy();
  });

  for (const [name, View] of ACCOUNT_SCOPED) {
    it(`${name} (Bookster) renders unified tiles`, () => {
      select("ad_account", "bookster");
      const { container } = renderView(View);
      const tiles = within(container).getAllByTestId("kpi-tile");
      expect(tiles.length).toBeGreaterThanOrEqual(4);
    });
  }
});

describe("manager spend tile · progressive disclosure", () => {
  it("no verbose per-account sub-text inline in any tile body", () => {
    select("manager", null);
    const { container } = renderView(ManagerOverview);
    for (const tile of within(container).getAllByTestId("kpi-tile")) {
      // Old inline sub looked like "Bookster $8.0k · skov $4.8k".
      expect(tile.textContent).not.toMatch(/\$[\d.]+k · /);
      expect(tile.textContent).not.toMatch(/Bookster \$/);
    }
  });

  it("per-account split renders in the info hover instead", async () => {
    select("manager", null);
    const { container } = renderView(ManagerOverview);
    const spendTile = within(container)
      .getAllByTestId("kpi-tile")
      .find((t) => t.textContent?.includes("Total spend"))!;
    fireEvent.focus(within(spendTile).getByTestId("kpi-tile-info"));
    await waitFor(() => {
      expect(screen.getAllByText(/Per-account split/).length).toBeGreaterThan(0);
    });
  });

  it("the By account expansion still works", () => {
    select("manager", null);
    const { container } = renderView(ManagerOverview);
    fireEvent.click(within(container).getByRole("button", { name: /by account/i }));
    expect(container.textContent).toContain("Account");
    expect(container.textContent).toContain("CPA");
  });
});

describe("tile metric selection persists per view", () => {
  it("Budget view remembers a swapped metric across remounts", () => {
    select("ad_account", "bookster");
    const first = renderView(BudgetView);
    const tiles = within(first.container).getAllByTestId("kpi-tile");
    fireEvent.click(within(tiles[1]).getAllByRole("button")[0]); // open dropdown
    // Portalled to document.body so .mx-kpi-tile's overflow:hidden cannot
    // clip it — so it is not a descendant of the render container.
    const dropdown = screen.getByTestId("kpi-metric-dropdown");
    fireEvent.click(within(dropdown).getByRole("button", { name: /cpm/i }));
    expect(within(first.container).getAllByTestId("kpi-tile")[1].textContent).toContain("CPM");
    first.unmount();
    cleanup();

    const second = renderView(BudgetView);
    expect(within(second.container).getAllByTestId("kpi-tile")[1].textContent).toContain("CPM");
  });
});
