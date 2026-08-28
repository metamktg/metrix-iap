// ─── MST Cross-Map — single-header regression test ────────────────────
// MstCrossMapView merges ConceptMapView and CrossmapResultsView into one
// tabbed surface. Both child views used to render their own full
// <ModuleHeader>, stacking a second, duplicate <h1> beneath the tab pill
// that already restated the same title. Guards that exactly one <h1>
// renders regardless of which tab is active.

import { withUnconfiguredAccount } from "@/test-fixtures/unconfigured";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seed = withUnconfiguredAccount(JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
), "skov_pet");

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

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
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
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
});

describe("MstCrossMapView single-header regression", () => {
  it("renders exactly one heading on the Concept Map tab", () => {
    renderView();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders exactly one heading after switching to the Crossmap Results tab", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Crossmap Results/i }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Bookster · Crossmap Results");
  });

  it("shows only one heading even in the unconfigured/no-account state", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: "skov_pet" }));
    renderView();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
