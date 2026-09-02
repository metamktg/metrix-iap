// ─── Sidebar navigation + inline account picker regression tests ──────
// Covers: navTree data integrity, expanded-mode section link + chevron
// disclosure (accordion), collapsed-mode icon rail
// (click reopens the full rail on that section — no hover flyout, per the
// Metrix v1 design handoff), and the inline ad account picker.

import { withUnconfiguredAccount } from "@/test-fixtures/unconfigured";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One account is guaranteed unconfigured — the test below FINDS an
// unconfigured account, and a fixture refresh can leave the demo DB with
// none at all.
const seed = withUnconfiguredAccount(JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../test-fixtures/metrix_seed_bundle.json"
    ),
    "utf-8"
  )
));

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
 * header specifically rather than the first text match. An expanded-mode
 * section header is a LINK to the command center beside a chevron BUTTON
 * that toggles the child list — two controls, one job each.
 */
function sectionHeaderLink(container: HTMLElement, label: string): HTMLElement {
  const matches = within(container).getAllByText(label);
  const header = matches.find((el) => !el.closest("ul"));
  if (!header) throw new Error(`No section header found for "${label}"`);
  return header.closest("a")!;
}

function sectionToggle(container: HTMLElement, label: string): HTMLElement {
  return (
    within(container).queryByLabelText(`Expand ${label} pages`) ??
    within(container).getByLabelText(`Collapse ${label} pages`)
  );
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
  localStorage.clear();
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

  // REVISED 2026-08-29, deliberately. This previously asserted Analysis has
  // NO Overview child, on the premise that Overview had been "renamed Ad
  // Performance". That premise was about a LABEL: the child pointing at
  // /app/analysis/performance used to be mislabeled "Overview" and was
  // correctly renamed. It said nothing about /app/analysis/overview, which
  // is a DIFFERENT route rendering a DIFFERENT component (AnalysisOverview:
  // period selector, daily trend, variable performance, top placements —
  // not AdPerformanceView).
  //
  // That route had no menu entry while being the first tab of the analysis
  // tab rail and the target of five cross-links ("Review analysis" from
  // Signals, Alerts, Recommendations, the loop chain, and the account
  // overview). Following any of them landed the reader on a page they could
  // not reach again on purpose or navigate back to — the dead end the owner
  // hit and reported. The section landing stays the command center, which is
  // where you RUN an analysis; Overview is where you READ one.
  it("Analysis exposes both its command center (landing) and the Overview read view", () => {
    const analysis = navTree.find((s) => s.id === "analysis")!;
    const strategy = navTree.find((s) => s.id === "strategy")!;
    expect(sectionLandingRoute(analysis)).toBe("/app/analysis");
    const labels = analysis.children!.map((c) => c.label);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Ad Performance");
    // The two are distinct destinations, never the same route under two names.
    const overview = analysis.children!.find((c) => c.label === "Overview")!;
    const performance = analysis.children!.find((c) => c.label === "Ad Performance")!;
    expect(overview.to).toBe("/app/analysis/overview");
    expect(performance.to).toBe("/app/analysis/performance");
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

  it("clicking a section label navigates to its command center and opens its pages", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    expect(isExpanded(within(nav).getByLabelText("Analysis pages"))).toBe(false);

    fireEvent.click(sectionHeaderLink(nav, "Analysis"));

    expect(window.location.pathname).toBe("/app/analysis");
    const childList = within(nav).getByLabelText("Analysis pages");
    expect(isExpanded(childList)).toBe(true);
    expect(within(childList).getByText("IAP Library")).toBeTruthy();
    expect(within(childList).getByText("Ad Performance")).toBeTruthy();
    expect(within(childList).getByText("Overview")).toBeTruthy();
  });

  it("the section label is a real link with the command center as its href", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    for (const section of navTree.filter((s) => s.children?.length)) {
      expect(sectionHeaderLink(nav, section.label).getAttribute("href")).toBe(sectionLandingRoute(section));
    }
  });

  it("the chevron toggles the child list without navigating", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    expect(isExpanded(within(nav).getByLabelText("Analysis pages"))).toBe(false);

    fireEvent.click(sectionToggle(nav, "Analysis"));
    expect(window.location.pathname).toBe("/");
    expect(isExpanded(within(nav).getByLabelText("Analysis pages"))).toBe(true);

    fireEvent.click(sectionToggle(nav, "Analysis"));
    expect(isExpanded(within(nav).getByLabelText("Analysis pages"))).toBe(false);
  });

  it("clicking Listen's label navigates to its command center (TL;DR), not a child", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(sectionHeaderLink(nav, "Listen"));
    expect(window.location.pathname).toBe("/app/listen");
    const childList = within(nav).getByLabelText("Listen pages");
    expect(isExpanded(childList)).toBe(true);
    expect(within(childList).getByText("Signal")).toBeTruthy();
  });

  it("the chevron's aria-expanded reflects open/closed state, and a closed list is inert", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");

    fireEvent.click(sectionToggle(nav, "Strategy"));
    const list = within(nav).getByLabelText("Strategy pages");
    expect(isExpanded(list)).toBe(true);
    expect(sectionToggle(nav, "Strategy").getAttribute("aria-expanded")).toBe("true");
    expect(list.parentElement!.hasAttribute("inert")).toBe(false);

    fireEvent.click(sectionToggle(nav, "Strategy"));
    expect(isExpanded(list)).toBe(false);
    expect(sectionToggle(nav, "Strategy").getAttribute("aria-expanded")).toBe("false");
    // Out of the tab order as well as out of sight.
    expect(list.parentElement!.hasAttribute("inert")).toBe(true);
  });

  it("hidden nav children (funnel, findings) render no menu row", () => {
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(sectionToggle(nav, "Analysis"));
    const childList = within(nav).getByLabelText("Analysis pages");
    expect(within(childList).queryByText("Engagement Funnel")).toBeNull();
    expect(within(childList).queryByText("Findings")).toBeNull();
  });

  it("section link carries aria-current when its command center is active", () => {
    window.history.replaceState({}, "", "/app/analysis");
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    expect(sectionHeaderLink(nav, "Analysis").getAttribute("aria-current")).toBe("page");
  });

  it("section link also carries aria-current from a child route (prefix match)", () => {
    window.history.replaceState({}, "", "/app/analysis/performance");
    renderExpanded();
    const nav = screen.getByLabelText("Main workspace navigation");
    expect(sectionHeaderLink(nav, "Analysis").getAttribute("aria-current")).toBe("page");
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

// ─── Collapsed icon rail ────────────────────────────────────────────────
// Metrix v1 design handoff: no flyout/hover behavior on the collapsed rail
// ("tried and removed for being unreliable on a scrolling rail"). Clicking
// an expandable section's icon reopens the full rail on that section.

describe("Sidebar collapsed icon rail", () => {
  it("renders icon buttons for every visible navTree section when collapsed", () => {
    renderCollapsed();
    for (const section of navTree) {
      expect(screen.getByLabelText(section.label)).toBeTruthy();
    }
  });

  it("clicking an icon with children reopens the full rail on that section", () => {
    renderCollapsed();
    const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
    expect(sidebar.classList.contains("w-[56px]")).toBe(true);

    fireEvent.click(within(screen.getByLabelText("Main workspace navigation")).getByLabelText("Analysis"));

    expect(sidebar.classList.contains("w-[216px]")).toBe(true);
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("0");
    // The now-expanded rail shows Analysis's children, already open.
    const expandedNav = screen.getByLabelText("Main workspace navigation");
    const childList = within(expandedNav).getByLabelText("Analysis pages");
    expect(isExpanded(childList)).toBe(true);
    expect(within(childList).getByText("Ad Performance")).toBeTruthy();
    expect(within(childList).getByText("IAP Library")).toBeTruthy();
    // Overview is a real child now — see the navTree test above for why.
    expect(within(childList).getByText("Overview")).toBeTruthy();
    // No click yet navigated away from the reopen action itself.
    expect(window.location.pathname).toBe("/");
  });

  it("reopening the rail on a different section closes the previously-open one (accordion)", () => {
    renderCollapsed();
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(within(nav).getByLabelText("Analysis"));

    const expandedNav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(sectionToggle(expandedNav, "Listen"));

    const listenList = within(expandedNav).getByLabelText("Listen pages");
    const analysisList = within(expandedNav).getByLabelText("Analysis pages");
    expect(isExpanded(listenList)).toBe(true);
    expect(isExpanded(analysisList)).toBe(false);
  });

  it("child links, once the rail is reopened, navigate on click", () => {
    renderCollapsed();
    const nav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(within(nav).getByLabelText("Analysis"));

    const expandedNav = screen.getByLabelText("Main workspace navigation");
    fireEvent.click(within(expandedNav).getByText("Ad Performance").closest("a")!);
    expect(window.location.pathname).toBe("/app/analysis/performance");
  });

  it("reopening the rail on Listen shows its children", () => {
    renderCollapsed();
    const listenIcon = screen.getByLabelText("Listen");
    fireEvent.click(listenIcon);

    const nav = screen.getByLabelText("Main workspace navigation");
    const childList = within(nav).getByLabelText("Listen pages");
    expect(isExpanded(childList)).toBe(true);
    expect(within(childList).getByText("Signal")).toBeTruthy();
    expect(within(childList).getByText("Alerts")).toBeTruthy();
  });

  it("section icon carries aria-current when section route is active", () => {
    window.history.replaceState({}, "", "/app/analysis");
    renderCollapsed();
    expect(screen.getByLabelText("Analysis").getAttribute("aria-current")).toBe("page");
  });

  it("reopening the rail on Action shows the real queue and the Soon pill for the agent", () => {
    renderCollapsed();
    const actionIcon = screen.getByLabelText("Action");
    fireEvent.click(actionIcon);

    const nav = screen.getByLabelText("Main workspace navigation");
    const childList = within(nav).getByLabelText("Action pages");
    expect(within(childList).getByText("Action Queue")).toBeTruthy();
    expect(within(childList).getByText("Soon")).toBeTruthy();
  });
});

// ─── Inline account picker ────────────────────────────────────────────

describe("Inline account picker", () => {
  it("appears in the no-account state and populates the page in place", () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ type: "manager", adAccountId: null }));
    renderWithProviders(<AdPerformanceView />);

    expect(screen.getByText("No ad account selected")).toBeTruthy();
    openDropdown(screen.getByText("Choose ad account").closest("button")!);

    const configured = seed.ad_accounts.find((a: { status: string }) => a.status === "configured")!;
    fireEvent.click(screen.getByText(configured.name));

    expect(window.location.pathname).toBe("/");
    expect(screen.queryByText("No ad account selected")).toBeNull();
    // Persistence now writes to localStorage (survives new tabs); sessionStorage
    // is only a read fallback for pre-migration sessions.
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({
      type: "ad_account",
      adAccountId: configured.id,
    });
    expect(new URLSearchParams(window.location.search).get("account")).toBe(configured.id);
  });

  it("offers other accounts from the unconfigured state", () => {
    // Guaranteed by withUnconfiguredAccount — the fixture alone no longer is.
    const unconfigured = seed.ad_accounts.find((a: { status: string }) => a.status !== "configured")!;
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ type: "ad_account", adAccountId: unconfigured.id })
    );
    renderWithProviders(<AdPerformanceView />);

    openDropdown(screen.getByText("Switch ad account").closest("button")!);
    const menu = screen.getByRole("menu");
    expect(within(menu).queryByText(unconfigured.name)).toBeNull();

    const configured = seed.ad_accounts.find((a: { status: string }) => a.status === "configured")!;
    fireEvent.click(within(menu).getByText(configured.name));
    expect(screen.queryByText("Switch ad account")).toBeNull();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).adAccountId).toBe(configured.id);
  });
});
