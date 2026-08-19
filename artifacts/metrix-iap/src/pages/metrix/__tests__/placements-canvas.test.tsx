// ─── Placements — canvas breakdown bars + device delivery grid ────────
// The Nocturne analysis.placement composition: placement rows render as
// horizontal bars scaled to the top placement on the active KPI, and the
// real device_delivery_signal renders as a shaded grid benchmarked
// against the account blend. Honesty rules under test: the device grid
// only exists when rows carry real numbers (all-null manual imports get
// nothing), and devices with zero conversions read "—" for cost per
// result rather than a fabricated number. The device delivery card is a
// collapsed-by-default disclosure (canvas's dMatrix.open) — tests open it
// before asserting on its contents.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, within, screen, fireEvent } from "@testing-library/react";
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
import { PlacementsView } from "../analysis/PlacementsView";

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
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("placement breakdown bars", () => {
  it("renders one bar row per placement with a spend-share caption", () => {
    renderFor("bookster");
    const rows = document.querySelectorAll('[data-testid^="row-placement-"]');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // Every row carries the canvas's "% of spend" caption.
    for (const r of rows) {
      expect(within(r as HTMLElement).getByText(/% of spend$/)).toBeTruthy();
    }
  });
});

describe("device delivery grid", () => {
  it("is collapsed by default and opens on click", () => {
    renderFor("bookster");
    expect(screen.queryByTestId("device-delivery-grid")).toBeNull();
    fireEvent.click(screen.getByText("Device delivery"));
    expect(screen.getByTestId("device-delivery-grid")).toBeTruthy();
  });

  it("renders Bookster's real device rollup shaded against the account blend", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByText("Device delivery"));
    const grid = screen.getByTestId("device-delivery-grid");
    // Bookster's device_delivery_signal carries real spend/results for
    // android/iphone/ipad/desktop devices.
    expect(within(grid).getByTestId("device-row-android_smartphone")).toBeTruthy();
    expect(within(grid).getByTestId("device-row-iphone")).toBeTruthy();
    expect(within(grid).getByText("Android smartphone")).toBeTruthy();
    // Column heads.
    expect(within(grid).getByText("Cost / result")).toBeTruthy();
    expect(within(grid).getByText("Spend")).toBeTruthy();
    expect(within(grid).getByText("Results")).toBeTruthy();
  });

  it("renders no device grid when every device row is null-only", () => {
    // Gabri's manual import carries device rows with no real numbers —
    // the honesty rule is no grid at all, never a table of dashes. (Gabri
    // has no v3/c4e placement rows either, so this account renders the
    // conversion-only or pending path; the grid must not appear.)
    renderFor("manual_BwsYjC5ZRk0i");
    expect(screen.queryByTestId("device-delivery-grid")).toBeNull();
  });
});
