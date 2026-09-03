// ─── Sidebar navigation + inline account picker regression tests ──────
// Covers: navTree data integrity, the expanded sidebar (a section is ONE
// link and a click is the navigation; nothing expands in place — its pages
// branch out BESIDE the sidebar on intent, a 0.7 s dwell or focus), the
// collapsed rail (the same branch beside its icons), the collapse toggle,
// and the inline ad account picker.

import { withUnconfiguredAccount } from "@/test-fixtures/unconfigured";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, within, act } from "@testing-library/react";
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
import { Sidebar, OPEN_DWELL_MS, CLOSE_GRACE_MS } from "../Sidebar";
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

function sectionByLabel(label: string) {
  const s = navTree.find((x) => x.label === label);
  if (!s) throw new Error(`no section labelled ${label}`);
  return s;
}

/** The expanded-mode section row: one link, carrying aria-expanded for its branch. */
function sectionHeaderLink(container: HTMLElement, label: string): HTMLElement {
  const id = sectionByLabel(label).id;
  const li = within(container).getAllByTestId("nav-section").find((e) => e.getAttribute("data-section-id") === id);
  if (!li) throw new Error(`No section header found for "${label}"`);
  return li.querySelector(":scope > a")!;
}

/** The branch beside the sidebar for a section, or null when it is folded. */
function branchFor(label: string): HTMLElement | null {
  const id = sectionByLabel(label).id;
  return screen.queryAllByTestId("nav-flyout").find((e) => e.getAttribute("data-section-id") === id) ?? null;
}

/** Whether a section's branch is out — read from the row, because a folding branch stays in the DOM for its exit animation. */
function branchOut(container: HTMLElement, label: string): boolean {
  return sectionHeaderLink(container, label).getAttribute("aria-expanded") === "true";
}

/** The pages inside the branch of `label` — throws when the branch is folded. */
function branchPages(label: string): HTMLElement {
  const b = branchFor(label);
  if (!b) throw new Error(`the ${label} branch is not out`);
  return within(b).getByRole("list");
}

function railItem(label: string): HTMLAnchorElement {
  const id = sectionByLabel(label).id;
  const el = screen.getAllByTestId("rail-item").find((e) => e.getAttribute("data-section-id") === id);
  if (!el) throw new Error(`no rail item for ${label}`);
  return el as HTMLAnchorElement;
}

const flyoutFor = branchFor;

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
      group: "workspace" as const,
      purpose: "A synthetic section",
      children: [{ id: "x-a", label: "A", to: "/app/x/a" }],
    };
    expect(sectionLandingRoute(synthetic)).toBe("/app/x/a");
  });
});

// ─── Expanded sidebar (default on load) ───────────────────────────────


// ─── Expanded mode: one link per section, pages on intent ────────────────

describe("Sidebar section headers (expanded mode)", () => {
  it("sidebar is expanded by default — shows section labels and the collapse button", () => {
    const { container } = renderExpanded();
    expect(within(container).getByText("Analysis")).toBeTruthy();
    expect(within(container).getByLabelText("Collapse sidebar")).toBeTruthy();
  });

  it("the section header is ONE link to the command center — no chevron button", () => {
    const { container } = renderExpanded();
    const analysis = sectionByLabel("Analysis");
    const link = sectionHeaderLink(container, "Analysis");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(sectionLandingRoute(analysis));
    expect(within(container).queryByLabelText(/Expand Analysis pages|Collapse Analysis pages/)).toBeNull();
    expect(container.querySelectorAll("nav button").length).toBe(0);
  });

  it("clicking a section label navigates to its command center at once — a hover never has to finish first", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderExpanded();
      const li = sectionHeaderLink(container, "Listen").closest("li")!;
      fireEvent.pointerEnter(li, { clientX: 40, clientY: 120 });
      act(() => { vi.advanceTimersByTime(120); });
      fireEvent.click(sectionHeaderLink(container, "Listen"));
      expect(window.location.pathname).toBe(sectionLandingRoute(sectionByLabel("Listen")));
      // The navigation ended the intent: the pending dwell opens nothing.
      act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS + 50); });
      expect(branchFor("Listen")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("nothing expands inside the sidebar: no page list in the nav, even for the section the reader is on", () => {
    const analysis = sectionByLabel("Analysis");
    window.history.replaceState({}, "", analysis.children![1]!.to);
    const { container } = renderExpanded();
    expect(container.querySelector("nav ul, nav ol ol")).toBeNull();
    expect(within(container).queryByRole("list", { name: /pages$/ })).toBeNull();
    expect(branchFor("Analysis")).toBeNull();
    expect(sectionHeaderLink(container, "Analysis").getAttribute("aria-expanded")).toBe("false");
  });

  it("a pointer passing over a section opens nothing; one that rests on it for the dwell slides its pages out beside the sidebar, and the branch follows the pointer", () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState({}, "", sectionLandingRoute(sectionByLabel("Analysis"))!);
      const { container } = renderExpanded();
      fireEvent.pointerEnter(sectionHeaderLink(container, "Strategy").closest("li")!, { clientX: 40, clientY: 300 });
      act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS - 40); });
      expect(branchFor("Strategy")).toBeNull();
      act(() => { vi.advanceTimersByTime(60); });
      const branch = branchFor("Strategy")!;
      expect(branch).toBeTruthy();
      expect(sectionHeaderLink(container, "Strategy").getAttribute("aria-expanded")).toBe("true");
      expect(sectionHeaderLink(container, "Strategy").getAttribute("aria-controls")).toBe(branch.id);
      // Drawn as a branch: a connector back to the row, the section as a
      // node, the pages hanging off it.
      expect(within(branch).getByTestId("nav-flyout-connector")).toBeTruthy();
      expect(within(branch).getByTestId("nav-flyout-node").textContent).toContain("Strategy");
      expect(within(branchPages("Strategy")).getAllByRole("link").length).toBeGreaterThan(0);
      // The branch lies to the RIGHT of the sidebar, never inside it.
      expect(container.querySelector("nav")!.contains(branch)).toBe(false);
      expect(parseInt(branch.style.left, 10)).toBeGreaterThan(200);
      // A row that lands under a RESTING pointer must not open: no travel, no follow.
      fireEvent.pointerEnter(sectionHeaderLink(container, "Exports").closest("li")!, { clientX: 40, clientY: 300 });
      expect(branchFor("Exports")).toBeNull();
      expect(branchFor("Strategy")).toBeTruthy();
      // Once out by intent, MOVING to another section moves the branch at once.
      fireEvent.pointerEnter(sectionHeaderLink(container, "Creative").closest("li")!, { clientX: 40, clientY: 340 });
      expect(branchFor("Creative")).toBeTruthy();
      expect(branchOut(container, "Creative")).toBe(true);
      expect(branchOut(container, "Strategy")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the branch is part of the sidebar: moving into it does not fold it; leaving the sidebar folds it after a short grace", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderExpanded();
      fireEvent.pointerEnter(sectionHeaderLink(container, "MST").closest("li")!, { clientX: 40, clientY: 420 });
      act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS + 10); });
      const branch = branchFor("MST")!;
      expect(branch).toBeTruthy();
      expect(screen.getByTestId("workspace-sidebar").contains(branch)).toBe(true);
      fireEvent.pointerLeave(screen.getByTestId("workspace-sidebar"));
      act(() => { vi.advanceTimersByTime(CLOSE_GRACE_MS - 40); });
      expect(branchOut(container, "MST")).toBe(true);
      act(() => { vi.advanceTimersByTime(60); });
      expect(branchOut(container, "MST")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keyboard focus on a section slides its branch out at once; Right arrow walks into it; Escape folds it and returns focus", () => {
    const { container } = renderExpanded();
    const link = sectionHeaderLink(container, "Creative");
    act(() => { link.focus(); });
    expect(branchFor("Creative")).toBeTruthy();
    expect(branchOut(container, "Creative")).toBe(true);
    fireEvent.keyDown(link, { key: "Escape" });
    expect(branchOut(container, "Creative")).toBe(false);
    expect(document.activeElement).toBe(link);
    // The branch is not a sink: focus leaving the sidebar folds it too.
    // (Escape handed focus back to the link, so leave and return to re-open.)
    act(() => { link.blur(); link.focus(); });
    expect(branchOut(container, "Creative")).toBe(true);
    act(() => { link.blur(); });
    expect(branchOut(container, "Creative")).toBe(false);
  });

  it("a page on the branch navigates on click", () => {
    const analysis = sectionByLabel("Analysis");
    const { container } = renderExpanded();
    act(() => { sectionHeaderLink(container, "Analysis").focus(); });
    const page = analysis.children!.find((c) => !c.hidden)!;
    fireEvent.click(within(branchPages("Analysis")).getByText(page.label));
    expect(window.location.pathname).toBe(page.to);
  });

  it("on touch, the first tap on a section opens its branch and the tap after that navigates", () => {
    const { container } = renderExpanded();
    const link = sectionHeaderLink(container, "Strategy");
    fireEvent.pointerDown(link, { pointerType: "touch" });
    fireEvent.click(link);
    expect(branchFor("Strategy")).toBeTruthy();
    expect(window.location.pathname).toBe("/");
    fireEvent.pointerDown(link, { pointerType: "touch" });
    fireEvent.click(link);
    expect(window.location.pathname).toBe(sectionLandingRoute(sectionByLabel("Strategy")));
  });

  it("a hidden nav child renders no page on the branch, and a visible one does", () => {
    const { container } = renderExpanded();
    act(() => { sectionHeaderLink(container, "Analysis").focus(); });
    const list = branchPages("Analysis");
    // Engagement Funnel stays hidden — it belongs to Analysis for crumbs and
    // Back, but it is reached from the page that frames it.
    expect(within(list).queryByText("Engagement Funnel")).toBeNull();
    // Findings was hidden too until the owner decided otherwise (2026-09-03):
    // its producer runs for every configured account, so a page reachable
    // only from one cross-link was a page most readers never found.
    expect(within(list).getByText("Findings")).toBeTruthy();
    // The tree is what decides, not this test: every non-hidden child of
    // Analysis is on the branch and no hidden one is.
    const analysis = sectionByLabel("Analysis");
    for (const child of analysis.children ?? []) {
      const found = within(list).queryByText(child.label);
      expect(Boolean(found), `${child.label} (hidden: ${!!child.hidden})`).toBe(!child.hidden);
    }
  });

  it("what a module or page is for is its tooltip, never a line in the sidebar or on the branch", () => {
    const analysis = sectionByLabel("Analysis");
    window.history.replaceState({}, "", analysis.children![1]!.to);
    const { container } = renderExpanded();
    expect(sectionHeaderLink(container, "Analysis").getAttribute("title")).toContain(analysis.purpose);
    act(() => { sectionHeaderLink(container, "Analysis").focus(); });
    const page = analysis.children![1]!;
    const row = within(branchPages("Analysis")).getByText(page.label).closest("a")!;
    expect(row.getAttribute("title")).toContain(page.purpose!);
    expect(screen.queryByText(analysis.purpose)).toBeNull();
    expect(screen.queryByText(page.purpose!)).toBeNull();
    expect(screen.queryByTestId("nav-section-purpose")).toBeNull();
    expect(screen.queryByTestId("nav-child-purpose")).toBeNull();
  });

  it("section link carries aria-current when its command center is active", () => {
    const analysis = sectionByLabel("Analysis");
    window.history.replaceState({}, "", sectionLandingRoute(analysis)!);
    const { container } = renderExpanded();
    expect(sectionHeaderLink(container, "Analysis").getAttribute("aria-current")).toBe("page");
  });
});

// ─── Expand / collapse ────────────────────────────────────────────────────

describe("Sidebar expand/collapse toggle", () => {
  it("collapse button collapses to the 56px icon rail", () => {
    const { container } = renderExpanded();
    fireEvent.click(within(container).getByLabelText("Collapse sidebar"));
    const aside = screen.getByTestId("workspace-sidebar");
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    expect(aside.className).toContain("w-[56px]");
    expect(within(container).queryByText("Account Overview")).toBeNull();
  });

  it("expand button restores the full sidebar", () => {
    const { container } = renderCollapsed();
    fireEvent.click(within(container).getByLabelText("Expand sidebar"));
    expect(screen.getByTestId("workspace-sidebar").getAttribute("data-collapsed")).toBe("false");
    expect(within(container).getByText("Account Overview")).toBeTruthy();
  });

  it("persists collapsed state to localStorage", () => {
    const { container } = renderExpanded();
    fireEvent.click(within(container).getByLabelText("Collapse sidebar"));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("1");
    fireEvent.click(within(container).getByLabelText("Expand sidebar"));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("0");
  });
});

// ─── Collapsed rail: icons that navigate, the same branch on intent ──────

describe("Sidebar collapsed icon rail", () => {
  it("renders one link per visible section, each a link to its command center", () => {
    renderCollapsed();
    expect(screen.getAllByTestId("rail-item")).toHaveLength(navTree.length);
    for (const s of navTree) {
      expect(railItem(s.label).getAttribute("aria-label")).toBe(s.label);
      expect(railItem(s.label).getAttribute("href")).toBe(sectionLandingRoute(s) ?? s.to ?? "#");
      expect(railItem(s.label).getAttribute("title")).toContain(s.purpose);
    }
  });

  it("clicking an icon navigates to the command center", () => {
    renderCollapsed();
    fireEvent.click(railItem("Analysis"));
    expect(window.location.pathname).toBe(sectionLandingRoute(sectionByLabel("Analysis")));
  });

  it("resting on an icon slides the branch out beside the rail; leaving the sidebar folds it after the grace", () => {
    vi.useFakeTimers();
    try {
      renderCollapsed();
      expect(flyoutFor("Analysis")).toBeNull();
      fireEvent.pointerEnter(railItem("Analysis").closest("li")!);
      act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS + 10); });
      const flyout = flyoutFor("Analysis")!;
      expect(flyout).toBeTruthy();
      expect(within(flyout).getByText("Ad Performance")).toBeTruthy();
      expect(within(flyout).queryByText(sectionByLabel("Analysis").purpose)).toBeNull();
      // Beside the 56px rail, not beside a 216px panel.
      expect(parseInt(flyout.style.left, 10)).toBeLessThan(60);
      expect(railItem("Analysis").getAttribute("aria-expanded")).toBe("true");
      fireEvent.pointerLeave(screen.getByTestId("workspace-sidebar"));
      act(() => { vi.advanceTimersByTime(CLOSE_GRACE_MS + 10); });
      expect(railItem("Analysis").getAttribute("aria-expanded")).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("focusing an icon slides its branch out at once; a page on the branch navigates", () => {
    renderCollapsed();
    act(() => { railItem("Listen").focus(); });
    const flyout = flyoutFor("Listen")!;
    expect(flyout).toBeTruthy();
    const page = sectionByLabel("Listen").children!.find((c) => !c.hidden)!;
    fireEvent.click(within(flyout).getByText(page.label));
    expect(window.location.pathname).toBe(page.to);
  });

  it("section icon carries aria-current when section route is active", () => {
    window.history.replaceState({}, "", sectionLandingRoute(sectionByLabel("Strategy"))!);
    renderCollapsed();
    expect(railItem("Strategy").getAttribute("aria-current")).toBe("page");
  });

  it("the Action branch shows the real queue and the Soon pill for the agent", () => {
    renderCollapsed();
    act(() => { railItem("Action").focus(); });
    const flyout = flyoutFor("Action")!;
    expect(within(flyout).getByText("Action Queue")).toBeTruthy();
    expect(within(flyout).getByText("Soon")).toBeTruthy();
  });
});

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

// ─── Category definition (2026-09-03) ──────────────────────────────────
// The tree carries what each module is for and where it sits in the IAP
// loop; the sidebar renders the product's shape (Account · IAP loop ·
// Outputs · Workspace), a loop stage on every loop section, and a purpose
// fragment with each opened section and the active page.

describe("navTree category definition", () => {
  it("every section carries a group and a purpose fragment — chrome, never a sentence", () => {
    for (const s of navTree) {
      expect(["home", "loop", "output", "workspace"]).toContain(s.group);
      expect(s.purpose.length).toBeGreaterThan(8);
      expect(s.purpose.length).toBeLessThanOrEqual(56);
      expect(s.purpose.endsWith(".")).toBe(false);
      for (const c of s.children ?? []) {
        expect(c.purpose, `${c.id} purpose`).toBeTruthy();
        expect(c.purpose!.length).toBeLessThanOrEqual(56);
      }
    }
  });

  it("the loop sections carry stages 1…6 in tree order and nothing else does", () => {
    const stages = navTree.filter((s) => s.group === "loop").map((s) => s.loopStage);
    expect(stages).toEqual([1, 2, 3, 4, 5, 6]);
    expect(navTree.filter((s) => s.group !== "loop").every((s) => s.loopStage == null)).toBe(true);
  });
});

describe("Sidebar category definition (expanded mode)", () => {
  it("names the product's shape between groups, in order", () => {
    renderExpanded();
    expect(screen.getAllByTestId("nav-group-label").map((e) => e.textContent)).toEqual([
      "Account", "IAP loop", "Outputs", "Workspace",
    ]);
  });

  it("marks every loop section with its stage", () => {
    renderExpanded();
    expect(screen.getAllByTestId("nav-loop-stage").map((e) => e.textContent)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
});
