// ─── Sidebar navigation + inline account picker regression tests ──────
// Covers: navTree data integrity, the rail (always 56px, never a mode),
// the workspace map it opens on dwell / focus / tap (the flow chart of
// the product, one branch at a time), and the inline ad account picker.

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
import { Sidebar, OPEN_DWELL_MS, CLOSE_GRACE_MS, RAIL_WIDTH } from "../Sidebar";
import { AdPerformanceView } from "@/pages/metrix/analysis/AdPerformanceView";
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


// ─── The rail and the map ───────────────────────────────────────────────
// The rail is 56px of icons and never a mode: nothing collapses, nothing
// expands in the layout, nothing is remembered. The MAP is what dwelling on
// the rail opens — rightwards, over the page — and it draws the product as
// a flow chart: numbered loop nodes on one spine, the focused node's pages
// branching beside it. Focus opens it at once; Escape closes it and hands
// focus back; on touch a tap opens it and a second tap goes through.

function renderSidebar() {
  return renderWithProviders(<Sidebar />);
}

function sectionByLabel(label: string) {
  const s = navTree.find((x) => x.label === label);
  if (!s) throw new Error(`no section labelled ${label}`);
  return s;
}

function railItem(label: string): HTMLAnchorElement {
  const id = sectionByLabel(label).id;
  const el = screen.getAllByTestId("rail-item").find((e) => e.getAttribute("data-section-id") === id);
  if (!el) throw new Error(`no rail item for ${label}`);
  return el as HTMLAnchorElement;
}

function aside(): HTMLElement {
  return screen.getByTestId("workspace-sidebar");
}

function mapIsOpen(): boolean {
  return aside().getAttribute("data-map-open") === "true";
}

/** The branch drawn for a section, if the map currently shows it. */
function branchFor(label: string): HTMLElement | null {
  const id = sectionByLabel(label).id;
  return (
    screen.queryAllByTestId("map-branch").find((e) => e.getAttribute("data-section-id") === id) ?? null
  );
}

/** A touch pointer: hover is unavailable, so the map opens by tap. */
function pretendTouch() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === "(hover: none)",
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

describe("Sidebar rail", () => {
  it("is 56px of one link per visible section, with no expand/collapse control and no width handle", () => {
    renderSidebar();
    expect(aside().style.width).toBe(`${RAIL_WIDTH}px`);
    expect(screen.getAllByTestId("rail-item")).toHaveLength(navTree.length);
    for (const s of navTree) expect(railItem(s.label).getAttribute("aria-label")).toBe(s.label);
    expect(screen.queryByLabelText(/collapse sidebar/i)).toBeNull();
    expect(screen.queryByLabelText(/expand sidebar/i)).toBeNull();
    expect(screen.queryByRole("separator", { name: /sidebar width/i })).toBeNull();
    expect(mapIsOpen()).toBe(false);
    expect(screen.queryByTestId("nav-map")).toBeNull();
  });

  it("a rail item is a real link to the section's command center and navigates on click", () => {
    renderSidebar();
    const analysis = sectionByLabel("Analysis");
    const item = railItem("Analysis");
    expect(item.getAttribute("href")).toBe(sectionLandingRoute(analysis));
    fireEvent.click(item);
    expect(window.location.pathname).toBe(sectionLandingRoute(analysis));
  });

  it("carries aria-current for the section the reader is on, from its command center or any child", () => {
    const analysis = sectionByLabel("Analysis");
    window.history.replaceState({}, "", analysis.children![1]!.to);
    renderSidebar();
    expect(railItem("Analysis").getAttribute("aria-current")).toBe("page");
    expect(railItem("Strategy").getAttribute("aria-current")).toBeNull();
  });

  it("marks the loop sections on one spine and the others not", () => {
    renderSidebar();
    for (const s of navTree) {
      const li = railItem(s.label).closest("li")!;
      expect(li.classList.contains("mx-rail-spine")).toBe(s.loopStage != null);
    }
  });
});

describe("Sidebar map — opening and closing", () => {
  it("a pointer passing over the rail does not open the map; one that rests on it does", () => {
    vi.useFakeTimers();
    try {
      renderSidebar();
      fireEvent.pointerEnter(railItem("Analysis"));
      act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS - 40); });
      expect(mapIsOpen()).toBe(false);
      act(() => { vi.advanceTimersByTime(60); });
      expect(mapIsOpen()).toBe(true);
      expect(screen.getByTestId("nav-map")).toBeTruthy();
      expect(branchFor("Analysis")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaving the sidebar closes a map the pointer opened, after a short grace", () => {
    vi.useFakeTimers();
    try {
      renderSidebar();
      fireEvent.pointerEnter(railItem("Strategy"));
      act(() => { vi.advanceTimersByTime(OPEN_DWELL_MS + 10); });
      expect(mapIsOpen()).toBe(true);
      fireEvent.pointerLeave(aside());
      act(() => { vi.advanceTimersByTime(CLOSE_GRACE_MS - 40); });
      expect(mapIsOpen()).toBe(true);
      act(() => { vi.advanceTimersByTime(60); });
      expect(mapIsOpen()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keyboard focus on a rail item opens the map at once; Escape closes it and hands focus back", () => {
    renderSidebar();
    const item = railItem("Creative");
    act(() => { item.focus(); });
    expect(mapIsOpen()).toBe(true);
    expect(branchFor("Creative")).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("nav-map"), { key: "Escape" });
    expect(mapIsOpen()).toBe(false);
    expect(document.activeElement).toBe(item);
  });

  it("the map is drawn over the page, not in the layout: the rail keeps its width while it is open", () => {
    renderSidebar();
    act(() => { railItem("MST").focus(); });
    expect(aside().style.width).toBe(`${RAIL_WIDTH}px`);
    expect(screen.getByTestId("nav-map").classList.contains("absolute")).toBe(true);
  });

  it("on touch, a tap on a rail item opens the map on that section instead of navigating; the next tap goes through", () => {
    const restore = pretendTouch();
    try {
      renderSidebar();
      const analysis = sectionByLabel("Analysis");
      fireEvent.click(railItem("Analysis"));
      expect(window.location.pathname).toBe("/");
      expect(mapIsOpen()).toBe(true);
      expect(branchFor("Analysis")).toBeTruthy();
      fireEvent.click(railItem("Analysis"));
      expect(window.location.pathname).toBe(sectionLandingRoute(analysis));
    } finally {
      restore();
    }
  });
});

describe("Sidebar map — the flow chart", () => {
  function openOn(label: string) {
    renderSidebar();
    act(() => { railItem(label).focus(); });
    return screen.getByTestId("nav-map");
  }

  it("names the product's shape between groups, in order", () => {
    openOn("Analysis");
    expect(screen.getAllByTestId("nav-group-label").map((e) => e.textContent)).toEqual([
      "Account", "IAP loop", "Outputs", "Workspace",
    ]);
  });

  it("draws every section as a node, the loop stages numbered 1…6 on the spine", () => {
    const map = openOn("Analysis");
    expect(within(map).getAllByTestId("map-node")).toHaveLength(navTree.length);
    expect(within(map).getAllByTestId("nav-loop-stage").map((e) => e.textContent)).toEqual(["1", "2", "3", "4", "5", "6"]);
    for (const s of navTree) {
      const node = within(map).getAllByTestId("map-node").find((e) => e.getAttribute("data-section-id") === s.id)!;
      expect(node.classList.contains("mx-map-spine")).toBe(s.loopStage != null);
    }
  });

  it("the focused node's pages branch beside it, headed by what the module is for; the connector is drawn on that node only", () => {
    const map = openOn("Analysis");
    const analysis = sectionByLabel("Analysis");
    const branch = branchFor("Analysis")!;
    expect(within(branch).getByTestId("nav-section-purpose").textContent).toContain(analysis.purpose);
    const list = within(branch).getByRole("list", { name: "Analysis pages" });
    const labels = within(list).getAllByRole("link").map((a) => a.textContent);
    for (const c of analysis.children!.filter((c) => !c.hidden)) expect(labels.join("|")).toContain(c.label);
    expect(within(map).getAllByTestId("map-connector")).toHaveLength(1);
    expect(within(map).getByTestId("map-connector").closest("[data-section-id]")!.getAttribute("data-section-id")).toBe(analysis.id);
  });

  it("hidden nav children (funnel, findings) render no branch row", () => {
    openOn("Analysis");
    const list = within(branchFor("Analysis")!).getByRole("list", { name: "Analysis pages" });
    expect(within(list).queryByText("Engagement Funnel")).toBeNull();
    expect(within(list).queryByText("Findings")).toBeNull();
  });

  it("resting on another node moves the branch to it", () => {
    const map = openOn("Analysis");
    const strategyNode = within(map).getAllByTestId("map-node").find((e) => e.getAttribute("data-section-id") === sectionByLabel("Strategy").id)!;
    fireEvent.pointerEnter(within(strategyNode).getByRole("link"));
    expect(branchFor("Strategy")).toBeTruthy();
    expect(within(branchFor("Strategy")!).getByRole("list", { name: "Strategy pages" })).toBeTruthy();
  });

  it("a node is a link to its command center; a branch row is a link to its page — each navigates on click", () => {
    const map = openOn("Listen");
    const listen = sectionByLabel("Listen");
    const node = within(map).getAllByTestId("map-node").find((e) => e.getAttribute("data-section-id") === listen.id)!;
    const nodeLink = within(node).getByRole("link");
    expect(nodeLink.getAttribute("href")).toBe(sectionLandingRoute(listen));
    const firstPage = listen.children!.find((c) => !c.hidden)!;
    const row = within(branchFor("Listen")!).getByRole("link", { name: new RegExp(`^${firstPage.label}`) });
    fireEvent.click(row);
    expect(window.location.pathname).toBe(firstPage.to);
  });

  it("the active page says what it proves, on its row only", () => {
    const analysis = sectionByLabel("Analysis");
    const page = analysis.children!.find((c) => !c.hidden && c.purpose)!;
    window.history.replaceState({}, "", page.to);
    openOn("Analysis");
    const purposes = within(branchFor("Analysis")!).getAllByTestId("nav-child-purpose");
    expect(purposes).toHaveLength(1);
    expect(purposes[0]!.textContent).toBe(page.purpose);
  });

  it("shows the Soon pill for the agent and the real queue under Action", () => {
    openOn("Action");
    const list = within(branchFor("Action")!).getByRole("list", { name: "Action pages" });
    expect(within(list).getByText("Action Queue")).toBeTruthy();
    expect(within(list).getByText("Soon")).toBeTruthy();
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

