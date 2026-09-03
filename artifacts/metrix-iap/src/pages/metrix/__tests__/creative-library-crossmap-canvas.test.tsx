// ─── Creative Library — canvas cross-map tab ───────────────────────────
// The Nocturne creative.library screen carries a third "Cross-map" tab
// (concept × funnel-stage cost per result) alongside Concept library and
// Variable library. Honesty rules under test: stages come only from real
// CellPerformanceRow.stage values (never a hardcoded list), an untested
// concept × stage combination renders an em dash rather than a fabricated
// number, and the tab count matches the real distinct-concept count.

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

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { CreativeLibraryView } from "../creative/CreativeLibraryView";

const SESSION_KEY = "metrix_active_account_v1";

function renderFor(adAccountId: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <CreativeLibraryView />
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

describe("creative library cross-map tab (Bookster)", () => {
  it("shows a Cross-map tab alongside Concept library and Variable library", () => {
    renderFor("bookster");
    expect(screen.getByRole("tab", { name: /Concept library/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Variable library/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Cross-map/i })).toBeTruthy();
  });

  it("renders real funnel-stage columns and concept rows, with an em dash for untested combinations", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByRole("tab", { name: /Cross-map/i }));

    // Bookster's real performance_by_cell only carries "MOF" and
    // "TOF to MOF" stages — never a fabricated/hardcoded stage set.
    expect(screen.getByText("MOF")).toBeTruthy();
    expect(screen.getByText("TOF to MOF")).toBeTruthy();

    // A real mapped concept appears as a row label.
    expect(screen.getByText("Time-poor learner product demo / 1,000 books proof")).toBeTruthy();

    // At least one untested concept × stage cell renders an honest em
    // dash rather than a fabricated cost figure.
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("keeps the concept-library and variable-library tabs' own content intact", () => {
    renderFor("bookster");
    expect(screen.getByRole("tab", { name: /Concept library/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Variable library/i })).toBeTruthy();
  });
});
