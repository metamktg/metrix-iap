// ─── Sidebar navigation + inline account picker regression tests ──────
// Covers: navTree data integrity, expanded-mode section navigation,
// chevron collapse affordance, collapsed-mode icon rail + hover flyout,
// and the inline ad account picker.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, within, act } from "@testing-library/react";
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
import { AdPerformanceView } from "@/pages/metrix/analysis/AdPerformanceView";
import { navTree, sectionLandingRoute } from "@/navigation/navTree";

const SESSION_KEY = "metrix_active_account_v1";
const SIDEBAR_KEY = "metrix_sidebar_collapsed";

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

/** Render sidebar in expanded state (default on fresh load). */
function renderExpanded() {
  localStorage.removeItem(SIDEBAR_KEY);
  return renderWithProviders(<Sidebar />);
}

/** Render sidebar already in collapsed/icon-only state. */
function renderCollapsed() {
  localStorage.setItem(SIDEBAR_KEY, "1");
  return renderWithProviders(<Sidebar />);
}

/**
 * The child list is now animated via a CSS grid wrapper (0fr → 1fr).
 * The wrapper carries aria-hidden="true" when collapsed.
 */
function isExpanded(listEl: HTMLElement): boolean {
  const wrapper = listEl.parentElement;
  return wrapper?.getAttribute("aria-hidden") !== "true";
}

/**
 * A section header's label text can collide with a child label elsewhere
 * in the tree. Section headers render outside any <ul>; child rows always
 * render inside their section's <ul aria-label="... pages">. Scope to the
 * header specifically rather than the first text match.
 */
function sectionHeaderLink(container: HTMLElement, label: string): HTMLElement {
  const matches = within(container).getAllByText(label);
  const header = matches.find((el) => !el.closest("ul"));
  if (!header) throw new Error(`No section header found for "${label}"`);
  return header.closest("a")!;
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
  localStorage.removeItem(SIDEBAR_KEY);
  window.history.replaceState({}, "", "/");
});

// ─── navTree data integrity ────────────────────────────────────────────

describe("navTree landing routes", () => {
  it("every expandable section has a landing route", () => {
    for (const section of navTree) {
      if (section.children?.length) {
        expect(sectionLandingRoute(section), section.id).toBeTruthy();
      }
    }
  });

  it("every expandable section lands on its own command-center route (explicit landing, not a child fallback)", () => {
    for (const section of navTree) {
      if (!section.children?.length) continue;
      expect(section.landing, section.id).toBeTruthy();
      expect(sectionLandingRoute(section)).toBe(section.landing);
    }
  });

  it("Analysis has no Overview child (renamed Ad Performance); Strategy keeps a distinct Overview child", () => {
    const analysis = navTree.find((s) => s.id === "analysis")!;
    const strategy = navTree.find((s) => s.id === "strategy")!;
    expect(sectionLandingRoute(analysis)).toBe("/app/analysis");
    expect(analysis.children!.map((c) => c.label)).not.toContain("Overview");
    expect(analysis.children!.map((c) => c.label)).toContain("Ad Performance");
    expect(sectionLandingRoute(strategy)).toBe("/app/strategy");
    expect(strategy.children!.map((c) => c.label)).toContain("Overview");
  });

  it("sectionLandingRoute falls back to the first child's route when a section sets no explicit landing", () => {
    const synthetic = {
      id: "x",
      number: "00",
      label: "X",
      icon: "LayoutDashboard" as const,
      children: [{ id: "x-a", label: "A", to: "/app/x/a" }],
    };
    expect(sectionLandingRoute(synthetic)).toBe("/app/x/a");
  });
});

// ─── Expanded sidebar (default on load) ───────────────────────────────

describe("Sidebar section headers (expanded mode)", () => {
  it("sidebar is expanded by default — shows section labels and collapse button", () => {
    renderExpanded();
    const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
    // Expanded width class
    expect(sidebar.classList.contains("w-[216px]")).toBe(true);
    // Prominent collapse button is visible
    expect(screen.getByLabelText("Collapse sidebar")).toBeTruthy();
  });

  it("clicking a header navigates to its command center and expands children", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");

    // Analysis children hidden initially (not on an analysis route)
    expect(isExpanded(within(nav).getByLabelText("Analysis pages"))).toBe(false);

    fireEvent.click(sectionHeaderLink(nav, "Analysis"));
    expect(window.location.pathname).toBe("/app/analysis");
    const childList = within(nav).getByLabelText("Analysis pages");
    expect(isExpanded(childList)).toBe(true);
    // Expanded children include the real subpages, but no "Overview" child
    expect(within(childList).getByText("IAP Library")).toBeTruthy();
    expect(within(childList).getByText("Ad Performance")).toBeTruthy();
    expect(within(childList).queryByText("Overview")).toBeNull();
  });

  it("clicking Listen navigates to its command center (TL;DR), not a child", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(within(nav).getByText("Listen"));
    expect(window.location.pathname).toBe("/app/listen");
    const childList = within(nav).getByLabelText("Listen pages");
    expect(isExpanded(childList)).toBe(true);
    expect(within(childList).getByText("Signal")).toBeTruthy();
  });

  it("the chevron toggles expansion without navigating", () => {
    renderExpanded();
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

  it("header link carries aria-current when its command center is active", () => {
    window.history.replaceState({}, "", "/app/analysis");
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    const header = sectionHeaderLink(nav, "Analysis");
    expect(header.getAttribute("aria-current")).toBe("page");
  });

  it("header link also carries aria-current from a child route (prefix match)", () => {
    window.history.replaceState({}, "", "/app/analysis/performance");
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    const header = sectionHeaderLink(nav, "Analysis");
    expect(header.getAttribute("aria-current")).toBe("page");
  });
});

// ─── Expand / Collapse toggle ──────────────────────────────────────────

describe("Sidebar expand/collapse toggle", () => {
  it("collapse button collapses to 56px icon rail", () => {
    renderExpanded();
    const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
    expect(sidebar.classList.contains("w-[216px]")).toBe(true);

    fireEvent.click(screen.getByLabelText("Collapse sidebar"));

    expect(sidebar.classList.contains("w-[56px]")).toBe(true);
    expect(screen.getByLabelText("Expand sidebar")).toBeTruthy();
  });

  it("expand button restores the full sidebar", () => {
    renderCollapsed();
    const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
    expect(sidebar.classList.contains("w-[56px]")).toBe(true);

    fireEvent.click(screen.getByLabelText("Expand sidebar"));

    expect(sidebar.classList.contains("w-[216px]")).toBe(true);
    expect(screen.getByLabelText("Collapse sidebar")).toBeTruthy();
  });

  it("persists collapsed state to localStorage", () => {
    renderExpanded();
    fireEvent.click(screen.getByLabelText("Collapse sidebar"));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("1");
  });
});

// ─── Collapsed icon rail + hover flyout ───────────────────────────────

describe("Sidebar hover flyout (collapsed mode)", () => {
  it("renders icon buttons for every visible navTree section when collapsed", () => {
    renderCollapsed();
    for (const section of navTree) {
      expect(screen.getByLabelText(section.label)).toBeTruthy();
    }
  });

  it("hovering an icon with children reveals the flyout panel with child links", () => {
    renderCollapsed();
    const nav = screen.getByLabelText("Main workspace navigation");
    const analysisIcon = within(nav).getByLabelText("Analysis");

    fireEvent.mouseEnter(analysisIcon.closest("li")!);

    expect(screen.getByRole("dialog", { name: "Analysis pages" })).toBeTruthy();
    expect(screen.getByText("Ad Performance")).toBeTruthy();
    expect(screen.getByText("IAP Library")).toBeTruthy();
    // No "Overview" child in Analysis
    const flyout = screen.getByRole("dialog", { name: "Analysis pages" });
    expect(within(flyout).queryByText("Overview")).toBeNull();
  });

  it("child links in the flyout navigate on click", () => {
    renderCollapsed();
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.mouseEnter(within(nav).getByLabelText("Analysis").closest("li")!);

    fireEvent.click(screen.getByText("Ad Performance").closest("a")!);
    expect(window.location.pathname).toBe("/app/analysis/performance");
  });

  it("flyout closes after the mouse leaves the icon row", () => {
    vi.useFakeTimers();
    try {
      renderCollapsed();
      const nav = screen.getByLabelText("Main workspace navigation");
      const li = within(nav).getByLabelText("Analysis").closest("li")!;

      act(() => { fireEvent.mouseEnter(li); });
      expect(screen.getByRole("dialog", { name: "Analysis pages" })).toBeTruthy();

      act(() => {
        fireEvent.mouseLeave(li);
        vi.advanceTimersByTime(200);
      });

      expect(screen.queryByRole("dialog", { name: "Analysis pages" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hovering Listen section shows its child links in the flyout", () => {
    renderCollapsed();
    const listenIcon = screen.getByLabelText("Listen");
    fireEvent.mouseEnter(listenIcon.closest("li")!);

    const flyout = screen.getByRole("dialog", { name: "Listen pages" });
    expect(within(flyout).getByText("Signal")).toBeTruthy();
    expect(within(flyout).getByText("Alerts")).toBeTruthy();
  });

  it("flyout child with an active route carries aria-current", () => {
    window.history.replaceState({}, "", "/app/analysis/performance");
    renderCollapsed();
    const analysisIcon = screen.getByLabelText("Analysis");
    fireEvent.mouseEnter(analysisIcon.closest("li")!);

    const flyout = screen.getByRole("dialog", { name: "Analysis pages" });
    const adPerfLink = within(flyout).getByText("Ad Performance").closest("a")!;
    expect(adPerfLink.getAttribute("aria-current")).toBe("page");
  });

  it("section icon carries aria-current when section route is active", () => {
    window.history.replaceState({}, "", "/app/analysis");
    renderCollapsed();
    expect(screen.getByLabelText("Analysis").getAttribute("aria-current")).toBe("page");
  });

  it("flyout marks Soon pill for placeholder children", () => {
    renderCollapsed();
    const actionIcon = screen.getByLabelText("Action");
    fireEvent.mouseEnter(actionIcon.closest("li")!);

    const flyout = screen.getByRole("dialog", { name: "Action pages" });
    expect(within(flyout).getByText("Soon")).toBeTruthy();
  });
});

// ─── Inline account picker ────────────────────────────────────────────

describe("Inline account picker", () => {
  it("appears in the no-account state and populates the page in place", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "manager", adAccountId: null }));
    renderWithProviders(<AdPerformanceView />);

    expect(screen.getByText("No ad account selected")).toBeTruthy();
    openDropdown(screen.getByText("Choose ad account").closest("button")!);

    const configured = seed.ad_accounts.find((a: { status: string }) => a.status === "configured");
    fireEvent.click(screen.getByText(configured.name));

    expect(window.location.pathname).toBe("/");
    expect(screen.queryByText("No ad account selected")).toBeNull();
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
    renderWithProviders(<AdPerformanceView />);

    openDropdown(screen.getByText("Switch ad account").closest("button")!);
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText(unconfigured.name)).toBeNull();

    const configured = seed.ad_accounts.find((a: { status: string }) => a.status === "configured");
    fireEvent.click(within(menu).getByText(configured.name));
    expect(screen.queryByText("Switch ad account")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).adAccountId).toBe(configured.id);
  });
});
