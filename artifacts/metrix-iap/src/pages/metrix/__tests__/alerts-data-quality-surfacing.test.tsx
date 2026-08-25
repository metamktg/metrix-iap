// ─── Listen · Alerts surfaces data_quality flags (BUG-32) ──────────────
//
// ListenCommandCenter documents the Alerts lineage as iap.data_quality[],
// but AlertsView rendered only data_caveat. Every analysis-run quality
// finding — including cross_export_mismatch, the cross-export integrity
// trigger — reached the Ad Performance signal tiers and nowhere else, so
// the page a user opens to see what needs attention showed none of them and
// the "Active alerts" count excluded them.
//
// These tests were written after the fix shipped: the surfaces changed in
// that pass had no component-level coverage at all, which is how a wiring
// regression here would go unnoticed. Expectations are derived from the
// checked-in fixture so a refreshed fixture cannot silently invalidate them.

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
  useMetrixIsRefetching: () => false,
  MetrixDataProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AlertsView } from "../listen/AlertsView";

const SESSION_KEY = "metrix_active_account_v1";

function selectAccount(id: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "ad_account", adAccountId: id }));
}

function renderAlerts() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AlertsView />
          </DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

type Acct = {
  id: string;
  iap?: {
    data_quality?: { kind: string }[];
    core_reanalysis_read?: { data_caveat?: string };
    campaign_summary?: { data_caveat?: string };
    listen?: { signal_cards?: { impact?: string }[] };
  };
};
const accounts = seed.ad_accounts as Acct[];
const bookster = accounts.find((a) => a.id === "bookster")!;
const FLAGS = bookster.iap?.data_quality ?? [];

// Precondition: without flags in the fixture these tests prove nothing.
if (FLAGS.length === 0) {
  throw new Error(
    "Fixture precondition failed: bookster must carry iap.data_quality flags for " +
      "the Alerts surfacing test to be meaningful."
  );
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("AlertsView – data_quality surfacing", () => {
  it("renders a Data-quality findings section when the account has flags", () => {
    selectAccount("bookster");
    renderAlerts();
    expect(screen.getByText("Data-quality findings")).toBeTruthy();
  });

  it("attributes the findings to iap.data_quality, matching the documented lineage", () => {
    selectAccount("bookster");
    const { container } = renderAlerts();
    expect(container.textContent).toContain("iap.data_quality");
  });

  it("counts the flags into the alert totals rather than showing them uncounted", () => {
    selectAccount("bookster");
    const { container } = renderAlerts();
    const caveats =
      (bookster.iap?.core_reanalysis_read?.data_caveat ? 1 : 0) +
      (bookster.iap?.campaign_summary?.data_caveat ? 1 : 0);
    // The "Data caveats" tile counts caveats + quality flags.
    expect(container.textContent).toContain(String(caveats + FLAGS.length));
  });

  it("points at Ad Performance for the full per-finding evidence", () => {
    selectAccount("bookster");
    const { container } = renderAlerts();
    expect(container.textContent).toContain("Ad Performance");
  });

  it("stays honestly empty for an account with no flags and no caveats", () => {
    const clean = accounts.find(
      (a) =>
        (a.iap?.data_quality ?? []).length === 0 &&
        !a.iap?.core_reanalysis_read?.data_caveat &&
        !a.iap?.campaign_summary?.data_caveat &&
        (a.iap?.listen?.signal_cards ?? []).every((s) => s.impact !== "high")
    );
    if (!clean) return; // no such account in the fixture; nothing to assert
    selectAccount(clean.id);
    const { container } = renderAlerts();
    expect(container.textContent).not.toContain("Data-quality findings");
  });
});
