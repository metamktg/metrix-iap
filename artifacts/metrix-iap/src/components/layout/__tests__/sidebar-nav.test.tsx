// ─── Sidebar navigation + inline account picker regression tests ──────
// Verifies the one-click section-header navigation (navigate to landing
// route AND expand children), the separate chevron collapse affordance,
// removal of redundant Overview child links, and the inline ad account
// picker that populates account-scoped pages in place.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
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
import { Sidebar } from "../Sidebar";
import { AnalysisOverview } from "@/pages/metrix/analysis/AnalysisOverview";
import { navTree, sectionLandingRoute } from "@/navigation/navTree";

const SESSION_KEY = "metrix_active_account_v1";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AccountProvider>
          <DateRangeProvider>{ui}</DateRangeProvider>
        </AccountProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** The child <ul> is toggled between "block" and "hidden" utility classes. */
function isExpanded(listEl: HTMLElement): boolean {
  return !listEl.classList.contains("hidden");
}

/** Open a Radix dropdown trigger (needs pointerdown in jsdom). */
function openDropdown(trigger: Element) {
  fireEvent.pointerDown(
    trigger,
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ctrlKey: false })
  );
  fireEvent.click(trigger);
}

beforeEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("navTree landing routes", () => {
  it("every expandable section has a landing route", () => {
    for (const section of navTree) {
      if (section.children?.length) {
        expect(sectionLandingRoute(section), section.id).toBeTruthy();
      }
    }
  });

  it("Analyze and Act land on their hub page, with the first child as the accordion item", () => {
    const analyze = navTree.find((s) => s.id === "analyze")!;
    const act = navTree.find((s) => s.id === "act")!;
    // Hub page is the landing — clicking the section header goes to the hub.
    expect(sectionLandingRoute(analyze)).toBe("/app/analyze");
    expect(sectionLandingRoute(act)).toBe("/app/act");
    // First children exist in accordion.
    expect(analyze.children?.some((c) => c.id === "analyze-findings")).toBe(true);
    expect(act.children?.some((c) => c.id === "act-queue")).toBe(true);
  });

  it("Settings lands on its first child since it has no explicit landing", () => {
    const settings = navTree.find((s) => s.id === "settings")!;
    expect(sectionLandingRoute(settings)).toBe(settings.children![0].to);
  });
});

describe("Sidebar section headers", () => {
  it("clicking a header navigates to the landing route and expands children", () => {
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");

    // Analyze children hidden initially (not on an analyze route)
    expect(isExpanded(within(nav).getByLabelText("Analyze pages"))).toBe(false);

    fireEvent.click(within(nav).getByText("Analyze"));
    expect(window.location.pathname).toBe("/app/analyze");
    const childList = within(nav).getByLabelText("Analyze pages");
    expect(isExpanded(childList)).toBe(true);
    // Expanded children show the Analyze sub-sections.
    expect(within(childList).getByText("Audience")).toBeTruthy();
    expect(within(childList).getByText("Placements")).toBeTruthy();
  });

  it("Settings section navigates to its first child when header clicked", () => {
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(within(nav).getByText("Settings"));
    expect(window.location.pathname).toBe("/app/settings/account");
    const childList = within(nav).getByLabelText("Settings pages");
    expect(isExpanded(childList)).toBe(true);
    expect(within(childList).getByText("Billing")).toBeTruthy();
  });

  it("the chevron toggles expansion without navigating", () => {
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");
    const toggle = within(nav).getByLabelText("Expand Act section");
    fireEvent.click(toggle);
    expect(window.location.pathname).toBe("/");
    expect(isExpanded(within(nav).getByLabelText("Act pages"))).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(isExpanded(within(nav).getByLabelText("Act pages"))).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("header link carries aria-current when its landing page is active", () => {
    window.history.replaceState({}, "", "/app/analyze");
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");
    const header = within(nav).getByText("Analyze").closest("a")!;
    expect(header.getAttribute("aria-current")).toBe("page");
  });
});

describe("Inline account picker", () => {
  it("appears in the no-account state and populates the page in place", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "manager", adAccountId: null }));
    renderWithProviders(<AnalysisOverview />);

    expect(screen.getByText("No ad account selected")).toBeTruthy();
    openDropdown(screen.getByText("Choose ad account").closest("button")!);

    const configured = seed.ad_accounts.find((a: { status: string }) => a.status === "configured");
    fireEvent.click(screen.getByText(configured.name));

    // Page populated in place — no navigation, gate is gone
    expect(window.location.pathname).toBe("/");
    expect(screen.queryByText("No ad account selected")).toBeNull();
    // Selection persisted exactly like the global switcher flow
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).toEqual({
      type: "ad_account",
      adAccountId: configured.id,
    });
    expect(new URLSearchParams(window.location.search).get("account")).toBe(configured.id);
  });

  it("offers other accounts from the unconfigured state", () => {
    const unconfigured = seed.ad_accounts.find((a: { status: string }) => a.status !== "configured");
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ type: "ad_account", adAccountId: unconfigured.id })
    );
    renderWithProviders(<AnalysisOverview />);

    openDropdown(screen.getByText("Switch ad account").closest("button")!);
    // The currently selected unconfigured account is excluded from the list
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText(unconfigured.name)).toBeNull();

    const configured = seed.ad_accounts.find((a: { status: string }) => a.status === "configured");
    fireEvent.click(within(menu).getByText(configured.name));
    expect(screen.queryByText("Switch ad account")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).adAccountId).toBe(configured.id);
  });
});
