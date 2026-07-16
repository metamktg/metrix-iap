// ─── Placements conversion-tracking rendering ─────────────────────────
// LittleData has no delivery-based placement runs (v3/c4e empty) but its
// import carried a conversion-device export. The Placements view must
// surface that conversion-attributed signal instead of a dead-end
// "No placement signal" state — and must never fabricate spend/CPA for it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
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
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { PlacementsView } from "../analysis/PlacementsView";

const SESSION_KEY = "metrix_active_account_v1";

function select(adAccountId: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId }));
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <PlacementsView />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("PlacementsView · LittleData (conversion-only)", () => {
  it("fixture precondition: littledata has conversion signal but no delivery placement rows", () => {
    const a = seed.ad_accounts.find((x: { id: string }) => x.id === "littledata");
    expect(a.iap.analysis.v3_placement_signal).toHaveLength(0);
    expect(a.iap.analysis.c4e_placement_signal).toHaveLength(0);
    expect(a.iap.analysis.conversion_tracking_signal.placements.length).toBeGreaterThan(0);
  });

  it("renders the conversion-attributed placement signal instead of an empty state", () => {
    select("littledata");
    renderView();
    expect(screen.queryByText("No placement signal")).toBeNull();
    expect(screen.getByText("Conversion-attributed placements")).toBeTruthy();
    // Real placement rows from the export
    expect(screen.getAllByText("Feed").length).toBeGreaterThan(0);
    // The tracking-basis caveat is shown verbatim from the seed
    expect(screen.getByText(/Conversion-based tracking/)).toBeTruthy();
  });

  it("renders platform and device pivots from the same export", () => {
    select("littledata");
    renderView();
    expect(screen.getByText("Conversion-attributed platforms")).toBeTruthy();
    expect(screen.getByText("Conversion-attributed devices")).toBeTruthy();
  });

  it("never fabricates spend/CPA on the conversion surface", () => {
    select("littledata");
    renderView();
    expect(screen.queryByText("Placement spend")).toBeNull();
    expect(screen.queryByText("Spend by placement")).toBeNull();
    expect(screen.queryByText("CPA")).toBeNull();
  });
});

describe("PlacementsView · Bookster (delivery-based, unchanged)", () => {
  it("still renders the combined V3/C4E delivery rollup", () => {
    // The separate "V3 placement signal" / "C4E placement signal" sections
    // were merged into a single combined rollup ("Spend by placement");
    // the per-signal split now lives in the placement drill-down.
    select("bookster");
    renderView();
    expect(screen.getByText("Spend by placement")).toBeTruthy();
    // Combined rollup renders one ranked row per placement.
    const rows = document.querySelectorAll('[data-testid^="row-placement-"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(screen.queryByText("No placement signal")).toBeNull();
  });
});
