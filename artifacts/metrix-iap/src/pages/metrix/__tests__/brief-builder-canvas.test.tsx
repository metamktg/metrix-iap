// ─── Brief Builder — canvas master-detail composition ─────────────────
// The Nocturne creative.briefs screen: the brief list on the left, the
// selected brief's workspace on the right. Honesty rules under test:
// every detail field reads from the brief's own full_brief document
// (hook, variable stack, success criteria, the brief's real production
// checklist — never a boilerplate one), and selection falls back to the
// first brief instead of a dead picker state.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
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
import { CreativeBriefBuilderView } from "../creative/CreativeBriefBuilderView";

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
            <CreativeBriefBuilderView />
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
  window.history.replaceState({}, "", "/app/creative/builder");
});

describe("brief builder master-detail (Bookster)", () => {
  it("renders all 4 briefs in the list and selects the first by default", () => {
    renderFor("bookster");
    const list = screen.getByTestId("brief-list");
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    // First brief (BOOK0-B001) selected: its id shows as the detail kicker.
    const detail = screen.getByTestId("brief-detail");
    expect(within(detail).getByText(/BOOK0-B001/)).toBeTruthy();
    expect(within(list).getByTestId("brief-list-item-BOOK0-B001").getAttribute("aria-current")).toBe("true");
  });

  it("shows the why-panel and hook from the brief's real document", () => {
    renderFor("bookster");
    const detail = screen.getByTestId("brief-detail");
    expect(within(detail).getByText("Why this brief exists")).toBeTruthy();
    // BOOK0-B001's real evidence line and copy_architecture hook.
    expect(within(detail).getByText(/best CPA\/CVR combination/)).toBeTruthy();
    expect(within(detail).getByText("Hook")).toBeTruthy();
    expect(within(detail).getByText(/Time-scarcity permission opener/)).toBeTruthy();
  });

  it("opens the production fold with the real stack, criteria, and checklist", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByTestId("brief-production-fold"));
    const detail = screen.getByTestId("brief-detail");
    // strategic_foundation.angle_stack, testing_framework fields, and the
    // brief's own production_checklist — no invented boilerplate items.
    expect(within(detail).getByText("FW_BAB + TN_Rational + HK_Benefit + HP_Time + CTA_StartFree")).toBeTruthy();
    expect(within(detail).getByText(/CPA <= \$7\.00 and CVR >= 15%/)).toBeTruthy();
    expect(within(detail).getByText("HYP_001")).toBeTruthy();
    expect(within(detail).getByText("Isolated variable clearly executed")).toBeTruthy();
    expect(within(detail).queryByText("Talent brief: who's on camera and why they fit the avatar")).toBeNull();
  });

  it("switches the workspace when another brief is selected", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByTestId("brief-list-item-BOOK2-B001"));
    const detail = screen.getByTestId("brief-detail");
    expect(within(detail).getByText(/BOOK2-B001/)).toBeTruthy();
    expect(within(detail).getByText(/C2E and C4E \(Book2 extension cells\)/)).toBeTruthy();
  });
});
