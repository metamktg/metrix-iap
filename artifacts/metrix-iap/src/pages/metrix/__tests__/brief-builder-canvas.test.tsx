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
  // EVERY expectation below is DERIVED from the fixture at run time.
  //
  // The first version hardcoded the day it was written: 4 briefs, ids like
  // BOOK0-B001, the exact hook sentence, "CPA <= $7.00". Then the agency
  // generated briefs in-app; per the architecture, generated rows fully
  // replace imported rows, so the refreshed fixture carries 16 GEN_BRIEF_*
  // entries with different copy — and all four tests failed with the view
  // behaving correctly. The claim under test is "the workspace renders the
  // BRIEF'S OWN document, never invented boilerplate", and the only way to
  // assert that durably is to read the same document the view reads.
  const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster")!;
  const briefs = bookster.iap.brief_builder.draft_briefs;
  const first = briefs[0]!;
  const second = briefs[1]!;

  it("renders every draft brief in the list and selects the first by default", () => {
    expect(briefs.length).toBeGreaterThan(1); // the suite needs real data to mean anything
    renderFor("bookster");
    const list = screen.getByTestId("brief-list");
    expect(within(list).getAllByRole("button")).toHaveLength(briefs.length);
    expect(within(list).getByText(`${briefs.length} briefs · draft_briefs`)).toBeTruthy();
    expect(
      within(list).getByTestId(`brief-list-item-${first.id}`).getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.getByTestId("brief-detail")).toBeTruthy();
  });

  it("shows the why-panel and hook from the brief's real document", () => {
    renderFor("bookster");
    const detail = screen.getByTestId("brief-detail");
    expect(within(detail).getByText("Why this brief exists")).toBeTruthy();
    const hook = first.full_brief?.copy_architecture?.hook;
    expect(typeof hook).toBe("string"); // a first brief with no hook would make this test vacuous
    expect(within(detail).getByText(hook)).toBeTruthy();
  });

  it("opens the production fold with the brief's own stack and criteria, never invented boilerplate", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByTestId("brief-production-fold"));
    const detail = screen.getByTestId("brief-detail");

    const stack = first.full_brief?.strategic_foundation?.angle_stack;
    expect(typeof stack).toBe("string");
    expect(within(detail).getByText(stack)).toBeTruthy();

    const criteria = first.full_brief?.testing_framework?.success_criteria;
    expect(typeof criteria).toBe("string");
    expect(within(detail).getByText(criteria)).toBeTruthy();

    // The honesty rule survives every data refresh: a checklist renders
    // only when the document carries one, and the app NEVER pads it with
    // invented items.
    const checklist: string[] = first.full_brief?.production_checklist ?? [];
    if (checklist.length > 0) {
      expect(within(detail).getByText(checklist[0]!)).toBeTruthy();
    } else {
      expect(within(detail).queryByText("Production checklist")).toBeNull();
    }
    expect(
      within(detail).queryByText("Talent brief: who's on camera and why they fit the avatar"),
    ).toBeNull();
  });

  it("switches the workspace when another brief is selected", () => {
    renderFor("bookster");
    fireEvent.click(screen.getByTestId(`brief-list-item-${second.id}`));
    const list = screen.getByTestId("brief-list");
    expect(
      within(list).getByTestId(`brief-list-item-${second.id}`).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      within(list).getByTestId(`brief-list-item-${first.id}`).getAttribute("aria-current"),
    ).toBeNull();
    // The detail pane follows: if the two briefs carry different hooks, the
    // second's hook is now the one on screen.
    const h1 = first.full_brief?.copy_architecture?.hook;
    const h2 = second.full_brief?.copy_architecture?.hook;
    if (h2 && h2 !== h1) {
      expect(within(screen.getByTestId("brief-detail")).getByText(h2)).toBeTruthy();
    }
  });
});
