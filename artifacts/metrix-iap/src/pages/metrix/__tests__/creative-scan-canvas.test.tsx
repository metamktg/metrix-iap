// ─── Creative Scan — canvas QA zero-state composition ─────────────────
// The Nocturne creative.scan screen: a scan-stats strip and the
// pre-launch check grid. Honesty rules under test: the automated scan
// has never run, so stats render a zero state (0 scanned, "—" blocking,
// real library-asset count) and the grid shows only the check column
// heads with an explicit no-results note — never invented pass/fail
// cells. The real upload-and-map staging panel stays.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, within, screen } from "@testing-library/react";
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
import { CreativeScanView } from "../creative/CreativeScanView";

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
            <CreativeScanView />
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

describe("creative scan canvas zero state (Bookster)", () => {
  it("renders the stats strip with an honest zero state and the real library count", () => {
    renderFor("bookster");
    const stats = screen.getByTestId("scan-stats");
    expect(within(stats).getByText("Assets scanned")).toBeTruthy();
    expect(within(stats).getByText("Scan not yet run")).toBeTruthy();
    // Bookster's local_book2_library carries 15 real assets.
    expect(within(stats).getByText("Library assets")).toBeTruthy();
    expect(within(stats).getByText("15")).toBeTruthy();
    // Blocking has no results yet — an em dash, never a fabricated count.
    expect(within(stats).getByText("–")).toBeTruthy();
    expect(within(stats).getByText(/Automated pass planned/)).toBeTruthy();
  });

  it("renders the check grid heads with an explicit no-results note and no result cells", () => {
    renderFor("bookster");
    const grid = screen.getByTestId("scan-check-grid");
    for (const check of ["Naming convention", "Aspect ratio", "Safe zone", "Variable tag", "Claim cleared"]) {
      expect(within(grid).getByText(check)).toBeTruthy();
    }
    expect(screen.getByText(/No scan results yet/)).toBeTruthy();
    // No invented pass/fail cells anywhere.
    expect(screen.queryByText("Pass")).toBeNull();
    expect(screen.queryByText("Fail")).toBeNull();
  });

  it("keeps the real upload-and-map staging panel", () => {
    renderFor("bookster");
    expect(screen.getByText("Upload & map")).toBeTruthy();
  });
});
