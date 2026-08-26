// ─── Strategy · Avatars — the combos panel stops implying a join (C1) ──
//
// The panel used to be titled "Creative combos", described as
// "Concept × placement × platform", and rendered ONE table holding two
// disjoint row sets: concept rows carrying placement/platform "—", and
// placement rows carrying concept "—". A reader could only read that as a
// cross-tab with missing cells. No such cross-tab is computed anywhere —
// performance_by_cell has no placement dimension and placement rollups
// have the ad dimension aggregated away — so the layout asserted a
// computation the server never ran.
//
// These tests pin the honest shape: two separately-headed rankings, no
// "—" filler standing in for a dimension that was never measured, and a
// disclosure that says why they are not combined.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
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

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useListAnalysisRuns: () => ({ data: { runs: [] }, isLoading: false }),
  };
});

import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AnalysisViewProvider } from "@/contexts/AnalysisViewContext";
import { AvatarsView, COMBOS_DISCLOSURE } from "../strategy/AvatarsView";

const ACCOUNT_KEY = "metrix_active_account_v1";

function renderAvatars() {
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ type: "ad_account", adAccountId: "bookster" }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>
            <AnalysisViewProvider>
              <AvatarsView />
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

describe("AvatarsView combos panel — no implied cross-tab (C1)", () => {
  it("no longer promises a concept × placement × platform join", () => {
    renderAvatars();
    expect(screen.queryByText("Creative combos")).toBeNull();
    // The old desc is rendered through InfoTooltip content, so assert on
    // the tooltip payload rather than visible text.
    expect(document.body.innerHTML).not.toContain("Concept × placement × platform");
  });

  it("heads the two rankings separately instead of merging them into one table", () => {
    renderAvatars();
    expect(screen.getByText("Top performers by dimension")).toBeTruthy();
    expect(screen.getByText("By concept")).toBeTruthy();
    expect(screen.getByText("By placement")).toBeTruthy();
  });

  it("gives each ranking only the columns its own grain actually measures", () => {
    renderAvatars();
    const heading = screen.getByText("Top performers by dimension");
    const card = heading.closest("section");
    expect(card).toBeTruthy();
    const tables = within(card as HTMLElement).getAllByRole("table");
    expect(tables.length).toBe(2);
    for (const t of tables) {
      const headers = within(t).getAllByRole("columnheader").map((h) => h.textContent?.trim());
      // The unit column differs per table; the measured columns are shared.
      expect(headers).toContain("Spend");
      expect(headers).toContain("CPA");
      // Neither table carries the other's dimension as a filler column.
      const unit = headers[0];
      expect(unit === "Concept" || unit === "Placement").toBe(true);
      if (unit === "Concept") expect(headers).not.toContain("Placement");
      if (unit === "Placement") expect(headers).not.toContain("Concept");
    }
  });

  it("discloses why the two dimensions are never combined", () => {
    // The reason is disclosure content (SectionCard renders desc through an
    // InfoTooltip, so it isn't in the DOM until hover). Pin the words
    // themselves, and separately pin that a disclosure affordance is wired
    // into the card at all.
    expect(COMBOS_DISCLOSURE).toContain("not a cross-tab");
    expect(COMBOS_DISCLOSURE).toContain("never combined");

    renderAvatars();
    const card = screen.getByText("Top performers by dimension").closest("section");
    expect(within(card as HTMLElement).getAllByLabelText("More info").length).toBeGreaterThan(0);
  });
});
