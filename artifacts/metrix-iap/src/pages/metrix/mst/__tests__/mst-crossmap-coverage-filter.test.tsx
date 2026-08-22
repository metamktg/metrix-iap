// ─── MST Crossmap Results — coverage filter ───────────────────────────
// CrossmapResultsView's All/Delivered/Pending toggle narrows which
// planned matrix cells the table shows; the header totals above never
// change (see the component's own "Coverage filter" comment). This
// guards that each option actually narrows the rendered row set — not
// just that the control itself renders.
//
// Bookster fixture: the 4×4 matrix plans 16 cells (C1A..C4D). Only one
// of them, C2B, has observed performance rows (3 distinct result
// types) — the rest (including C1A) are still pending.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json"
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
import { MstCrossMapView } from "../MstCrossMapView";

const SESSION_KEY = "metrix_active_account_v1";

function renderCrossmapTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <MstCrossMapView />
            </AnalysisViewProvider>
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /Crossmap Results/i }));
}

function coverageGroup() {
  return screen.getByRole("group", { name: "Filter crossmap coverage" });
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
});

describe("Crossmap Results coverage filter", () => {
  it("All shows both delivered and pending cells", () => {
    renderCrossmapTab();
    const table = screen.getByRole("table");
    expect(within(table).getByText("C2B")).toBeTruthy(); // delivered
    expect(within(table).getByText("C1A")).toBeTruthy(); // pending
    // The narrowing counter ("N of 16 cells", no trailing "%") only appears
    // once a filter other than "all" is active — distinct from the always-on
    // "Matrix coverage" bar text ("1 of 16 cells · 6%"), which uses exact-text
    // matching here to avoid a false match against that bar.
    expect(screen.queryByText("16 of 16 cells")).toBeNull();
  });

  it("Delivered narrows to only the cell with observed performance rows", () => {
    renderCrossmapTab();
    fireEvent.click(within(coverageGroup()).getByRole("button", { name: "Delivered" }));

    expect(screen.getByText("1 of 16 cells")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("C2B")).toBeTruthy();
    expect(within(table).queryByText("C1A")).toBeNull();
    // C2B ran 3 distinct result types in the fixture — one row per result type.
    expect(within(table).getAllByRole("row")).toHaveLength(1 /* header */ + 3);
  });

  it("Pending narrows to only cells without performance rows yet", () => {
    renderCrossmapTab();
    fireEvent.click(within(coverageGroup()).getByRole("button", { name: "Pending" }));

    expect(screen.getByText("15 of 16 cells")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).queryByText("C2B")).toBeNull();
    expect(within(table).getByText("C1A")).toBeTruthy();
  });

  it("switching back to All restores the full set", () => {
    renderCrossmapTab();
    fireEvent.click(within(coverageGroup()).getByRole("button", { name: "Delivered" }));
    expect(screen.getByText("1 of 16 cells")).toBeTruthy();

    fireEvent.click(within(coverageGroup()).getByRole("button", { name: "All" }));
    expect(screen.queryByText("16 of 16 cells")).toBeNull();
    expect(screen.queryByText("1 of 16 cells")).toBeNull();
    const table = screen.getByRole("table");
    expect(within(table).getByText("C2B")).toBeTruthy();
    expect(within(table).getByText("C1A")).toBeTruthy();
  });
});
