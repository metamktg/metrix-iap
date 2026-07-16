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

  it("Analysis and Strategy land on their Overview page (Overview is the parent route, not a child subtab)", () => {
    const analysis = navTree.find((s) => s.id === "analysis")!;
    const strategy = navTree.find((s) => s.id === "strategy")!;
    expect(sectionLandingRoute(analysis)).toBe("/app/analysis/overview");
    expect(sectionLandingRoute(strategy)).toBe("/app/strategy/overview");
    // Overview is the section's primary parent route, not a nested subtab.
    expect(analysis.children?.some((c) => c.id === "analysis-overview")).toBe(false);
    expect(strategy.children?.some((c) => c.id === "strategy-overview")).toBe(false);
  });

  it("sections without an Overview child land on their first child", () => {
    const listen = navTree.find((s) => s.id === "listen")!;
    expect(sectionLandingRoute(listen)).toBe(listen.children![0].to);
  });
});

describe("Sidebar section headers", () => {
  it("clicking a header navigates to the landing route and expands children", () => {
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");

    // Analysis children hidden initially (not on an analysis route)
    expect(isExpanded(within(nav).getByLabelText("Analysis pages"))).toBe(false);

    fireEvent.click(within(nav).getByText("Analysis"));
    expect(window.location.pathname).toBe("/app/analysis/overview");
    const childList = within(nav).getByLabelText("Analysis pages");
    expect(isExpanded(childList)).toBe(true);
    // Expanded children show the real subpages; Overview is the section header
    // (parent route), not a child subtab — so it does not appear in the list.
    expect(within(childList).getByText("IAP Library")).toBeTruthy();
    expect(within(childList).queryByText("Overview")).toBeNull();
  });

  it("a section without an Overview child navigates to its first child", () => {
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(within(nav).getByText("Listen"));
    expect(window.location.pathname).toBe("/app/listen/alerts");
    const childList = within(nav).getByLabelText("Listen pages");
    expect(isExpanded(childList)).toBe(true);
    expect(within(childList).getByText("Signal")).toBeTruthy();
  });

  it("the chevron toggles expansion without navigating", () => {
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");
    const toggle = within(nav).getByLabelText("Expand Strategy section");
    fireEvent.click(toggle);
    expect(window.location.pathname).toBe("/");
    expect(isExpanded(within(nav).getByLabelText("Strategy pages"))).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(isExpanded(within(nav).getByLabelText("Strategy pages"))).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("header link carries aria-current when its landing page is active", () => {
    window.history.replaceState({}, "", "/app/analysis/overview");
    renderWithProviders(<Sidebar />);
    const nav = screen.getByLabelText("Main workspace navigation");
    const header = within(nav).getByText("Analysis").closest("a")!;
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
